import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { toArs, redondearARS } from "@/lib/currency";
import { formatearContenido } from "@/lib/rubro";
import { formatFechaAR } from "@/lib/timezone";
import { precioPorUnidadMedida, type TamanoEtiqueta } from "@/lib/etiquetas";
import { EtiquetasDocument, type EtiquetaItem } from "@/lib/pdf/EtiquetasDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ETIQUETAS = 500;

/** Acepta "YYYY-MM-DD" (medianoche de Argentina) o un ISO completo. */
function parsearDesde(valor: string | null): Date | null {
  if (!valor) return null;
  const d = new Date(valor.length === 10 ? `${valor}T00:00:00-03:00` : valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tamano: TamanoEtiqueta = sp.get("tamano") === "MEDIANA" ? "MEDIANA" : "CHICA";
  const tipoPrecio = sp.get("tipoPrecio") === "MAYORISTA" ? "MAYORISTA" : "MINORISTA";
  const conCodigo = sp.get("codigo") === "1";
  const desde = parsearDesde(sp.get("desde"));

  const ids = (sp.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const categoriaId = Number(sp.get("categoriaId")) || null;
  const marcaId = Number(sp.get("marcaId")) || null;

  const empresaId = await obtenerEmpresaIdActual();
  if (!(await obtenerConfiguracion()).habilitarEtiquetas) {
    return NextResponse.json({ error: "Las etiquetas de góndola están disponibles en el plan Pro." }, { status: 403 });
  }

  const where: Prisma.ProductoWhereInput = {
    empresaId,
    activo: true,
    precioAbierto: false, // no tienen precio fijo para imprimir
    esPromocion: false, // las promociones no van en las etiquetas de góndola (#114)
    ...(tipoPrecio === "MAYORISTA" ? { precioMayorista: { not: null } } : {}),
    ...(ids.length > 0 ? { id: { in: ids } } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(marcaId ? { marcaId } : {}),
  };

  // "Precio cambiado desde…": productos con un cambio del precio que se imprime.
  if (desde) {
    const cambios = await prisma.historialPrecio.findMany({
      where: { empresaId, campo: tipoPrecio, fecha: { gte: desde } },
      select: { productoId: true },
      distinct: ["productoId"],
    });
    where.id = { in: cambios.map((c) => c.productoId) };
    if (ids.length > 0) where.id = { in: cambios.map((c) => c.productoId).filter((id) => ids.includes(id)) };
  }

  const [productos, configuracion] = await Promise.all([
    prisma.producto.findMany({
      where,
      orderBy: { nombre: "asc" },
      take: MAX_ETIQUETAS + 1,
      select: {
        id: true,
        nombre: true,
        codigoBarras: true,
        monedaPrecio: true,
        precioVenta: true,
        precioMayorista: true,
        contenido: true,
        unidadContenido: true,
        marca: { select: { nombre: true } },
      },
    }),
    obtenerConfiguracion(),
  ]);

  if (productos.length === 0) {
    return NextResponse.json({ error: "No hay productos que coincidan con los filtros." }, { status: 404 });
  }
  if (productos.length > MAX_ETIQUETAS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_ETIQUETAS} etiquetas por PDF. Filtrá más.` },
      { status: 400 }
    );
  }

  // Fecha de actualización = último cambio del precio impreso; si nunca cambió, hoy.
  const historial = await prisma.historialPrecio.findMany({
    where: { empresaId, campo: tipoPrecio, productoId: { in: productos.map((p) => p.id) } },
    orderBy: { fecha: "desc" },
    select: { productoId: true, fecha: true },
  });
  const ultimoCambio = new Map<number, Date>();
  for (const h of historial) if (!ultimoCambio.has(h.productoId)) ultimoCambio.set(h.productoId, h.fecha);

  const hoy = formatFechaAR(new Date());
  const items: EtiquetaItem[] = productos.map((p) => {
    const base = tipoPrecio === "MAYORISTA" ? (p.precioMayorista ?? 0) : p.precioVenta;
    // Si el negocio no opera con dólares, el precio ya está en ARS.
    const cotizacion = configuracion.usaCotizacionUSD ? configuracion.cotizacionUSD : 1;
    const precioArs = redondearARS(toArs(base, p.monedaPrecio, cotizacion));
    const fecha = ultimoCambio.get(p.id);
    return {
      id: p.id,
      nombre: p.nombre,
      marca: p.marca?.nombre ?? null,
      contenido: formatearContenido(p.contenido, p.unidadContenido),
      precioArs,
      porUnidad: precioPorUnidadMedida(precioArs, p.contenido, p.unidadContenido),
      fecha: fecha ? formatFechaAR(fecha) : hoy,
      codigoBarras: conCodigo ? p.codigoBarras : null,
    };
  });

  try {
    const buffer = await renderToBuffer(<EtiquetasDocument items={items} tamano={tamano} />);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiquetas-${tamano.toLowerCase()}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[etiquetas] error al renderizar el PDF:", err);
    return NextResponse.json({ error: "No se pudo generar el PDF. Intentá de nuevo." }, { status: 500 });
  }
}