import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { esErrorDeNombreUnico, mensajeNombreDuplicado } from "@/lib/nombre-duplicado";

// FIX: evita que Next.js cachee este GET como estático.
// Sin esto, /api/categorias puede devolver siempre la misma
// respuesta cacheada aunque se creen categorías nuevas.
export const dynamic = "force-dynamic";

// GET /api/categorias - Obtener todas las categorías con conteo de productos
export async function GET() {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const categorias = await prisma.categoria.findMany({
      where: { empresaId },
      include: {
        _count: {
          select: { productos: true },
        },
      },
      orderBy: { nombre: "asc" },
    });

    const resultado = categorias.map((cat) => ({
      ...cat,
      cantidadProductos: cat._count.productos,
    }));

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    return NextResponse.json(
      { message: "Error al obtener las categorías" },
      { status: 500 }
    );
  }
}

// POST /api/categorias - Crear una nueva categoría
export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { nombre } = await request.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { error: "El nombre de la categoría es requerido" },
        { status: 400 }
      );
    }

    // Sin distinguir mayúsculas: "arroces" choca con "Arroces".
    const existente = await prisma.categoria.findFirst({
      where: { empresaId, nombre: { equals: nombre.trim(), mode: "insensitive" } },
      select: { nombre: true, activa: true },
    });
    if (existente) {
      return NextResponse.json({ error: mensajeNombreDuplicado("categoría", existente) }, { status: 409 });
    }

    const nuevaCategoria = await prisma.categoria.create({
      data: {
        empresaId,
        nombre: nombre.trim(),
        activa: true,
      },
    });

    return NextResponse.json(nuevaCategoria, { status: 201 });
  } catch (error) {
    if (esErrorDeNombreUnico(error)) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre." }, { status: 409 });
    }
    console.error("Error al crear categoría:", error);
    return NextResponse.json(
      { error: "Error interno al crear la categoría" },
      { status: 500 }
    );
  }
}