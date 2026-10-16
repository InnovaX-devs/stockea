import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { conStockDeSucursal } from "@/lib/stock-sucursal";
import { ListaPreciosDocument } from "@/lib/pdf/ListaPreciosDocument";
import { CatalogoDocument } from "@/lib/pdf/CatalogoDocument";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TipoDocumentoPdf =
  | "LISTA_GENERAL"
  | "LISTA_MAYORISTA"
  | "CATALOGO"
  | "CATALOGO_MAYORISTA";

const SIN_CATEGORIA = "SIN_CATEGORIA";

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[pdf] fetch de imagen falló (${res.status}): ${url}`);
      return null;
    }

    let buffer: Buffer = Buffer.from(await res.arrayBuffer());

    // @react-pdf solo soporta JPG/PNG. No nos fiamos del content-type ni de la
    // extensión (una WebP puede estar guardada como .jpg): miramos los bytes.
    const esJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const esPng =
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

    if (esJpeg) return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    if (esPng) return `data:image/png;base64,${buffer.toString("base64")}`;

    // Cualquier otro formato (ej. WebP) se convierte a JPEG. Si la conversión
    // falla, la foto sale vacía pero el PDF se genera igual.
    try {
      const { default: sharp } = await import("sharp");
      buffer = await sharp(buffer)
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 85 })
        .toBuffer();
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    } catch (err) {
      console.warn(`[pdf] no se pudo convertir la imagen, se omite: ${url}`, err);
      return null;
    }
  } catch (err) {
    console.warn(`[pdf] error descargando imagen: ${url}`, err);
    return null;
  }
}

// Descarga imágenes con concurrencia limitada (evita golpear Vercel Blob
// con muchos requests simultáneos, causa típica de fallos intermitentes)
async function resolverImagenes<T extends { fotoUrl: string | null }>(
  productos: T[],
  concurrencia = 4
): Promise<(T & { fotoDataUri: string | null })[]> {
  const resultado: (T & { fotoDataUri: string | null })[] = productos.map((p) => ({
    ...p,
    fotoDataUri: null,
  }));

  let index = 0;
  async function worker() {
    while (index < productos.length) {
      const i = index++;
      const p = productos[i];
      if (p.fotoUrl) {
        resultado[i].fotoDataUri = await fetchImageAsBase64(p.fotoUrl);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrencia, productos.length) }, () => worker())
  );

  return resultado;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const moneda = sp.get("moneda") === "USD" ? "USD" : "ARS";
  const tipoDocumento = (sp.get("tipoDocumento") as TipoDocumentoPdf) ?? "LISTA_GENERAL";

  const documento = tipoDocumento.startsWith("CATALOGO") ? "CATALOGO" : "LISTA";
  const tipoPrecio: "MINORISTA" | "MAYORISTA" = tipoDocumento.endsWith("MAYORISTA")
    ? "MAYORISTA"
    : "MINORISTA";

  const excluidosRaw = sp.get("categoriasExcluidas")
    ? sp.get("categoriasExcluidas")!.split(",")
    : [];
  const excluirSinCategoria = excluidosRaw.includes(SIN_CATEGORIA);
  const categoriasExcluidas = excluidosRaw
    .filter((v) => v !== SIN_CATEGORIA)
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  let filtroCategoria: Prisma.ProductoWhereInput = {};
  if (categoriasExcluidas.length > 0 && excluirSinCategoria) {
    filtroCategoria = { categoriaId: { notIn: categoriasExcluidas } };
  } else if (categoriasExcluidas.length > 0 && !excluirSinCategoria) {
    filtroCategoria = {
      OR: [{ categoriaId: { notIn: categoriasExcluidas } }, { categoriaId: null }],
    };
  } else if (categoriasExcluidas.length === 0 && excluirSinCategoria) {
    filtroCategoria = { categoriaId: { not: null } };
  }

  const empresaId = await obtenerEmpresaIdActual();

  const where: Prisma.ProductoWhereInput = {
    empresaId,
    activo: true,
    ...filtroCategoria,
    ...(tipoPrecio === "MAYORISTA" ? { precioMayorista: { not: null } } : {}),
  };

  const [productosRaw, configuracion] = await Promise.all([
    prisma.producto.findMany({
      where,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        fotoUrl: true,
        stockActual: true,
        precioVenta: true,
        precioMayorista: true,
        precioCosto: true,
        monedaPrecio: true,
        contenidoMl: true,
      },
    }),
    obtenerConfiguracion(),
  ]);

  if (productosRaw.length === 0) {
    return NextResponse.json(
      { error: "No hay productos que coincidan con los filtros seleccionados." },
      { status: 404 }
    );
  }

  // "Con stock / sin stock" según la sucursal actual (o el total en "Todas").
  const productos = await resolverImagenes(await conStockDeSucursal(productosRaw));

  // Blindaje: el query param "moneda" lo arma el cliente, pero la decisión
  // final es del servidor. Si el negocio no opera con dólares, el PDF
  // siempre sale en ARS, sin importar qué se haya pedido por URL.
  const monedaFinal: "ARS" | "USD" = configuracion.usaCotizacionUSD ? moneda : "ARS";

  const documentoPdf =
    documento === "LISTA" ? (
      <ListaPreciosDocument
        productos={productos}
        configuracion={configuracion}
        tipoPrecio={tipoPrecio}
        moneda={monedaFinal}
      />
    ) : (
      <CatalogoDocument
        productos={productos}
        configuracion={configuracion}
        tipoPrecio={tipoPrecio}
        moneda={monedaFinal}
      />
    );

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(documentoPdf);
  } catch (err) {
    console.error("[pdf] error al renderizar el PDF:", err);
    return NextResponse.json(
      { error: "No se pudo generar el PDF. Intentá de nuevo." },
      { status: 500 }
    );
  }

  const sufijo = tipoDocumento.toLowerCase().replace(/_/g, "-");
  const filename = `${sufijo}-${monedaFinal.toLowerCase()}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}