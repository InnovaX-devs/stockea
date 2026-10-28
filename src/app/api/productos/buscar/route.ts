import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { conStockDeSucursal } from "@/lib/stock-sucursal";
import { esFotoPermitida } from "@/lib/fotos";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { filtroPromocionesVendibles } from "@/lib/promociones";
import { cuantasSePuedenArmar } from "@/lib/promociones-comun";
import { contenidoVisible } from "@/lib/rubro";

/** Stock (de la sucursal actual) de los productos que incluyen las promos encontradas. */
async function stockDeComponentes(productos: { componentes: { producto: { id: number } }[] }[]): Promise<Map<number, number>> {
  const ids = [...new Set(productos.flatMap((p) => p.componentes.map((c) => c.producto.id)))];
  if (ids.length === 0) return new Map();
  const conStock = await conStockDeSucursal(
    await prisma.producto.findMany({ where: { id: { in: ids } }, select: { id: true, stockActual: true } })
  );
  return new Map(conStock.map((p) => [p.id, p.stockActual]));
}

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
  // Botones rápidos de Nueva venta: los productos de precio abierto (verdura, fiambre…).
  const soloAbiertos = request.nextUrl.searchParams.get("abiertos") === "1";
  // Promociones (#114): solo el buscador de Nueva venta las pide (promos=1), y
  // solo las activas y vigentes, si el plan las incluye. Compras, presupuestos
  // y transferencias no las reciben.
  const config = request.nextUrl.searchParams.get("promos") === "1" && !soloAbiertos ? await obtenerConfiguracion() : null;
  const conPromos = config?.habilitarPromociones === true;

  if (!q && !porModelo && !soloAbiertos) {
    return NextResponse.json({ items: [] });
  }

  const where: Prisma.ProductoWhereInput = soloAbiertos
    ? { empresaId, activo: true, precioAbierto: true }
    : porModelo
    ? { empresaId, activo: true, modeloId }
    : {
        empresaId,
        activo: true,
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { codigoBarras: { contains: q, mode: "insensitive" } },
        ],
        AND: [conPromos ? { OR: [{ esPromocion: false }, filtroPromocionesVendibles()] } : { esPromocion: false }],
      };

  const encontrados = await prisma.producto.findMany({
    where,
    orderBy: { nombre: "asc" },
    take: porModelo ? 300 : soloAbiertos ? 24 : agrupar ? 50 : 10,
    select: {
      id: true,
      nombre: true,
      codigoBarras: true,
      stockActual: true,
      monedaPrecio: true,
      precioCosto: true,
      precioVenta: true,
      precioMayorista: true,
      contenido: true,
      unidadContenido: true,
      marca: { select: { nombre: true } },
      modeloId: true,
      talle: true,
      color: true,
      precioAbierto: true,
      controlaStock: true,
      fotoUrl: true,
      modelo: { select: { nombre: true } },
      esPromocion: true,
      componentes: {
        orderBy: { id: "asc" },
        select: { cantidad: true, producto: { select: { id: true, nombre: true, contenido: true, unidadContenido: true } } },
      },
    },
  });
  // Stock de la sucursal en la que se está vendiendo (ver src/lib/stock-sucursal.ts).
  // Promos: su "stock" es cuántas se pueden armar con el de sus componentes.
  const stockComponentes = await stockDeComponentes(encontrados);
  const items = (await conStockDeSucursal(encontrados)).map(({ modelo, componentes, ...p }) => ({
    ...p,
    ...(p.esPromocion
      ? {
          stockActual: cuantasSePuedenArmar(componentes.map((c) => ({ cantidad: c.cantidad, stock: stockComponentes.get(c.producto.id) ?? 0 }))),
          componentes: componentes.map((c) => ({
            productoId: c.producto.id,
            cantidad: c.cantidad,
            nombre: [c.producto.nombre, contenidoVisible(config?.rubro, c.producto.contenido, c.producto.unidadContenido)]
              .filter(Boolean)
              .join(" "),
          })),
        }
      : {}),
    // Solo URLs de Vercel Blob: next/image falla con cualquier otro host (ver next.config.ts).
    fotoUrl: esFotoPermitida(p.fotoUrl) ? p.fotoUrl : null,
    modeloNombre: modelo?.nombre ?? null,
  }));

  if (rol === "EMPLEADO") {
    // El empleado no ve costos: se saca del lado del servidor.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ items: items.map(({ precioCosto, ...resto }) => resto) });
  }

  return NextResponse.json({ items });
}