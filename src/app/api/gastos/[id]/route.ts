import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
  // Gastos: disponible en los dos planes (ver lib/configuracion.ts).

    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const gastoId = Number(id);
    if (!Number.isInteger(gastoId)) {
      return NextResponse.json({ error: "ID de gasto inválido" }, { status: 400 });
    }

    const gastoExistente = await prisma.gasto.findFirst({ where: { id: gastoId, empresaId } });
    if (!gastoExistente) {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    }

    const body = await request.json();

    const monto = Number(body.monto);
    if (!monto || monto <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
    }
    if (!body.concepto?.trim()) {
      return NextResponse.json({ error: "El concepto es obligatorio" }, { status: 400 });
    }

    if (gastoExistente.estadoPago === "PAGADO" && monto !== gastoExistente.monto) {
      return NextResponse.json(
        {
          error:
            "No se puede modificar el monto de un gasto ya pagado, porque hay un movimiento de caja asociado.",
        },
        { status: 409 }
      );
    }

    if (body.categoriaId) {
      const categoria = await prisma.categoriaGasto.findFirst({
        where: { id: Number(body.categoriaId), empresaId },
      });
      if (!categoria) {
        return NextResponse.json({ error: "La categoría seleccionada no existe" }, { status: 400 });
      }
    }
    if (body.proveedorId) {
      const proveedor = await prisma.proveedor.findFirst({
        where: { id: Number(body.proveedorId), empresaId },
      });
      if (!proveedor) {
        return NextResponse.json({ error: "El proveedor seleccionado no existe" }, { status: 400 });
      }
    }

    const gastoActualizado = await prisma.gasto.update({
      where: { id: gastoId },
      data: {
        monto,
        concepto: body.concepto.trim(),
        observaciones: body.observaciones?.trim() || null,
        categoriaId: body.categoriaId ? Number(body.categoriaId) : null,
        proveedorId: body.proveedorId ? Number(body.proveedorId) : null,
      },
    });

    return NextResponse.json(gastoActualizado);
  } catch (error) {
    console.error("Error al actualizar gasto:", error);
    return NextResponse.json({ error: "Error al actualizar el gasto" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
  // Gastos: disponible en los dos planes (ver lib/configuracion.ts).

    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const gastoId = Number(id);
    if (!Number.isInteger(gastoId)) {
      return NextResponse.json({ error: "ID de gasto inválido" }, { status: 400 });
    }

    const gastoExistente = await prisma.gasto.findFirst({ where: { id: gastoId, empresaId } });
    if (!gastoExistente) {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    }

    const movimientos = await prisma.movimientoCaja.count({ where: { gastoId } });
    if (movimientos > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: el gasto ya generó un movimiento de caja. Si fue un error, contactá al administrador.",
        },
        { status: 409 }
      );
    }

    await prisma.gasto.delete({ where: { id: gastoId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error al eliminar gasto:", error);
    return NextResponse.json({ error: "Error al eliminar el gasto" }, { status: 500 });
  }
}