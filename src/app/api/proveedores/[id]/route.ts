import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const proveedorId = Number(id);

    if (!Number.isInteger(proveedorId)) {
      return NextResponse.json(
        { error: "ID de proveedor inválido" },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body.nombre?.trim()) {
      return NextResponse.json(
        { error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    const proveedorExistente = await prisma.proveedor.findFirst({
      where: { id: proveedorId, empresaId },
    });

    if (!proveedorExistente) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const proveedorActualizado = await prisma.proveedor.update({
      where: { id: proveedorId },
      data: {
        nombre: body.nombre.trim(),
        personaContacto: body.personaContacto?.trim() || null,
        telefono: body.telefono?.trim() || null,
        email: body.email?.trim() || null,
        deudaInicial:
          body.deudaInicial !== undefined && body.deudaInicial !== ""
            ? Number(body.deudaInicial)
            : 0,
        notas: body.notas?.trim() || null,
      },
    });

    return NextResponse.json(proveedorActualizado);
  } catch (error) {
    console.error("Error al actualizar proveedor:", error);
    return NextResponse.json(
      { error: "Error al actualizar el proveedor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const proveedorId = Number(id);

    if (!Number.isInteger(proveedorId)) {
      return NextResponse.json(
        { error: "ID de proveedor inválido" },
        { status: 400 }
      );
    }

    const proveedorExistente = await prisma.proveedor.findFirst({
      where: { id: proveedorId, empresaId },
    });
    if (!proveedorExistente) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    const cantidadCompras = await prisma.compra.count({
      where: { proveedorId, empresaId },
    });

    if (cantidadCompras > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: el proveedor tiene compras asociadas. Si ya no lo usás, actualizá sus datos en vez de borrarlo.",
        },
        { status: 409 }
      );
    }

    const cantidadGastos = await prisma.gasto.count({ where: { proveedorId, empresaId } });
    if (cantidadGastos > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: el proveedor tiene gastos asociados. Si ya no lo usás, actualizá sus datos en vez de borrarlo.",
        },
        { status: 409 }
      );
    }

    await prisma.proveedor.delete({ where: { id: proveedorId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error al eliminar proveedor:", error);
    return NextResponse.json(
      { error: "Error al eliminar el proveedor" },
      { status: 500 }
    );
  }
}