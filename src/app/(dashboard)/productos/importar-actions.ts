"use server";

import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { configRubro } from "@/lib/rubro";
import { obtenerContextoSucursal, obtenerSucursalIdActual } from "@/lib/sucursal";
import {
  ErrorArchivo,
  MAX_BYTES_IMPORTACION,
  leerYValidarArchivo,
  type OpcionesParseo,
} from "@/lib/importar-productos-parseo";
import {
  analizarImportacion,
  importarFilas,
  type ResultadoImportacion,
  type ResumenImportacion,
} from "@/lib/importar-productos";

/**
 * Importar productos desde Excel (solo admin y solo plan Pro).
 *
 * Son dos acciones sobre el mismo archivo: "previsualizar" no guarda nada y
 * devuelve el resumen; "importar" vuelve a leer y validar el archivo y recién
 * ahí crea. La sucursal donde entra el stock sale SIEMPRE del servidor.
 */

export type Resultado<T> = { success: true; data: T } | { success: false; error: string };

export type PrevisualizacionImportacion = ResumenImportacion & {
  /** Sucursal donde se va a cargar el stock (null si la empresa tiene una sola). */
  sucursal: string | null;
  /** Hay stock para cargar pero no hay una sucursal elegida ("Todas"): no se puede importar. */
  bloqueo: string | null;
};

/** Valida que sea admin con plan Pro y devuelve lo que hace falta para leer el archivo. */
async function contexto(): Promise<{ empresaId: number; opciones: OpcionesParseo }> {
  const usuario = await requerirAdmin();
  const config = await obtenerConfiguracion();
  if (!config.habilitarImportacion) {
    throw new ErrorArchivo("La importación desde Excel está disponible en el plan Pro. Hablá con InnovaX para cambiar de plan.");
  }
  return {
    empresaId: usuario.empresaId,
    opciones: { usaTallesColores: configRubro(config.rubro).usaTallesColores, permiteUSD: config.usaCotizacionUSD },
  };
}

/** Saca el archivo del formulario y controla tipo y tamaño. */
async function leerArchivo(formData: FormData): Promise<Buffer> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new ErrorArchivo("Elegí un archivo Excel (.xlsx).");
  if (!/\.(xlsx|csv)$/i.test(archivo.name)) {
    throw new ErrorArchivo("El archivo tiene que ser un Excel (.xlsx) o un CSV (.csv). Si es un .xls viejo, abrilo en Excel y guardalo como .xlsx.");
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
  console.error("Importación de productos:", e);
  return { success: false, error: porDefecto };
}

export async function previsualizarImportacionAction(formData: FormData): Promise<Resultado<PrevisualizacionImportacion>> {
  try {
    const { empresaId, opciones } = await contexto();
    const parseo = await leerYValidarArchivo(await leerArchivo(formData), opciones);
    if (parseo.total === 0) throw new ErrorArchivo("El archivo no tiene productos: completá la hoja \"Productos\" debajo de los encabezados.");

    const { resumen } = await analizarImportacion(empresaId, parseo.validas, parseo.errores, parseo.total);
    const [{ actual, multisucursal }, sucursalId] = await Promise.all([obtenerContextoSucursal(), obtenerSucursalIdActual()]);
    return {
      success: true,
      data: {
        ...resumen,
        sucursal: multisucursal ? (actual?.nombre ?? null) : null,
        bloqueo:
          sucursalId == null && resumen.stockTotal > 0
            ? "Elegí una sucursal en la barra superior para cargar el stock (hoy estás viendo \"Todas\")."
            : null,
      },
    };
  } catch (e) {
    return fallo(e, "No se pudo leer el archivo.");
  }
}

export async function importarProductosAction(formData: FormData): Promise<Resultado<ResultadoImportacion>> {
  try {
    const { empresaId, opciones } = await contexto();
    const parseo = await leerYValidarArchivo(await leerArchivo(formData), opciones);
    const { aCrear } = await analizarImportacion(empresaId, parseo.validas, parseo.errores, parseo.total);
    if (aCrear.length === 0) throw new ErrorArchivo("No hay productos nuevos para importar.");

    const data = await importarFilas(empresaId, await obtenerSucursalIdActual(), aCrear);
    revalidatePath("/productos");
    revalidatePath("/marcas-categorias");
    return { success: true, data };
  } catch (e) {
    return fallo(e, "No se pudo importar. Revisá la lista de productos: puede que una parte haya entrado.");
  }
}
