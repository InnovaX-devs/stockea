"use server";

import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import { ErrorArchivo, MAX_BYTES_IMPORTACION, leerYValidarActualizacion } from "@/lib/actualizar-productos-parseo";
import type { ContextoActualizacion } from "@/lib/actualizar-productos-plan";
import {
  aplicarActualizacion,
  previsualizarActualizacion,
  type ResultadoActualizacion,
  type ResumenActualizacion,
} from "@/lib/actualizar-productos";

/**
 * Actualizar productos en lote desde un CSV (issue #109). Solo admin y solo plan Pro,
 * igual que importar productos.
 *
 * Son dos acciones sobre el mismo archivo: "previsualizar" no guarda nada y devuelve qué
 * cambiaría; "aplicar" vuelve a leer y comparar el archivo contra la base y recién ahí
 * escribe, todo en una transacción. La sucursal sale SIEMPRE del servidor.
 */

export type Resultado<T> = { success: true; data: T } | { success: false; error: string };

export type PrevisualizacionActualizacion = ResumenActualizacion & {
  /** Sucursal a la que corresponde el stock mínimo (null si la empresa tiene una sola o se ven "Todas"). */
  sucursal: string | null;
};

/** Valida que sea admin con plan Pro y devuelve el contexto con el que se compara y se escribe. */
async function contexto(): Promise<{ ctx: ContextoActualizacion; sucursal: string | null }> {
  const usuario = await requerirAdmin();
  const config = await obtenerConfiguracion();
  if (!config.habilitarImportacion) {
    throw new ErrorArchivo("Actualizar productos desde un CSV está disponible en el plan Pro. Hablá con InnovaX para cambiar de plan.");
  }
  const { actual, multisucursal } = await obtenerContextoSucursal();
  return {
    ctx: { empresaId: usuario.empresaId, sucursalId: actual?.id ?? null, multisucursal, permiteUSD: config.usaCotizacionUSD },
    sucursal: multisucursal ? (actual?.nombre ?? null) : null,
  };
}

/** Saca el archivo del formulario y controla tipo y tamaño. */
async function leerArchivo(formData: FormData): Promise<Buffer> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new ErrorArchivo("Elegí un archivo CSV (.csv).");
  if (!/\.csv$/i.test(archivo.name)) {
    throw new ErrorArchivo("El archivo tiene que ser un CSV (.csv). Si es un Excel, guardalo como CSV y subilo de nuevo.");
  }
  if (archivo.size > MAX_BYTES_IMPORTACION) {
    throw new ErrorArchivo(`El archivo pesa más de ${Math.round(MAX_BYTES_IMPORTACION / 1024 / 1024)} MB. Dividilo en varios.`);
  }
  return Buffer.from(await archivo.arrayBuffer());
}

function fallo(e: unknown, porDefecto: string): { success: false; error: string } {
  // Solo se muestran los mensajes que escribimos nosotros; el resto va al log.
  if (e instanceof ErrorArchivo || (e instanceof Error && e.message.startsWith("No tenés permiso"))) {
    return { success: false, error: e.message };
  }
  console.error("Actualización de productos desde CSV:", e);
  return { success: false, error: porDefecto };
}

export async function previsualizarActualizacionAction(formData: FormData): Promise<Resultado<PrevisualizacionActualizacion>> {
  try {
    const { ctx, sucursal } = await contexto();
    const parseo = leerYValidarActualizacion(await leerArchivo(formData));
    if (parseo.total === 0) throw new ErrorArchivo("El archivo no tiene productos: completá las filas debajo de los encabezados.");
    return { success: true, data: { ...(await previsualizarActualizacion(ctx, parseo)), sucursal } };
  } catch (e) {
    return fallo(e, "No se pudo leer el archivo.");
  }
}

export async function aplicarActualizacionAction(formData: FormData): Promise<Resultado<ResultadoActualizacion>> {
  try {
    const { ctx } = await contexto();
    const parseo = leerYValidarActualizacion(await leerArchivo(formData));
    const data = await aplicarActualizacion(ctx, parseo);
    revalidatePath("/productos");
    revalidatePath("/historial-precios");
    return { success: true, data };
  } catch (e) {
    return fallo(e, "No se pudo aplicar la actualización. No se cambió nada: probá de nuevo.");
  }
}
