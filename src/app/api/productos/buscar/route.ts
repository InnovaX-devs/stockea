import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerUsuarioActual } from "@/lib/empresa";

export async function GET(request: NextRequest) {
  const { empresaId, rol } = await obtenerUsuarioActual();
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ items: [] });
  }

  const where: Prisma.ProductoWhereInput = {
    empresaId,
    activo: true,
    OR: [
      { nombre: { contains: q, mode: "insensitive" } },
      { codigoBarras: { contains: q, mode: "insensitive" } },
    ],
  };

  const items = await prisma.producto.findMany({
    where,
    orderBy: { nombre: "asc" },
    take: 10,
    select: {
      id: true,
      nombre: true,
      codigoBarras: true,
      stockActual: true,
      monedaPrecio: true,
      precioCosto: true,
      precioVenta: true,
      precioMayorista: true,
      contenidoMl: true,
      marca: { select: { nombre: true } },
    },
  });

  if (rol === "EMPLEADO") {
    // El empleado no ve costos: se saca del lado del servidor.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ items: items.map(({ precioCosto, ...resto }) => resto) });
  }

  return NextResponse.json({ items });
}