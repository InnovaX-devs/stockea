import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { esErrorDeNombreUnico, mensajeNombreDuplicado } from "@/lib/nombre-duplicado";

// PUT: Editar nombre o cambiar estado (activa: true/false)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const marcaId = Number(id);

    if (isNaN(marcaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const existe = await prisma.marca.findFirst({ where: { id: marcaId, empresaId } });
    if (!existe) {
      return NextResponse.json({ error: "Marca no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const dataToUpdate: any = {};

    if (body.nombre !== undefined) {
      dataToUpdate.nombre = String(body.nombre).trim();
      if (!dataToUpdate.nombre) {
        return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
      }
      const otra = await prisma.marca.findFirst({
        where: { empresaId, id: { not: marcaId }, nombre: { equals: dataToUpdate.nombre, mode: "insensitive" } },
        select: { nombre: true, activa: true },
      });
      if (otra) {
        return NextResponse.json({ error: mensajeNombreDuplicado("marca", otra) }, { status: 409 });
      }
    }
    if (body.activa !== undefined) {
      dataToUpdate.activa = Boolean(body.activa);
    }

    const marcaActualizada = await prisma.marca.update({
      where: { id: marcaId },
      data: dataToUpdate,
    });

    return NextResponse.json(marcaActualizada);
  } catch (error: any) {
    if (esErrorDeNombreUnico(error)) {
      return NextResponse.json({ error: "Ya existe una marca con ese nombre." }, { status: 409 });
    }
    console.error("Error al actualizar marca:", error);
    return NextResponse.json(
      { error: "Error al actualizar la marca" },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar marca solo si NO tiene productos asociados
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const marcaId = Number(id);

    if (isNaN(marcaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const existe = await prisma.marca.findFirst({ where: { id: marcaId, empresaId } });
    if (!existe) {
      return NextResponse.json({ error: "Marca no encontrada" }, { status: 404 });
    }

    // Verificar si tiene productos asociados
    const productosCount = await prisma.producto.count({
      where: { marcaId, empresaId },
    });

    if (productosCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar la marca porque tiene ${productosCount} producto(s) asociado(s). Desactívala en su lugar.`,
        },
        { status: 400 }
      );
    }

    await prisma.marca.delete({
      where: { id: marcaId },
    });

    return NextResponse.json({ message: "Marca eliminada correctamente" });
  } catch (error: any) {
    console.error("Error al eliminar marca:", error);
    return NextResponse.json(
      { error: "Error al eliminar la marca" },
      { status: 500 }
    );
  }
}