import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { redondearPesos, saldoPendiente } from "@/lib/compras-pago";
import { SIN_ESPECIFICAR } from "@/lib/cuenta-corriente-proveedor";

type Bucket = "0-30" | "31-60" | "61-90" | "90+";

export type ProveedorDeudaItem = {
  /** Valor para la URL de la cuenta corriente ("sin-especificar" para las compras sin proveedor). */
  proveedorId: string;
  nombre: string;
  telefono: string | null;
  pendienteARS: number;
  /** Días desde la deuda más vieja que todavía no se pagó. */
  diasDesdeMasVieja: number;
  bucket: Bucket;
};

export type CuentasPorPagarData = {
  totalPendienteARS: number;
  buckets: { label: Bucket; totalARS: number; cantidad: number }[];
  proveedores: ProveedorDeudaItem[];
};

function bucketDe(dias: number): Bucket {
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  return "90+";
}

const DIA_MS = 1000 * 60 * 60 * 24;

/**
 * Cuentas por pagar: lo que se le debe a cada proveedor (deuda inicial + compras
 * confirmadas con saldo + gastos pendientes) y desde cuándo. Es de toda la empresa,
 * igual que la pantalla Proveedores y la tarjeta de Inicio.
 */
export async function obtenerCuentasPorPagar(): Promise<CuentasPorPagarData> {
  const empresaId = await obtenerEmpresaIdActual();
  const ahora = Date.now();
  const diasDesde = (f: Date) => Math.max(0, Math.floor((ahora - f.getTime()) / DIA_MS));

  const proveedores = await prisma.proveedor.findMany({
    where: { empresaId },
    select: {
      id: true,
      nombre: true,
      telefono: true,
      deudaInicial: true,
      createdAt: true,
      pagos: { select: { aplicadoDeudaInicial: true } },
      compras: {
        where: { confirmada: true, cancelada: false },
        select: { totalARS: true, montoPagado: true, fecha: true },
      },
      gastos: { where: { estadoPago: "PENDIENTE" }, select: { monto: true, fecha: true } },
    },
  });
  const comprasSinProveedor = await prisma.compra.findMany({
    where: { empresaId, proveedorId: null, confirmada: true, cancelada: false },
    select: { totalARS: true, montoPagado: true, fecha: true },
  });

  const items: ProveedorDeudaItem[] = [];

  for (const p of proveedores) {
    const inicial = Math.max(0, redondearPesos(p.deudaInicial - p.pagos.reduce((a, x) => a + x.aplicadoDeudaInicial, 0)));
    const fechas: Date[] = [];
    let pendiente = inicial;
    if (inicial > 0.5) fechas.push(p.createdAt);
    for (const c of p.compras) {
      const s = saldoPendiente(c);
      if (s > 0.5) {
        pendiente += s;
        fechas.push(c.fecha);
      }
    }
    for (const g of p.gastos) {
      pendiente += g.monto;
      fechas.push(g.fecha);
    }
    pendiente = redondearPesos(pendiente);
    if (pendiente < 0.5) continue;
    const masVieja = Math.min(...fechas.map((f) => f.getTime()));
    const dias = diasDesde(new Date(masVieja));
    items.push({
      proveedorId: String(p.id),
      nombre: p.nombre,
      telefono: p.telefono,
      pendienteARS: pendiente,
      diasDesdeMasVieja: dias,
      bucket: bucketDe(dias),
    });
  }

  const conSaldo = comprasSinProveedor.filter((c) => saldoPendiente(c) > 0.5);
  if (conSaldo.length > 0) {
    const pendiente = redondearPesos(conSaldo.reduce((a, c) => a + saldoPendiente(c), 0));
    const dias = diasDesde(new Date(Math.min(...conSaldo.map((c) => c.fecha.getTime()))));
    items.push({
      proveedorId: "sin-especificar",
      nombre: SIN_ESPECIFICAR,
      telefono: null,
      pendienteARS: pendiente,
      diasDesdeMasVieja: dias,
      bucket: bucketDe(dias),
    });
  }

  items.sort((a, b) => b.pendienteARS - a.pendienteARS);

  const buckets = (["0-30", "31-60", "61-90", "90+"] as const).map((label) => {
    const en = items.filter((i) => i.bucket === label);
    return { label, totalARS: redondearPesos(en.reduce((a, i) => a + i.pendienteARS, 0)), cantidad: en.length };
  });

  return {
    totalPendienteARS: redondearPesos(items.reduce((a, i) => a + i.pendienteARS, 0)),
    buckets,
    proveedores: items,
  };
}
