import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { calcularNuevoPrecio, type TipoAjuste } from "@/lib/calculos/ajuste-precios";

/**
 * Actualización masiva de precios (Productos → Actualizar Precios), ya sin la parte web:
 * valida el pedido y escribe los precios y el historial en UNA transacción.
 * La ruta /api/productos/actualizar-precios solo resuelve la empresa y traduce errores.
 *
 * Dos formas de ajustar:
 *  - el mismo porcentaje o monto para todos (`productoIds` + `valor`), o
 *  - uno distinto por producto (`ajustes`): los productos que no vienen no se tocan.
 */

export type TipoPrecio = "costo" | "minorista" | "mayorista" | "oferta";

export interface PayloadActualizarPrecios {
  /** Mismo ajuste para todos: los productos y el valor único. */
  productoIds?: number[];
  valor?: number;
  /** Ajuste distinto por producto: reemplaza a `productoIds` y `valor`. */
  ajustes?: { productoId: number; valor: number }[];
  tipoAjuste: TipoAjuste;
  tiposPrecio: TipoPrecio[];
}

/** Un pedido que no se puede atender (datos inválidos, productos que no existen). */
export class ErrorSolicitud extends Error {
  constructor(
    mensaje: string,
    public status = 400
  ) {
    super(mensaje);
  }
}

type Db = Pick<typeof prisma, "producto" | "historialPrecio" | "$transaction">;

const CAMPOS: Record<TipoPrecio, "precioCosto" | "precioVenta" | "precioMayorista" | "precioOferta"> = {
  costo: "precioCosto",
  minorista: "precioVenta",
  mayorista: "precioMayorista",
  oferta: "precioOferta",
};

// El historial no tiene el tipo "oferta" (CampoPrecio: COSTO / MINORISTA / MAYORISTA): antes se
// intentaba guardar "OFERTA" y fallaba TODA la actualización.
const CAMPO_HISTORIAL = { costo: "COSTO", minorista: "MINORISTA", mayorista: "MAYORISTA" } as const;

export async function actualizarPreciosMasivo(db: Db, empresaId: number, body: PayloadActualizarPrecios): Promise<{ cantidadAfectados: number }> {
  const { tipoAjuste, valor, tiposPrecio, ajustes } = body;
  let productoIds = body.productoIds;

  // Validaciones
  if (tipoAjuste !== "PORCENTAJE" && tipoAjuste !== "VALOR_FIJO") {
    throw new ErrorSolicitud("El tipo de ajuste no es válido");
  }

  // Ajuste distinto por producto: un valor para cada uno.
  let valorPorProducto: Map<number, number> | null = null;
  if (ajustes !== undefined) {
    if (!Array.isArray(ajustes) || ajustes.length === 0) {
      throw new ErrorSolicitud("Ingresá el ajuste de al menos un producto");
    }
    valorPorProducto = new Map();
    for (const a of ajustes) {
      const id = Number(a?.productoId);
      const v = Number(a?.valor);
      if (!Number.isInteger(id) || !Number.isFinite(v) || v === 0) {
        throw new ErrorSolicitud("Cada ajuste debe tener un producto y un valor numérico distinto de 0");
      }
      if (valorPorProducto.has(id)) throw new ErrorSolicitud("Hay un producto repetido en los ajustes");
      valorPorProducto.set(id, v);
    }
    productoIds = [...valorPorProducto.keys()];
  } else {
    if (!productoIds || !Array.isArray(productoIds) || productoIds.length === 0) {
      throw new ErrorSolicitud("Debes seleccionar al menos un producto");
    }
    if (typeof valor !== "number" || isNaN(valor) || valor === 0) {
      throw new ErrorSolicitud("El valor de ajuste debe ser un número distinto de 0");
    }
  }

  if (!tiposPrecio || tiposPrecio.length === 0) {
    throw new ErrorSolicitud("Debes seleccionar al menos un tipo de precio para ajustar");
  }

  // Obtener los productos actuales a actualizar (solo de esta empresa —
  // si algún id de productoIds pertenece a otra empresa, queda afuera).
  const productos = await db.producto.findMany({
    where: { id: { in: productoIds }, empresaId, esPromocion: false }, // las promociones tienen su sección (#114)
  });
  if (productos.length === 0) throw new ErrorSolicitud("No se encontraron los productos seleccionados", 404);

  const historialRegistros: Prisma.HistorialPrecioCreateManyInput[] = [];
  const updates: ReturnType<Db["producto"]["update"]>[] = [];

  for (const prod of productos) {
    // Mismo ajuste para todos, o el que se cargó para este producto.
    const valorProducto = valorPorProducto ? valorPorProducto.get(prod.id) : valor;
    if (valorProducto === undefined) continue;
    const dataUpdate: Prisma.ProductoUpdateInput = {};

    for (const t of tiposPrecio) {
      const campo = CAMPOS[t];
      if (!campo) continue;
      const precioAnterior = prod[campo];
      if (precioAnterior === null || precioAnterior === undefined) continue;

      const nuevoPrecio = calcularNuevoPrecio(precioAnterior, tipoAjuste, valorProducto);
      if (nuevoPrecio === null || nuevoPrecio === precioAnterior) continue;

      dataUpdate[campo] = nuevoPrecio;
      const campoHistorial = CAMPO_HISTORIAL[t as keyof typeof CAMPO_HISTORIAL];
      if (campoHistorial) {
        historialRegistros.push({
          productoId: prod.id,
          empresaId,
          campo: campoHistorial,
          valorAnterior: precioAnterior,
          valorNuevo: nuevoPrecio,
          origen: "ACTUALIZACION_MASIVA",
        });
      }
    }

    if (Object.keys(dataUpdate).length > 0) {
      updates.push(db.producto.update({ where: { id: prod.id }, data: dataUpdate }));
    }
  }

  // Ejecutar actualización e historial en una sola transacción
  await db.$transaction([
    ...updates,
    ...(historialRegistros.length > 0 ? [db.historialPrecio.createMany({ data: historialRegistros })] : []),
  ]);

  return { cantidadAfectados: updates.length };
}
