import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { esErrorDeNombreUnico, mensajeNombreDuplicado } from "@/lib/nombre-duplicado";

// PUT: Editar nombre o cambiar estado
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const categoriaId = Number(id);

    if (isNaN(categoriaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const existe = await prisma.categoria.findFirst({ where: { id: categoriaId, empresaId } });
    if (!existe) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const dataToUpdate: any = {};

    if (body.nombre !== undefined) {
      dataToUpdate.nombre = String(body.nombre).trim();
      if (!dataToUpdate.nombre) {
        return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
      }
      const otra = await prisma.categoria.findFirst({
        where: { empresaId, id: { not: categoriaId }, nombre: { equals: dataToUpdate.nombre, mode: "insensitive" } },
        select: { nombre: true, activa: true },
      });
      if (otra) {
        return NextResponse.json({ error: mensajeNombreDuplicado("categoría", otra) }, { status: 409 });
      }
    }
    if (body.activa !== undefined) {
      dataToUpdate.activa = Boolean(body.activa);
    }

    const categoriaActualizada = await prisma.categoria.update({
      where: { id: categoriaId },
      data: dataToUpdate,
    });

    return NextResponse.json(categoriaActualizada);
  } catch (error: any) {
    if (esErrorDeNombreUnico(error)) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre." }, { status: 409 });
    }
    console.error("Error al actualizar categoría:", error);
    return NextResponse.json(
      { error: "Error al actualizar la categoría" },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar categoría solo si NO tiene productos
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const categoriaId = Number(id);

    if (isNaN(categoriaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const existe = await prisma.categoria.findFirst({ where: { id: categoriaId, empresaId } });
    if (!existe) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    // Verificar si tiene productos asociados
    const productosCount = await prisma.producto.count({
      where: { categoriaId, empresaId },
    });

    if (productosCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar la categoría porque tiene ${productosCount} producto(s) asociado(s). Desactívala en su lugar.`,
        },
        { status: 400 }
      );
    }

    await prisma.categoria.delete({
      where: { id: categoriaId },
    });

    return NextResponse.json({ message: "Categoría eliminada correctamente" });
  } catch (error: any) {
    console.error("Error al eliminar categoría:", error);
    return NextResponse.json(
      { error: "Error al eliminar la categoría" },
      { status: 500 }
    );
  }
}