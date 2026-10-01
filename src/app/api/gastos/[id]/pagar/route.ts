import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const configuracion = await obtenerConfiguracion();
    if (!configuracion.habilitarGastosFlujoCaja) {
      return NextResponse.json({ error: "Los gastos no están disponibles en tu plan actual." }, { status: 403 });
    }

    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const gastoId = Number(id);
    if (!Number.isInteger(gastoId)) {
      return NextResponse.json({ error: "ID de gasto inválido" }, { status: 400 });
    }

    const body = await request.json();
    const cuentaId = Number(body.cuentaId);
    if (!cuentaId) {
      return NextResponse.json({ error: "Elegí la cuenta de origen del pago" }, { status: 400 });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const gasto = await tx.gasto.findFirst({ where: { id: gastoId, empresaId } });
      if (!gasto) throw new Error("GASTO_NO_ENCONTRADO");
      if (gasto.estadoPago === "PAGADO") throw new Error("YA_PAGADO");

      const cuenta = await tx.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
      if (!cuenta) throw new Error("CUENTA_NO_ENCONTRADA");

      const esCuentaUSD = cuenta.tipo === "EFECTIVO_USD" || cuenta.tipo === "BANCO_USD";

      let montoADescontar = gasto.monto; // el gasto se guarda en ARS
      if (esCuentaUSD) {
        const config = await tx.configuracion.findUnique({ where: { empresaId } });
        const cotizacion = config?.cotizacionUSD ?? 0;
        if (!cotizacion) throw new Error("SIN_COTIZACION");
        montoADescontar = gasto.monto / cotizacion; // convierte ARS -> USD
      }

      if (cuenta.saldoActual - montoADescontar < 0) {
        throw new Error("SALDO_INSUFICIENTE");
      }

      // Guard atómico: si lo pagaron en otra pestaña, no se paga dos veces.
      const marcado = await tx.gasto.updateMany({
        where: { id: gastoId, empresaId, estadoPago: "PENDIENTE" },
        data: { estadoPago: "PAGADO" },
      });
      if (marcado.count === 0) throw new Error("YA_PAGADO");

      // Se resta sobre el saldo de ESTE momento (no uno leído antes).
      const cuentaActualizada = await tx.cuenta.update({
        where: { id: cuentaId },
        data: { saldoActual: { decrement: montoADescontar } },
      });
      if (cuentaActualizada.saldoActual < 0) throw new Error("SALDO_INSUFICIENTE");

      await tx.movimientoCaja.create({
        data: {
          empresaId,
          cuentaId,
          tipo: "EGRESO",
          concepto: "GASTO",
          monto: montoADescontar,
          saldoResultante: cuentaActualizada.saldoActual,
          gastoId: gasto.id,
        },
      });

      return tx.gasto.findUniqueOrThrow({ where: { id: gastoId } });
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    if (error?.message === "GASTO_NO_ENCONTRADO") {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    }
    if (error?.message === "YA_PAGADO") {
      return NextResponse.json({ error: "El gasto ya está pagado" }, { status: 409 });
    }
    if (error?.message === "CUENTA_NO_ENCONTRADA") {
      return NextResponse.json({ error: "La cuenta seleccionada no existe" }, { status: 404 });
    }
    if (error?.message === "SALDO_INSUFICIENTE") {
      return NextResponse.json({ error: "La cuenta no tiene saldo suficiente para este gasto" }, { status: 409 });
    }
    if (error?.message === "SIN_COTIZACION") {
      return NextResponse.json({ error: "No hay una cotización de USD configurada" }, { status: 400 });
    }
    console.error("Error al pagar gasto:", error);
    return NextResponse.json({ error: "Error al marcar el gasto como pagado" }, { status: 500 });
  }
}