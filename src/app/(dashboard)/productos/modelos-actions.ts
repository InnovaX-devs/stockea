"use server";

import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { configRubro } from "@/lib/rubro";
import { obtenerContextoSucursal, obtenerSucursalIdActual, requerirSucursalId } from "@/lib/sucursal";
import { conStockDeSucursal, sucursalParaMostrarStock } from "@/lib/stock-sucursal";
import { fijarStockVariante, stockDeModelo, type CeldaStock } from "@/lib/modelos-stock";
import {
  actualizarModelo,
  actualizarPreciosDeModelo,
  agregarCombinaciones,
  crearModeloConCombinaciones,
  eliminarCombinacion,
  obtenerModeloDetalle,
  type ModeloDetalle,
  type CombinacionNueva,
  type NuevoModelo,
} from "@/lib/modelos";

/**
 * Acciones de modelos de ropa (RV-3). Son solo del admin y solo para el rubro
 * Ropa. La sucursal donde se carga el stock sale SIEMPRE del servidor, nunca
 * de lo que mande el navegador.
 */

export type Resultado<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : { data: T }))
  | { success: false; error: string };

const error = (e: unknown, porDefecto: string) => ({
  success: false as const,
  error: e instanceof Error ? e.message : porDefecto,
});

/** Empresa del admin actual, validando que su rubro use variantes. */
async function contexto() {
  const usuario = await requerirAdmin();
  const config = await obtenerConfiguracion();
  if (!configRubro(config.rubro).usaTallesColores) {
    throw new Error("Los modelos con talle y color son solo para el rubro Ropa.");
  }
  return usuario.empresaId;
}

export async function crearModeloAction(entrada: NuevoModelo): Promise<Resultado<{ modeloId: number; combinaciones: number }>> {
  try {
    const empresaId = await contexto();
    const sucursalId = await obtenerSucursalIdActual();
    const data = await crearModeloConCombinaciones(empresaId, sucursalId, entrada);
    revalidatePath("/productos");
    return { success: true, data };
  } catch (e) {
    return error(e, "No se pudo crear el modelo.");
  }
}

export async function obtenerModeloAction(modeloId: number): Promise<Resultado<ModeloDetalle>> {
  try {
    const empresaId = await contexto();
    const modelo = await obtenerModeloDetalle(empresaId, Number(modeloId));
    if (!modelo) throw new Error("El modelo no existe.");
    // Stock de la sucursal en la que se trabaja (antes mostraba el total de
    // todas las sucursales aunque hubiera una elegida).
    return { success: true, data: { ...modelo, variantes: await conStockDeSucursal(modelo.variantes) } };
  } catch (e) {
    return error(e, "No se pudo cargar el modelo.");
  }
}

export async function guardarModeloAction(
  modeloId: number,
  datos: { nombre: string; marcaId?: number | null; categoriaId?: number | null }
): Promise<Resultado<{ variantes: number }>> {
  try {
    const empresaId = await contexto();
    const data = await actualizarModelo(empresaId, Number(modeloId), datos);
    revalidatePath("/productos");
    return { success: true, data };
  } catch (e) {
    return error(e, "No se pudo guardar el modelo.");
  }
}

export async function agregarCombinacionesAction(
  modeloId: number,
  nuevas: CombinacionNueva[]
): Promise<Resultado<{ creadas: number }>> {
  try {
    const empresaId = await contexto();
    const sucursalId = await obtenerSucursalIdActual();
    const data = await agregarCombinaciones(empresaId, sucursalId, Number(modeloId), nuevas);
    revalidatePath("/productos");
    return { success: true, data };
  } catch (e) {
    return error(e, "No se pudieron agregar las combinaciones.");
  }
}

/** Sin `productoIds`, cambia el precio de TODAS las combinaciones del modelo. */
export async function actualizarPreciosModeloAction(
  modeloId: number,
  precios: { precioCosto?: number; precioVenta?: number; precioMayorista?: number },
  productoIds?: number[]
): Promise<Resultado<{ actualizadas: number }>> {
  try {
    const empresaId = await contexto();
    const data = await actualizarPreciosDeModelo(empresaId, Number(modeloId), precios, productoIds?.map(Number));
    revalidatePath("/productos");
    revalidatePath("/historial-precios");
    return { success: true, data };
  } catch (e) {
    return error(e, "No se pudieron actualizar los precios.");
  }
}

/** Borra una combinación que nunca se usó (sin stock ni movimientos). */
export async function eliminarCombinacionAction(modeloId: number, productoId: number): Promise<Resultado<{ nombre: string }>> {
  try {
    const empresaId = await contexto();
    const data = await eliminarCombinacion(empresaId, Number(modeloId), Number(productoId));
    revalidatePath("/productos");
    return { success: true, data };
  } catch (e) {
    return error(e, "No se pudo borrar la combinación.");
  }
}

export type StockModelo = {
  nombre: string;
  /** Sucursal cuyo stock se muestra; null = total de todas (no se puede editar). */
  sucursal: string | null;
  /** Se puede editar el stock (hay una sucursal concreta). */
  editable: boolean;
  variantes: CeldaStock[];
};

/** Grilla de stock talle × color de un modelo (RV-4, #63). */
export async function stockModeloAction(modeloId: number): Promise<Resultado<StockModelo>> {
  try {
    const empresaId = await contexto();
    const [{ actual, multisucursal }, sucursalStock] = await Promise.all([obtenerContextoSucursal(), sucursalParaMostrarStock()]);
    const datos = await stockDeModelo(empresaId, Number(modeloId), sucursalStock);
    if (!datos) throw new Error("El modelo no existe.");
    return {
      success: true,
      data: {
        nombre: datos.nombre,
        sucursal: multisucursal ? (actual?.nombre ?? null) : null,
        editable: actual != null,
        variantes: datos.variantes,
      },
    };
  } catch (e) {
    return error(e, "No se pudo cargar el stock del modelo.");
  }
}

/** Cambia el stock de una combinación en la sucursal actual (edición rápida de la grilla). */
export async function fijarStockVarianteAction(
  modeloId: number,
  productoId: number,
  cantidad: number
): Promise<Resultado<{ nombre: string; anterior: number; nuevo: number }>> {
  try {
    const empresaId = await contexto();
    const sucursalId = await requerirSucursalId();
    const data = await fijarStockVariante(empresaId, sucursalId, Number(modeloId), Number(productoId), Number(cantidad));
    revalidatePath("/productos");
    return { success: true, data };
  } catch (e) {
    return error(e, "No se pudo cambiar el stock.");
  }
}
