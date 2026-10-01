import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const cuentaId = Number(id);
    if (Number.isNaN(cuentaId)) {
      return NextResponse.json({ error: "ID de cuenta inválido" }, { status: 400 });
    }

    const body = await request.json();

    const cuentaExistente = await prisma.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
    if (!cuentaExistente) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    if (!body.nombre?.trim() || !body.tipo) {
      return NextResponse.json(
        { error: "El nombre y el tipo de cuenta son obligatorios" },
        { status: 400 }
      );
    }

    // Pasar una cuenta de pesos a dólares (o al revés) con plata o historial
    // adentro convertiría $500.000 en US$ 500.000 sin ninguna conversión.
    // Solo se permite si está vacía y sin movimientos.
    const moneda = (tipo: string) => (tipo.endsWith("USD") ? "USD" : "ARS");
    if (moneda(body.tipo) !== moneda(cuentaExistente.tipo)) {
      const [movimientos, pagos, compras] = await Promise.all([
        prisma.movimientoCaja.count({ where: { cuentaId } }),
        prisma.pagoVenta.count({ where: { cuentaId } }),
        prisma.compra.count({ where: { cuentaId } }),
      ]);
      if (cuentaExistente.saldoActual !== 0 || movimientos > 0 || pagos > 0 || compras > 0) {
        return NextResponse.json(
          {
            error:
              "No se puede cambiar la moneda de una cuenta con saldo o movimientos. Creá una cuenta nueva en la otra moneda y transferí la plata.",
          },
          { status: 409 }
        );
      }
    }

    const esBanco = body.tipo === "BANCO_ARS" || body.tipo === "BANCO_USD";

    const cuentaActualizada = await prisma.cuenta.update({
      where: { id: cuentaId },
      data: {
        nombre: body.nombre.trim(),
        tipo: body.tipo,
        titular: esBanco ? body.titular?.trim() || null : null,
        banco: esBanco ? body.banco?.trim() || null : null,
        alias: esBanco ? body.alias?.trim() || null : null,
        cbu: esBanco ? body.cbu?.trim() || null : null,
        color: body.color || null,
        favorita: Boolean(body.favorita),
        limiteMensualIngresos: body.limiteMensualIngresos
          ? Number(body.limiteMensualIngresos)
          : null,
      },
    });

    return NextResponse.json(cuentaActualizada);
  } catch (error) {
    console.error("Error al actualizar cuenta:", error);
    return NextResponse.json({ error: "Error al actualizar la cuenta" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const cuentaId = Number(id);
    if (Number.isNaN(cuentaId)) {
      return NextResponse.json({ error: "ID de cuenta inválido" }, { status: 400 });
    }

    const body = await request.json();

    if (typeof body.activa !== "boolean") {
      return NextResponse.json({ error: "Falta el campo 'activa'" }, { status: 400 });
    }

    const cuentaExistente = await prisma.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
    if (!cuentaExistente) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const cuenta = await prisma.cuenta.update({
      where: { id: cuentaId },
      data: { activa: body.activa },
    });

    return NextResponse.json(cuenta);
  } catch (error) {
    console.error("Error al cambiar estado de cuenta:", error);
    return NextResponse.json({ error: "Error al cambiar el estado de la cuenta" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const cuentaId = Number(id);
    if (Number.isNaN(cuentaId)) {
      return NextResponse.json({ error: "ID de cuenta inválido" }, { status: 400 });
    }

    const cuentaExistente = await prisma.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
    if (!cuentaExistente) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const [movimientos, pagos, cierres, compras] = await Promise.all([
      prisma.movimientoCaja.count({ where: { cuentaId } }),
      prisma.pagoVenta.count({ where: { cuentaId } }),
      prisma.cierreCajaCuenta.count({ where: { cuentaId } }),
      // Una compra sin confirmar no genera movimientos pero sí apunta a la cuenta.
      prisma.compra.count({ where: { cuentaId } }),
    ]);

    if (movimientos > 0 || pagos > 0 || cierres > 0 || compras > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: la cuenta tiene movimientos, pagos o compras asociados. Desactivala en su lugar.",
        },
        { status: 409 }
      );
    }

    await prisma.cuenta.delete({ where: { id: cuentaId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar cuenta:", error);
    return NextResponse.json({ error: "Error al eliminar la cuenta" }, { status: 500 });
  }
}