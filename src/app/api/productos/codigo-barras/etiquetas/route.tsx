import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import bwipjs from "bwip-js/node";
import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { toArs, redondearARS } from "@/lib/currency";
import { simbologia } from "@/lib/codigo-barras";
import { CodigosBarrasDocument, type EtiquetaCodigo, type FormatoEtiqueta } from "@/lib/pdf/CodigosBarrasDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ETIQUETAS = 3000;
const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** PNG del código de barras. Si el código no cumple su formato, se dibuja como Code 128. */
async function dibujar(codigo: string): Promise<string> {
  // EAN/UPC llevan los números en su posición estándar (con las barras guía
  // más largas); Code 128 con el texto centrado. El margen blanco (zona de
  // silencio) a los costados es necesario para que el lector lo tome.
  const base = { scale: 3, height: 12, includetext: true, paddingwidth: 10, paddingheight: 2 };
  const code128 = () => bwipjs.toBuffer({ ...base, bcid: "code128", text: codigo, textxalign: "center" });
  const tipo = simbologia(codigo);
  let png: Buffer;
  try {
    png = tipo === "code128" ? await code128() : await bwipjs.toBuffer({ ...base, bcid: tipo, text: codigo });
  } catch {
    png = await code128();
  }
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * POST /api/productos/codigo-barras/etiquetas (issue #106). Solo admin.
 * Body: { items: [{ id, cantidad }], formato: "A4" | "ROLLO", conPrecio, tipoPrecio }
 * Los productos sin código de barras se saltean.
 */
export async function POST(request: NextRequest) {
  let empresaId: number;
  try {
    empresaId = (await requerirAdmin()).empresaId;
  } catch {
    return NextResponse.json({ error: "No tenés permiso para hacer esto." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const formato: FormatoEtiqueta = body?.formato === "ROLLO" ? "ROLLO" : "A4";
  const conPrecio = body?.conPrecio === true;
  const mayorista = body?.tipoPrecio === "MAYORISTA";

  const cantidades = new Map<number, number>();
  for (const it of Array.isArray(body?.items) ? body.items : []) {
    const id = Number(it?.id);
    const cantidad = Math.floor(Number(it?.cantidad));
    if (Number.isInteger(id) && id > 0 && cantidad > 0) cantidades.set(id, (cantidades.get(id) ?? 0) + cantidad);
  }
  const total = [...cantidades.values()].reduce((a, n) => a + n, 0);
  if (total === 0) return NextResponse.json({ error: "Elegí al menos un producto y la cantidad de etiquetas." }, { status: 400 });
  if (total > MAX_ETIQUETAS) {
    return NextResponse.json({ error: `Máximo ${MAX_ETIQUETAS} etiquetas por PDF (pediste ${total}).` }, { status: 400 });
  }

  const [productos, configuracion] = await Promise.all([
    prisma.producto.findMany({
      where: { id: { in: [...cantidades.keys()] }, empresaId },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, codigoBarras: true, precioVenta: true, precioMayorista: true, monedaPrecio: true },
    }),
    obtenerConfiguracion(),
  ]);
  const conCodigo = productos.filter((p) => p.codigoBarras && p.codigoBarras.trim() !== "");
  if (conCodigo.length === 0) {
    return NextResponse.json({ error: "Los productos elegidos no tienen código de barras. Generalos primero." }, { status: 400 });
  }

  const cotizacion = configuracion.usaCotizacionUSD ? configuracion.cotizacionUSD : 1;
  const etiquetas: EtiquetaCodigo[] = [];
  try {
    const imagenes = new Map<string, string>();
    for (const p of conCodigo) {
      const codigo = p.codigoBarras!.trim();
      if (!imagenes.has(codigo)) imagenes.set(codigo, await dibujar(codigo));
    }
    for (const p of conCodigo) {
      const codigo = p.codigoBarras!.trim();
      const base = mayorista && p.precioMayorista != null ? p.precioMayorista : p.precioVenta;
      const precio = conPrecio ? pesos.format(redondearARS(toArs(base, p.monedaPrecio, cotizacion))) : null;
      const etiqueta = { nombre: p.nombre, codigo, imagen: imagenes.get(codigo)!, precio };
      for (let i = 0; i < (cantidades.get(p.id) ?? 0); i++) etiquetas.push(etiqueta);
    }
  } catch (error) {
    console.error("[codigos de barras] error al dibujar los códigos:", error);
    return NextResponse.json({ error: "No se pudo dibujar alguno de los códigos." }, { status: 500 });
  }

  const documento = <CodigosBarrasDocument etiquetas={etiquetas} formato={formato} />;
  try {
    const buffer = await renderToBuffer(documento);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="codigos-de-barras-${formato.toLowerCase()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[codigos de barras] error al generar el PDF:", error);
    return NextResponse.json({ error: "No se pudo generar el PDF. Probá de nuevo." }, { status: 500 });
  }
}
