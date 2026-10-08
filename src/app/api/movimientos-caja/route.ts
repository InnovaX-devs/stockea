import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { inicioDiaAR } from "@/lib/timezone";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";

export async function GET(request: NextRequest) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarFlujoCaja) {
    return NextResponse.json({ error: "El flujo de caja no está disponible en tu plan actual." }, { status: 403 });
  }

  const empresaId = await obtenerEmpresaIdActual();
  const sp = request.nextUrl.searchParams;
  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  const tipo = sp.get("tipo");
  const cuentaId = sp.get("cuentaId");
  const concepto = sp.get("concepto");

  const where: Prisma.MovimientoCajaWhereInput = {
    empresaId,
    ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: inicioDiaAR(desde) } : {}),
    ...(hasta
      ? {
          lt: new Date(
            inicioDiaAR(hasta).getTime() + 24 * 60 * 60 * 1000
          ),
        }
      : {}),
          },
        }
      : {}),
    ...(tipo ? { tipo: tipo as Prisma.EnumTipoMovimientoCajaFilter["equals"] } : {}),
    ...(cuentaId ? { cuentaId: Number(cuentaId) } : {}),
    ...(concepto ? { concepto: concepto as Prisma.EnumConceptoMovimientoCajaFilter["equals"] } : {}),
  };

  const items = await prisma.movimientoCaja.findMany({
    where,
    orderBy: { fecha: "desc" },
    take: 200,
    include: {
      cuenta: { select: { id: true, nombre: true, tipo: true } },
    },
  });

    // Resumen: se calcula sobre TODO el período filtrado (sin el take:200),
  // para que las tarjetas no queden truncadas si hay más de 200 movimientos.
  const todosEnPeriodo = await prisma.movimientoCaja.findMany({
    where,
    select: {
      tipo: true, monto: true, concepto: true,
      cuenta: { select: { tipo: true } },
      venta: { select: { estadoPago: true } },
    },
  });

  const cotizacion = configuracion.cotizacionUSD ?? 1000;

  // Ingresos/Egresos/Neto: sí dependen del período filtrado.
  let ingresos = 0;
  let egresos = 0;
  // Ajustes de saldo (manuales, de cierre de caja y reversiones): no son
  // plata que entró o salió del negocio, se informan aparte.
  let ajustes = 0;
  for (const m of todosEnPeriodo) {
    if (m.concepto === "TRANSFERENCIA") continue; // no es dinero entrando/saliendo del negocio
    const montoEnArs = m.cuenta.tipo.endsWith("USD") ? m.monto * cotizacion : m.monto;
    if (m.concepto === "AJUSTE_SALDO") {
      ajustes += m.tipo === "INGRESO" ? montoEnArs : -montoEnArs;
      continue;
    }
    // Venta anulada o pedido cancelado: el cobro original no cuenta como
    // ingreso (su reversión es un ajuste). Antes se contaba la venta como
    // ingreso y la reversión como egreso, e inflaba las dos tarjetas.
    if (m.venta && (m.venta.estadoPago === "ANULADA" || m.venta.estadoPago === "CANCELADA")) continue;
    if (m.tipo === "INGRESO") ingresos += montoEnArs;
    else egresos += montoEnArs;
  }

  // Saldo total, Efectivo y Transferencia: son una foto del momento actual,
  // no dependen del período. Efectivo/Transferencia sí respetan el filtro
  // de cuenta específica cuando el usuario elige una.
  const cuentasActivas = await prisma.cuenta.findMany({
    where: {
      empresaId,
      activa: true,
      ...(cuentaId ? { id: Number(cuentaId) } : {}),
    },
    select: { tipo: true, saldoActual: true },
  });

  let saldoTotal = 0;
  let totalEfectivo = 0;
  let totalTransferencia = 0;

  for (const c of cuentasActivas) {
    const saldoEnArs = c.tipo.endsWith("USD") ? c.saldoActual * cotizacion : c.saldoActual;
    saldoTotal += saldoEnArs;
    if (c.tipo.startsWith("EFECTIVO")) {
      totalEfectivo += saldoEnArs;
    } else {
      totalTransferencia += saldoEnArs;
    }
  }

  return NextResponse.json({
    items,
    resumen: {
      saldoTotal,
      totalEfectivo,
      totalTransferencia,
      ingresosPeriodo: ingresos,
      egresosPeriodo: egresos,
      netoPeriodo: ingresos - egresos,
      ajustesPeriodo: ajustes,
    },
  });
}