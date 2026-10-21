/**
 * Cuenta corriente de proveedores (CP-2).
 *
 * Deuda con un proveedor (ARS) =
 *   deuda inicial pendiente (Proveedor.deudaInicial - pagos aplicados a ella)
 * + lo que falta pagar de cada compra confirmada y no cancelada (CP-1)
 * + gastos del proveedor con estadoPago = PENDIENTE.
 *
 * Un pago se aplica primero a la deuda inicial, después a las compras de la
 * más vieja a la más nueva y al final a los gastos pendientes. Un gasto se
 * paga entero (no admite pago parcial).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redondearPesos, saldoPendiente } from "@/lib/compras-pago";

type Db = Prisma.TransactionClient;

const TOLERANCIA = 0.005;
export const SIN_ESPECIFICAR = "Sin especificar";
/** Valor de la URL para las compras sin proveedor. */
export const ID_SIN_ESPECIFICAR = "sin-especificar";

/** Lee el :id de la URL: número, null (sin especificar) o undefined si es inválido. */
export function leerProveedorId(raw: string): number | null | undefined {
  if (raw === ID_SIN_ESPECIFICAR) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
const WHERE_COMPRA_REAL = { confirmada: true, cancelada: false } satisfies Prisma.CompraWhereInput;

// ---------- Cálculo puro ----------

export type CompraConSaldo = {
  id: number;
  numero: number;
  totalARS: number;
  montoPagado: number;
  /** montoPagado tal como está en la base (aplicarPago modifica montoPagado). */
  montoPagadoInicial: number;
  cuentaId: number | null;
  cotizacionUsada: number | null;
};

export type GastoPendiente = { id: number; concepto: string; monto: number };

export type EstadoDeuda = {
  /** Deuda inicial que todavía no se pagó (nunca negativa). */
  deudaInicial: number;
  /** Compras con deuda, de la más vieja a la más nueva. */
  compras: CompraConSaldo[];
  /** Gastos pendientes, del más viejo al más nuevo. */
  gastos: GastoPendiente[];
};

export type Aplicacion = {
  /** Qué se pagó: la deuda inicial, una compra o un gasto. */
  tipo: "INICIAL" | "COMPRA" | "GASTO";
  compra: CompraConSaldo | null;
  gasto: GastoPendiente | null;
  monto: number;
};

export function deudaTotal(e: EstadoDeuda) {
  return redondearPesos(
    e.deudaInicial +
      e.compras.reduce((a, c) => a + saldoPendiente(c), 0) +
      e.gastos.reduce((a, g) => a + g.monto, 0)
  );
}

/**
 * Reparte `monto` entre la deuda inicial y las compras (más viejas primero).
 * MODIFICA `estado` (baja lo que se va pagando) para poder encadenar varias
 * cuentas en el mismo pago.
 */
export function aplicarPago(estado: EstadoDeuda, monto: number) {
  let restante = redondearPesos(monto);
  const aplicaciones: Aplicacion[] = [];

  if (estado.deudaInicial > TOLERANCIA && restante > TOLERANCIA) {
    const m = Math.min(restante, estado.deudaInicial);
    aplicaciones.push({ tipo: "INICIAL", compra: null, gasto: null, monto: redondearPesos(m) });
    estado.deudaInicial = redondearPesos(estado.deudaInicial - m);
    restante = redondearPesos(restante - m);
  }

  for (const c of estado.compras) {
    if (restante <= TOLERANCIA) break;
    const saldo = saldoPendiente(c);
    if (saldo <= TOLERANCIA) continue;
    const m = Math.min(restante, saldo);
    aplicaciones.push({ tipo: "COMPRA", compra: c, gasto: null, monto: redondearPesos(m) });
    c.montoPagado = redondearPesos(c.montoPagado + m);
    restante = redondearPesos(restante - m);
  }

  // Gastos pendientes: solo se pagan enteros.
  const pendientes: GastoPendiente[] = [];
  for (const g of estado.gastos) {
    if (restante >= g.monto - TOLERANCIA && restante > TOLERANCIA) {
      const m = Math.min(restante, g.monto);
      aplicaciones.push({ tipo: "GASTO", compra: null, gasto: g, monto: redondearPesos(m) });
      restante = redondearPesos(restante - m);
    } else {
      pendientes.push(g);
    }
  }
  estado.gastos = pendientes;

  return { aplicaciones, sobrante: restante };
}

/** Deuda de un proveedor a partir de sus datos (sin consultas extra). */
export function deudaDeProveedor(p: {
  deudaInicial: number;
  pagos: { aplicadoDeudaInicial: number }[];
  compras: { totalARS: number | null; montoPagado: number }[];
  gastos: { monto: number }[];
}) {
  const inicial = p.deudaInicial - p.pagos.reduce((a, x) => a + x.aplicadoDeudaInicial, 0);
  return redondearPesos(
    inicial + p.compras.reduce((a, c) => a + saldoPendiente(c), 0) + p.gastos.reduce((a, g) => a + g.monto, 0)
  );
}

/** `select` para calcular la deuda con deudaDeProveedor(). */
export const SELECT_DEUDA_PROVEEDOR = {
  deudaInicial: true,
  pagos: { select: { aplicadoDeudaInicial: true } },
  compras: { where: WHERE_COMPRA_REAL, select: { totalARS: true, montoPagado: true } },
  gastos: { where: { estadoPago: "PENDIENTE" as const }, select: { monto: true } },
} satisfies Prisma.ProveedorSelect;

// ---------- Consultas ----------

/** Estado para pagar (dentro de la transacción del pago). null = no existe. */
export async function obtenerEstadoDeuda(
  db: Db,
  empresaId: number,
  proveedorId: number | null,
  /** Si viene, el estado incluye solo esa compra (pago desde el listado de Compras). */
  soloCompraId?: number
) {
  // proveedorId null = compras "Sin especificar" (sin proveedor): sin deuda inicial ni gastos.
  const prov =
    proveedorId == null
      ? { id: 0, nombre: SIN_ESPECIFICAR, deudaInicial: 0, pagos: [] as { aplicadoDeudaInicial: number }[] }
      : await db.proveedor.findFirst({
          where: { id: proveedorId, empresaId },
          select: { id: true, nombre: true, deudaInicial: true, pagos: { select: { aplicadoDeudaInicial: true } } },
        });
  if (!prov) return null;

  const compras = await db.compra.findMany({
    where: { ...WHERE_COMPRA_REAL, proveedorId, empresaId, ...(soloCompraId != null ? { id: soloCompraId } : {}) },
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
    select: { id: true, numero: true, totalARS: true, montoPagado: true, cuentaId: true, cotizacionUsada: true },
  });
  const gastos =
    proveedorId == null || soloCompraId != null
      ? []
      : await db.gasto.findMany({
          where: { proveedorId, empresaId, estadoPago: "PENDIENTE" },
          orderBy: [{ fecha: "asc" }, { id: "asc" }],
          select: { id: true, concepto: true, monto: true },
        });

  const inicialPagado = prov.pagos.reduce((a, x) => a + x.aplicadoDeudaInicial, 0);
  const estado: EstadoDeuda = {
    deudaInicial: soloCompraId != null ? 0 : Math.max(0, redondearPesos(prov.deudaInicial - inicialPagado)),
    compras: compras
      .map((c) => ({ ...c, totalARS: c.totalARS ?? 0, montoPagadoInicial: c.montoPagado }))
      .filter((c) => saldoPendiente(c) > TOLERANCIA),
    gastos,
  };
  return { proveedor: { id: prov.id, nombre: prov.nombre }, estado };
}

export type EventoCuentaCorriente = {
  id: string;
  fecha: string; // ISO
  tipo: "cargo" | "abono";
  label: string;
  sublabel: string;
  monto: number;
  saldo: number; // saldo después del evento
};

/** Historial: compras (cargo), pagos (abono) y saldo acumulado. */
export async function obtenerCuentaCorriente(empresaId: number, proveedorId: number | null) {
  const PAGOS_SELECT = {
    id: true,
    fecha: true,
    montoARS: true,
    aplicadoDeudaInicial: true,
    compras: { select: { montoARS: true, compra: { select: { numero: true } } } },
    movimientosCaja: {
      select: {
        cuenta: { select: { nombre: true } },
        gasto: { select: { id: true, concepto: true, monto: true, fecha: true } },
      },
    },
  } satisfies Prisma.PagoProveedorSelect;
  const COMPRAS_SELECT = {
    id: true,
    numero: true,
    fecha: true,
    totalARS: true,
    montoPagado: true,
    pagosProveedor: { select: { montoARS: true } },
  } satisfies Prisma.CompraSelect;
  const ORDEN_COMPRAS = [{ fecha: "asc" as const }, { id: "asc" as const }];

  const prov =
    proveedorId == null
      ? {
          id: 0,
          nombre: SIN_ESPECIFICAR,
          deudaInicial: 0,
          createdAt: new Date(0),
          pagos: await prisma.pagoProveedor.findMany({
            where: { empresaId, proveedorId: null },
            orderBy: { fecha: "asc" },
            select: PAGOS_SELECT,
          }),
          gastos: [] as { id: number; concepto: string; monto: number; fecha: Date }[],
          compras: await prisma.compra.findMany({
            where: { ...WHERE_COMPRA_REAL, empresaId, proveedorId: null },
            orderBy: ORDEN_COMPRAS,
            select: COMPRAS_SELECT,
          }),
        }
      : await prisma.proveedor.findFirst({
          where: { id: proveedorId, empresaId },
          select: {
            id: true,
            nombre: true,
            deudaInicial: true,
            createdAt: true,
            pagos: { orderBy: { fecha: "asc" }, select: PAGOS_SELECT },
            gastos: {
              where: { estadoPago: "PENDIENTE" },
              orderBy: { fecha: "asc" },
              select: { id: true, concepto: true, monto: true, fecha: true },
            },
            compras: { where: WHERE_COMPRA_REAL, orderBy: ORDEN_COMPRAS, select: COMPRAS_SELECT },
          },
        });
  if (!prov) return null;

  type Crudo = Omit<EventoCuentaCorriente, "saldo"> & { orden: number };
  const crudos: Crudo[] = [];

  if (prov.deudaInicial > 0) {
    crudos.push({
      id: "inicial", orden: -Infinity, fecha: prov.createdAt.toISOString(), tipo: "cargo",
      label: "Deuda inicial", sublabel: "Saldo anterior al sistema", monto: prov.deudaInicial,
    });
  }

  for (const c of prov.compras) {
    const total = c.totalARS ?? 0;
    crudos.push({
      id: `compra-${c.id}`, orden: c.fecha.getTime(), fecha: c.fecha.toISOString(), tipo: "cargo",
      label: `Compra #${c.numero}`, sublabel: "", monto: total,
    });
    // Lo pagado al confirmar = montoPagado menos lo aplicado después por pagos a proveedor.
    const posterior = c.pagosProveedor.reduce((a, x) => a + x.montoARS, 0);
    const alConfirmar = redondearPesos(c.montoPagado - posterior);
    if (alConfirmar > TOLERANCIA) {
      crudos.push({
        id: `compra-pago-${c.id}`, orden: c.fecha.getTime() + 1, fecha: c.fecha.toISOString(), tipo: "abono",
        label: `Pago de la compra #${c.numero}`, sublabel: "Al confirmar la compra", monto: alConfirmar,
      });
    }
  }

  // Gastos: los pendientes y los que se pagaron con un pago a proveedor.
  const gastosCargo = new Map<number, { concepto: string; monto: number; fecha: Date }>();
  for (const g of prov.gastos) gastosCargo.set(g.id, g);
  for (const p of prov.pagos) for (const m of p.movimientosCaja) if (m.gasto) gastosCargo.set(m.gasto.id, m.gasto);
  for (const [id, g] of gastosCargo) {
    crudos.push({
      id: `gasto-${id}`, orden: g.fecha.getTime(), fecha: g.fecha.toISOString(), tipo: "cargo",
      label: `Gasto: ${g.concepto}`, sublabel: "", monto: g.monto,
    });
  }

  for (const p of prov.pagos) {
    const cuentas = [...new Set(p.movimientosCaja.map((m) => m.cuenta.nombre))].join(", ");
    const partes = [
      p.aplicadoDeudaInicial > TOLERANCIA ? "deuda inicial" : null,
      ...p.compras.map((x) => `compra #${x.compra.numero}`),
      ...new Set(p.movimientosCaja.filter((m) => m.gasto).map((m) => `gasto "${m.gasto!.concepto}"`)),
    ].filter(Boolean);
    crudos.push({
      id: `pago-${p.id}`, orden: p.fecha.getTime() + 2, fecha: p.fecha.toISOString(), tipo: "abono",
      label: "Pago a proveedor",
      sublabel: [cuentas && `Desde ${cuentas}`, partes.length ? `Aplicado a: ${partes.join(", ")}` : ""].filter(Boolean).join(" · "),
      monto: p.montoARS,
    });
  }

  crudos.sort((a, b) => (a.orden === b.orden ? 0 : a.orden < b.orden ? -1 : 1));
  let saldo = 0;
  const eventos: EventoCuentaCorriente[] = crudos.map(({ orden: _o, ...e }) => {
    saldo = redondearPesos(saldo + (e.tipo === "cargo" ? e.monto : -e.monto));
    return { ...e, saldo };
  });

  return { proveedor: { id: prov.id, nombre: prov.nombre }, saldo, eventos };
}

/** Deuda total con proveedores y los que más se les debe (inicio / reportes). */
export async function resumenDeudaProveedores(empresaId: number, top = 5) {
  const proveedores = await prisma.proveedor.findMany({
    where: { empresaId },
    select: { id: true, nombre: true, ...SELECT_DEUDA_PROVEEDOR },
  });
  const sinProveedor = await prisma.compra.findMany({
    where: { ...WHERE_COMPRA_REAL, empresaId, proveedorId: null },
    select: { totalARS: true, montoPagado: true },
  });
  const conDeuda = [
    ...proveedores.map((p) => ({ id: p.id, nombre: p.nombre, deuda: deudaDeProveedor(p) })),
    {
      id: 0,
      nombre: SIN_ESPECIFICAR,
      deuda: redondearPesos(sinProveedor.reduce((a, c) => a + saldoPendiente(c), 0)),
    },
  ]
    .filter((p) => p.deuda > 0.5)
    .sort((a, b) => b.deuda - a.deuda);
  return {
    total: redondearPesos(conDeuda.reduce((a, p) => a + p.deuda, 0)),
    cantidad: conDeuda.length,
    top: conDeuda.slice(0, top),
  };
}
