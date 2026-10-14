import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerKpisDelDia } from "../../(dashboard)/reportes/queries";
import { rangoParaTab } from "@/lib/reportes";
import { formatHoraAR, inicioFinHoyAR } from "@/lib/timezone";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { filtroPorSucursal, obtenerSucursalIdActual } from "@/lib/sucursal";
import { filtroCuentasDeSucursal } from "@/lib/cuenta-sucursal";

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
  // Sucursal actual; null = "Todas" (solo admin) -> sin filtro.
  const sucursalId = await obtenerSucursalIdActual();
  const { inicio: inicioHoy, fin: finHoy } = inicioFinHoyAR();

  // Todo esto es independiente entre sí -> se pide junto, no en fila
  // Productos con stock negativo (ventas sin conexión que se sincronizaron con
  // más unidades de las que había, issue #41). Se mira el stock de la sucursal
  // actual; con "Todas", el de cualquiera. Se apaga solo al corregir el stock.
  const whereNegativo = {
    cantidad: { lt: 0 },
    producto: { empresaId, activo: true },
    ...filtroPorSucursal(sucursalId),
  };
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [configuracion, cuentas, movimientosHoy, [porArmar, armados], reporteHoy, [negativosTotal, negativos, ventasNegativas]] = await Promise.all([
    prisma.configuracion.findUnique({
      where: { empresaId },
      select: { cotizacionUSD: true, licencia: true },
    }),
    prisma.cuenta.findMany({
      where: { activa: true, empresaId, ...filtroCuentasDeSucursal(sucursalId) },
      orderBy: [{ favorita: "desc" }, { saldoActual: "desc" }],
    }),
    prisma.movimientoCaja.findMany({
      where: { empresaId, ...filtroPorSucursal(sucursalId), fecha: { gte: inicioHoy, lt: finHoy } },
      include: {
        gasto: { select: { concepto: true } },
        cuenta: { select: { tipo: true } },
        venta: { select: { numero: true } },
      },
      orderBy: { fecha: "desc" },
    }),
    Promise.all([
      prisma.venta.count({
        where: { empresaId, ...filtroPorSucursal(sucursalId), armado: false, estadoPago: { notIn: ["ANULADA", "CANCELADA"] } },
      }),
      prisma.venta.count({
        where: { empresaId, ...filtroPorSucursal(sucursalId), armado: true, retirado: false, estadoPago: { notIn: ["ANULADA", "CANCELADA"] } },
      }),
    ]),
    obtenerKpisDelDia(rangoParaTab("diario")),
    Promise.all([
      prisma.stockSucursal.count({ where: whereNegativo }),
      prisma.stockSucursal.findMany({
        where: whereNegativo,
        orderBy: { cantidad: "asc" },
        take: 5,
        select: { cantidad: true, producto: { select: { id: true, nombre: true } }, sucursal: { select: { nombre: true } } },
      }),
      prisma.venta.findMany({
        where: {
          empresaId,
          ...filtroPorSucursal(sucursalId),
          stockNegativo: true,
          estadoPago: { notIn: ["ANULADA", "CANCELADA"] },
          fecha: { gte: hace30Dias },
        },
        orderBy: { id: "desc" },
        take: 5,
        select: { numero: true },
      }),
    ]),
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
    premium: configuracion?.licencia === "PREMIUM",
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
    stockNegativo: {
      total: negativosTotal,
      productos: negativos.map((n) => ({
        id: n.producto.id,
        nombre: n.producto.nombre,
        cantidad: n.cantidad,
        sucursal: n.sucursal.nombre,
      })),
      ventas: ventasNegativas.map((v) => v.numero).filter((n): n is number => n != null),
    },
  });
}