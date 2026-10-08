import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerKpisDelDia } from "../../(dashboard)/reportes/queries";
import { rangoParaTab } from "@/lib/reportes";
import { formatHoraAR, inicioFinHoyAR } from "@/lib/timezone";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

export const dynamic = "force-dynamic";

function descripcionMovimiento(m: {
  concepto: string;
  ventaId: number | null;
  venta: { numero: number | null } | null;
  gasto: { concepto: string } | null;
  detalle: string | null;
}) {
  switch (m.concepto) {
    case "VENTA_COBRADA":
      return `Venta #${m.venta?.numero ?? m.ventaId}`;
    case "PAGO_DEUDA_CLIENTE":
      return "Pago de deuda";
    case "PAGO_A_PROVEEDOR":
      return "Pago a proveedor";
    case "GASTO":
      return m.gasto?.concepto ?? "Gasto";
    case "AJUSTE_SALDO":
      return m.detalle ? `Ajuste de saldo: ${m.detalle}` : "Ajuste de saldo";
    case "TRANSFERENCIA":
      return m.detalle ?? "Transferencia entre cuentas";
    default:
      return "Movimiento";
  }
}

export async function GET() {
  const empresaId = await obtenerEmpresaIdActual();
  const { inicio: inicioHoy, fin: finHoy } = inicioFinHoyAR();

  // Todo esto es independiente entre sí -> se pide junto, no en fila
  const [configuracion, cuentas, movimientosHoy, [porArmar, armados], reporteHoy] = await Promise.all([
    prisma.configuracion.findUnique({
      where: { empresaId },
      select: { cotizacionUSD: true },
    }),
    prisma.cuenta.findMany({
      where: { activa: true, empresaId },
      orderBy: [{ favorita: "desc" }, { saldoActual: "desc" }],
    }),
    prisma.movimientoCaja.findMany({
      where: { empresaId, fecha: { gte: inicioHoy, lt: finHoy } },
      include: {
        gasto: { select: { concepto: true } },
        cuenta: { select: { tipo: true } },
        venta: { select: { numero: true } },
      },
      orderBy: { fecha: "desc" },
    }),
    Promise.all([
      prisma.venta.count({
        where: { empresaId, armado: false, estadoPago: { notIn: ["ANULADA", "CANCELADA"] } },
      }),
      prisma.venta.count({
        where: { empresaId, armado: true, retirado: false, estadoPago: { notIn: ["ANULADA", "CANCELADA"] } },
      }),
    ]),
    obtenerKpisDelDia(rangoParaTab("diario")),
  ]);

  const cotizacionActual = configuracion?.cotizacionUSD ?? 1000;

  let saldoTotal = 0;
  for (const c of cuentas) {
    saldoTotal += c.tipo.endsWith("USD") ? c.saldoActual * cotizacionActual : c.saldoActual;
  }

  const gananciaHoyARS = reporteHoy.gananciaNetaARS;
  const cantidadVentasHoy = reporteHoy.cantidadVentas;

  const ingresosHoyARS = movimientosHoy
    .filter((m) => m.tipo === "INGRESO" && m.concepto !== "TRANSFERENCIA")
    .reduce((acc, m) => acc + (m.cuenta.tipo.endsWith("USD") ? m.monto * cotizacionActual : m.monto), 0);

  const egresosHoyARS = movimientosHoy
    .filter((m) => m.tipo === "EGRESO" && m.concepto !== "TRANSFERENCIA")
    .reduce((acc, m) => acc + (m.cuenta.tipo.endsWith("USD") ? m.monto * cotizacionActual : m.monto), 0);

  const movimientos = movimientosHoy.slice(0, 10).map((m) => ({
    id: m.id,
    hora: formatHoraAR(m.fecha),
    descripcion: descripcionMovimiento(m),
    monto: m.monto,
    moneda: m.cuenta.tipo.endsWith("USD") ? "USD" as const : "ARS" as const,
    tipo: m.tipo === "INGRESO" ? ("ingreso" as const) : ("egreso" as const),
  }));

  return NextResponse.json({
    cuentas: {
      saldoTotal,
      principales: cuentas.slice(0, 5).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        saldoActual: c.saldoActual,
        color: c.color,
      })),
      totalCantidad: cuentas.length,
    },
    hoy: {
      gananciaARS: gananciaHoyARS,
      cantidadVentas: cantidadVentasHoy,
      ingresosARS: ingresosHoyARS,
      egresosARS: egresosHoyARS,
    },
    pedidos: { porArmar, armados },
    movimientos,
  });
}