"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioActual } from "@/lib/empresa";
import {
  emitirComprobante,
  FacturaError,
  LETRA_TIPO,
  NOMBRE_TIPO,
  numeroFormateado,
  prepararFacturaDeVenta,
  TOPE_CONSUMIDOR_FINAL,
  type DocumentoReceptor,
} from "@/lib/arca/factura";
import { ArcaError } from "@/lib/arca/wsaa";
import { normalizarCuit } from "@/lib/arca/certificado";

/**
 * Facturar ventas (admin y empleado: es parte de vender). Siempre después
 * de guardar la venta, nunca dentro de su transacción.
 */

export type ResumenFactura = {
  id: number;
  estado: "PENDIENTE" | "AUTORIZADO" | "RECHAZADO";
  nombre: string; // "Factura C"
  letra: string;
  numero: string | null; // "00001-00000012"
  cae: string | null;
  caeVencimiento: string | null;
  error: string | null;
  entorno: "HOMOLOGACION" | "PRODUCCION";
};

async function resumenFactura(c: {
  id: number; estado: string; tipo: number; puntoVenta: number; numero: number | null;
  cae: string | null; caeVencimiento: Date | null; error: string | null; entorno: string;
}): Promise<ResumenFactura> {
  return {
    id: c.id,
    estado: c.estado as ResumenFactura["estado"],
    nombre: NOMBRE_TIPO[c.tipo] ?? `Comprobante ${c.tipo}`,
    letra: LETRA_TIPO[c.tipo] ?? "",
    numero: c.numero != null ? numeroFormateado(c.puntoVenta, c.numero) : null,
    cae: c.cae,
    caeVencimiento: c.caeVencimiento?.toISOString() ?? null,
    error: c.error,
    entorno: c.entorno as ResumenFactura["entorno"],
  };
}

/** Para Nueva venta: ¿se puede facturar? ¿viene prendido el interruptor? */
export async function facturacionParaVenta(): Promise<{ disponible: boolean; porDefecto: boolean; enPrueba: boolean; tope: number }> {
  const usuario = await obtenerUsuarioActual();
  const c = await prisma.configuracion.findUnique({
    where: { empresaId: usuario.empresaId },
    select: { facturacionHabilitada: true, facturarPorDefecto: true, arcaCertificado: true, arcaEntorno: true },
  });
  const disponible = Boolean(c?.facturacionHabilitada && c.arcaCertificado);
  return { disponible, porDefecto: disponible && Boolean(c?.facturarPorDefecto), enPrueba: c?.arcaEntorno !== "PRODUCCION", tope: TOPE_CONSUMIDOR_FINAL };
}

function documentoValido(doc?: DocumentoReceptor | null): DocumentoReceptor | null | string {
  if (!doc || !doc.numero?.trim()) return null;
  const numero = doc.numero.replace(/[\s.-]/g, "");
  if (doc.tipo === "DNI") return /^\d{7,8}$/.test(numero) ? { tipo: "DNI", numero } : "El DNI tiene que tener 7 u 8 números.";
  const cuit = normalizarCuit(numero);
  return cuit ? { tipo: doc.tipo, numero: cuit } : `El ${doc.tipo} no es válido.`;
}

/**
 * Factura una venta. Si ARCA no responde, la factura queda PENDIENTE y se
 * puede reintentar desde el historial sin riesgo de duplicarla.
 */
export async function facturarVenta(
  ventaId: number,
  documento?: DocumentoReceptor | null
): Promise<{ success: true; factura: ResumenFactura } | { success: false; error: string; factura?: ResumenFactura }> {
  const usuario = await obtenerUsuarioActual();
  const doc = documentoValido(documento);
  if (typeof doc === "string") return { success: false, error: doc };

  let comprobanteId: number | null = null;
  try {
    const preparado = await prepararFacturaDeVenta(usuario.empresaId, ventaId, doc);
    comprobanteId = preparado.comprobanteId;
    const comp = preparado.yaAutorizada
      ? await prisma.comprobante.findUniqueOrThrow({ where: { id: comprobanteId } })
      : await emitirComprobante(usuario.empresaId, comprobanteId);
    const factura = await resumenFactura(comp);
    revalidatePath("/ventas/historial");
    if (comp.estado === "AUTORIZADO") return { success: true, factura };
    return { success: false, error: `ARCA rechazó la factura. ${comp.error ?? ""}`.trim(), factura };
  } catch (e) {
    const factura = comprobanteId
      ? await resumenFactura(await prisma.comprobante.findUniqueOrThrow({ where: { id: comprobanteId } }))
      : undefined;
    revalidatePath("/ventas/historial");
    const mensaje =
      e instanceof FacturaError || e instanceof ArcaError
        ? e.message
        : "No se pudo facturar. La venta quedó guardada: podés reintentar la factura desde el historial.";
    return { success: false, error: mensaje, factura };
  }
}

export async function facturaDeVenta(ventaId: number): Promise<ResumenFactura | null> {
  const usuario = await obtenerUsuarioActual();
  const c = await prisma.comprobante.findFirst({
    where: { ventaId, empresaId: usuario.empresaId, tipo: { in: [1, 6, 11] } },
    orderBy: { id: "desc" },
  });
  return c ? resumenFactura(c) : null;
}
