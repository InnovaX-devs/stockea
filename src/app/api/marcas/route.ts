import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { esErrorDeNombreUnico, mensajeNombreDuplicado } from "@/lib/nombre-duplicado";

// FIX: evita que Next.js cachee este GET como estático.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const marcas = await prisma.marca.findMany({
      where: { empresaId },
      include: {
        _count: {
          select: { productos: true },
        },
      },
      orderBy: { nombre: "asc" },
    });

    // Mapeamos para devolver la propiedad 'cantidadProductos' lista para consumir en el frontend
    const resultado = marcas.map((marca) => ({
      ...marca,
      cantidadProductos: marca._count.productos,
    }));

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error al obtener marcas:", error);
    return NextResponse.json(
      { message: "Error al obtener las marcas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { nombre } = await request.json();
    if (!nombre?.trim()) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    // Sin distinguir mayúsculas: "natura" choca con "Natura".
    const existente = await prisma.marca.findFirst({
      where: { empresaId, nombre: { equals: nombre.trim(), mode: "insensitive" } },
      select: { nombre: true, activa: true },
    });
    if (existente) {
      return NextResponse.json({ error: mensajeNombreDuplicado("marca", existente) }, { status: 409 });
    }

    const nuevaMarca = await prisma.marca.create({
      data: {
        empresaId,
        nombre: nombre.trim(),
        activa: true,
      },
    });

    return NextResponse.json(nuevaMarca, { status: 201 });
  } catch (error) {
    if (esErrorDeNombreUnico(error)) {
      return NextResponse.json({ error: "Ya existe una marca con ese nombre." }, { status: 409 });
    }
    console.error("Error al crear marca:", error);
    return NextResponse.json(
      { error: "Error al crear la marca" },
      { status: 500 }
    );
  }
}