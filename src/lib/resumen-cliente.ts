import { prisma } from "@/lib/prisma";
import { montoARSDePago } from "@/lib/currency";
import { inicioDiaAR, siguienteDiaAR } from "@/lib/timezone";

/**
 * Resumen de la cuenta corriente de un cliente (issue #83), como el de una
 * tarjeta: qué debía al empezar el período, qué compró, qué pagó y cuánto debe.
 * El período puede ser un mes, un rango de fechas o "desde que debe" (desde la
 * última vez que tuvo la cuenta en cero hasta hoy).
 *
 * La deuda se calcula IGUAL que en Clientes (src/lib/clientes.ts,
 * getDeudaPorCliente): por cada venta no anulada, max(0, total − pagado),
 * pero "a una fecha": solo cuentan las ventas y los pagos hasta ese momento.
 * Así el saldo final de un período que llega a hoy coincide con la deuda que muestra la
 * pantalla de Clientes.
 */

/** Pagos hechos a menos de esto de la venta se muestran como "pagado en el momento". */
const MARGEN_PAGO_EN_EL_MOMENTO_MS = 5 * 60 * 1000;
/** Pagos con esta diferencia entre sí se juntan en una sola fila (un cobro repartido en varias ventas). */
const MARGEN_MISMO_COBRO_MS = 10 * 1000;
const AJUSTE = "Ajuste manual de deuda";

export type ItemResumen = { cantidad: number; nombre: string; importe: number };

export type MovimientoResumen =
  | {
      tipo: "compra";
      fecha: Date;
      ventaNumero: number | null;
      esAjuste: boolean;
      items: ItemResumen[];
      /** Total de la compra (lo que suma a la deuda). */
      cargo: number;
      /** Lo que pagó en el momento de la compra. */
      pagadoEnElMomento: number;
      saldo: number;
    }
  | { tipo: "pago"; fecha: Date; detalle: string; monto: number; saldo: number };

/** Cómo se elige el período del resumen. */
export type PeriodoResumen =
  | { tipo: "mes"; mes: string } // "2026-09"
  | { tipo: "rango"; desde: string; hasta: string } // "2026-09-01" … "2026-09-15", ambos días incluidos
  | { tipo: "deuda" }; // desde que empezó la deuda actual (la última vez que estuvo al día) hasta hoy

export type ResumenCuenta = {
  cliente: { id: number; nombre: string; telefono: string | null; direccion: string | null; documento: string | null };
  tipo: PeriodoResumen["tipo"];
  /** "2026-09" si es por mes. */
  mes: string | null;
  desde: Date;
  /** Fin del período (exclusivo). Si llega a hoy, es el momento en que se generó. */
  hasta: Date;
  /** El período llega hasta hoy (mes en curso, rango hasta hoy o "desde que debe"). */
  hastaHoy: boolean;
  saldoAnterior: number;
  movimientos: MovimientoResumen[];
  totalCompras: number;
  totalPagos: number;
  saldoFinal: number;
};
/** @deprecated nombre viejo, se mantiene por compatibilidad. */
export type ResumenMensual = ResumenCuenta;

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** "2026-09-15" válido (incluye que el día exista: no 31/09). */
export function esFechaValida(fecha: string): boolean {
  if (!FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** "2026-10" válido → { desde, hastaMes }; null si no es un mes válido. */
export function rangoDeMes(mes: string): { desde: Date; hastaMes: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (!m) return null;
  const anio = Number(m[1]);
  const numMes = Number(m[2]);
  const siguiente = numMes === 12 ? `${anio + 1}-01` : `${anio}-${String(numMes + 1).padStart(2, "0")}`;
  return { desde: inicioDiaAR(`${mes}-01`), hastaMes: inicioDiaAR(`${siguiente}-01`) };
}

/**
 * Valida el período y devuelve sus límites (sin tocar la base). Para "deuda"
 * el inicio depende de los movimientos, así que se calcula después.
 */
export function validarPeriodo(
  periodo: PeriodoResumen,
  ahora: Date = new Date()
): { ok: true; desde: Date | null; hasta: Date } | { ok: false; error: string } {
  if (periodo.tipo === "deuda") return { ok: true, desde: null, hasta: ahora };
  if (periodo.tipo === "mes") {
    const r = rangoDeMes(periodo.mes);
    if (!r) return { ok: false, error: "Mes inválido (usá AAAA-MM)." };
    if (r.desde > ahora) return { ok: false, error: "Ese mes todavía no empezó." };
    return { ok: true, desde: r.desde, hasta: r.hastaMes < ahora ? r.hastaMes : ahora };
  }
  if (!esFechaValida(periodo.desde) || !esFechaValida(periodo.hasta)) {
    return { ok: false, error: "Fechas inválidas (usá AAAA-MM-DD)." };
  }
  if (periodo.desde > periodo.hasta) return { ok: false, error: "La fecha \"desde\" es posterior a \"hasta\"." };
  const desde = inicioDiaAR(periodo.desde);
  if (desde > ahora) return { ok: false, error: "Ese período todavía no empezó." };
  const finDia = inicioDiaAR(siguienteDiaAR(periodo.hasta));
  return { ok: true, desde, hasta: finDia < ahora ? finDia : ahora };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function medioDePago(tipoCuenta: string) {
  return tipoCuenta.startsWith("BANCO") ? "transferencia" : "efectivo";
}

export async function obtenerResumen(
  empresaId: number,
  clienteId: number,
  periodo: PeriodoResumen,
  ahora: Date = new Date()
): Promise<ResumenCuenta | null> {
  const limites = validarPeriodo(periodo, ahora);
  if (!limites.ok) return null;
  const hasta = limites.hasta;

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId },
    select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true, tipoDocumento: true, numeroDocumento: true },
  });
  if (!cliente) return null;

  // Todas las ventas del cliente hasta el fin del período (las anteriores hacen
  // falta para el saldo anterior). Las anuladas y los pedidos cancelados no cuentan.
  const ventas = await prisma.venta.findMany({
    where: { empresaId, clienteId, fecha: { lt: hasta }, estadoPago: { notIn: ["ANULADA", "CANCELADA"] } },
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
    select: {
      id: true,
      numero: true,
      fecha: true,
      totalARS: true,
      cotizacionUsada: true,
      items: {
        select: {
          cantidad: true,
          precioUnitarioUSD: true,
          descripcionLibre: true,
          producto: { select: { nombre: true } },
        },
      },
      pagos: { select: { fecha: true, monto: true, montoARS: true, cuenta: { select: { tipo: true } } } },
    },
  });

  type Pago = { fecha: Date; ars: number; medio: string; ventaId: number };
  const datos = ventas.map((v) => ({
    ...v,
    total: Math.round(v.totalARS),
    pagosARS: v.pagos
      .map((p): Pago => ({
        fecha: p.fecha,
        ars: montoARSDePago(p, p.cuenta.tipo, v.cotizacionUsada),
        medio: medioDePago(p.cuenta.tipo),
        ventaId: v.id,
      }))
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
  }));

  /** Deuda total al instante `t` (incluido), con la misma regla que Clientes. */
  function deudaAl(t: Date): number {
    let total = 0;
    for (const v of datos) {
      if (v.fecha > t) continue;
      const pagado = v.pagosARS.filter((p) => p.fecha <= t).reduce((a, p) => a + p.ars, 0);
      total += Math.max(0, v.total - pagado);
    }
    return redondear(total);
  }

  const desde = limites.desde ?? inicioDeLaDeudaActual();

  /**
   * "Desde que debe": el primer movimiento después de la última vez que la
   * deuda quedó en cero. Si hoy no debe nada, el período queda vacío (hoy).
   */
  function inicioDeLaDeudaActual(): Date {
    const instantes = [
      ...new Set(datos.flatMap((v) => [v.fecha.getTime(), ...v.pagosARS.map((p) => p.fecha.getTime())])),
    ]
      .filter((t) => t < hasta.getTime())
      .sort((a, b) => a - b);
    if (instantes.length === 0 || deudaAl(new Date(hasta.getTime() - 1)) < 0.5) return hasta;
    let inicio = instantes[0];
    for (let i = 0; i < instantes.length - 1; i++) {
      if (deudaAl(new Date(instantes[i])) < 0.5) inicio = instantes[i + 1];
    }
    return new Date(inicio);
  }

  const saldoAnterior = deudaAl(new Date(desde.getTime() - 1));

  // Movimientos del período.
  const movimientos: MovimientoResumen[] = [];
  const pagosSueltos: Pago[] = [];
  for (const v of datos) {
    const enPeriodo = v.fecha >= desde && v.fecha < hasta;
    const enElMomento = v.pagosARS.filter((p) => Math.abs(p.fecha.getTime() - v.fecha.getTime()) <= MARGEN_PAGO_EN_EL_MOMENTO_MS);
    if (enPeriodo) {
      const esAjuste = v.items.length === 1 && v.items[0].descripcionLibre === AJUSTE;
      movimientos.push({
        tipo: "compra",
        fecha: v.fecha,
        ventaNumero: v.numero,
        esAjuste,
        items: esAjuste
          ? []
          : v.items.map((i) => ({
              cantidad: i.cantidad,
              nombre: i.producto?.nombre ?? i.descripcionLibre ?? "Producto",
              importe: Math.round(i.precioUnitarioUSD * v.cotizacionUsada * i.cantidad),
            })),
        cargo: v.total,
        pagadoEnElMomento: redondear(enElMomento.reduce((a, p) => a + p.ars, 0)),
        saldo: 0,
      });
    }
    for (const p of v.pagosARS) {
      if (p.fecha < desde || p.fecha >= hasta) continue;
      if (enPeriodo && enElMomento.includes(p)) continue; // ya va en la fila de la compra
      pagosSueltos.push(p);
    }
  }

  // Un cobro de deuda se reparte en varias ventas (un PagoVenta por venta): se
  // juntan los que son del mismo momento y medio en una sola fila.
  pagosSueltos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  for (const p of pagosSueltos) {
    const ultimo = movimientos.findLast((m) => m.tipo === "pago");
    if (
      ultimo &&
      ultimo.tipo === "pago" &&
      ultimo.detalle === `Pago en ${p.medio}` &&
      p.fecha.getTime() - ultimo.fecha.getTime() <= MARGEN_MISMO_COBRO_MS
    ) {
      ultimo.monto = redondear(ultimo.monto + p.ars);
      continue;
    }
    movimientos.push({ tipo: "pago", fecha: p.fecha, detalle: `Pago en ${p.medio}`, monto: redondear(p.ars), saldo: 0 });
  }

  movimientos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.tipo === "compra" ? -1 : 1));
  // Saldo después de cada movimiento: saldo anterior + compras − pagos, en orden.
  let saldo = saldoAnterior;
  for (const m of movimientos) {
    saldo += m.tipo === "compra" ? m.cargo - m.pagadoEnElMomento : -m.monto;
    m.saldo = redondear(saldo);
  }

  const totalCompras = movimientos.reduce((a, m) => a + (m.tipo === "compra" ? m.cargo : 0), 0);
  const totalPagos = movimientos.reduce(
    (a, m) => a + (m.tipo === "pago" ? m.monto : m.pagadoEnElMomento),
    0
  );

  return {
    cliente: {
      id: cliente.id,
      nombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(" "),
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      documento: cliente.numeroDocumento ? `${cliente.tipoDocumento ?? "Doc."} ${cliente.numeroDocumento}` : null,
    },
    tipo: periodo.tipo,
    mes: periodo.tipo === "mes" ? periodo.mes : null,
    desde,
    hasta,
    hastaHoy: hasta.getTime() === ahora.getTime(),
    saldoAnterior,
    movimientos,
    totalCompras: redondear(totalCompras),
    totalPagos: redondear(totalPagos),
    saldoFinal: deudaAl(new Date(hasta.getTime() - 1)),
  };
}

/** Resumen de un mes ("2026-09"); el mes en curso llega hasta hoy. */
export function obtenerResumenMensual(empresaId: number, clienteId: number, mes: string, ahora: Date = new Date()) {
  return obtenerResumen(empresaId, clienteId, { tipo: "mes", mes }, ahora);
}
