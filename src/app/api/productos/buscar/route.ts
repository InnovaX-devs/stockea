import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { conStockDeSucursal } from "@/lib/stock-sucursal";

export async function GET(request: NextRequest) {
  const { empresaId, rol } = await obtenerUsuarioActual();
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  // Ropa (RV-5): todas las combinaciones de un modelo, para elegir talle y color.
  const modeloId = Number(request.nextUrl.searchParams.get("modeloId"));
  const porModelo = Number.isInteger(modeloId) && modeloId > 0;
  // El buscador de Nueva venta agrupa las combinaciones de un modelo en una
  // fila: pide más resultados (agrupar=1). Los demás buscadores (compras,
  // presupuestos, transferencias) siguen recibiendo 10.
  const agrupar = request.nextUrl.searchParams.get("agrupar") === "1";

  if (!q && !porModelo) {
    return NextResponse.json({ items: [] });
  }

  const where: Prisma.ProductoWhereInput = porModelo
    ? { empresaId, activo: true, modeloId }
    : {
        empresaId,
        activo: true,
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { codigoBarras: { contains: q, mode: "insensitive" } },
        ],
      };

  const encontrados = await prisma.producto.findMany({
    where,
    orderBy: { nombre: "asc" },
    take: porModelo ? 300 : agrupar ? 50 : 10,
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
      modeloId: true,
      talle: true,
      color: true,
      modelo: { select: { nombre: true } },
    },
  });
  // Stock de la sucursal en la que se está vendiendo (ver src/lib/stock-sucursal.ts).
  const items = (await conStockDeSucursal(encontrados)).map(({ modelo, ...p }) => ({
    ...p,
    modeloNombre: modelo?.nombre ?? null,
  }));

  if (rol === "EMPLEADO") {
    // El empleado no ve costos: se saca del lado del servidor.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ items: items.map(({ precioCosto, ...resto }) => resto) });
  }

  return NextResponse.json({ items });
}