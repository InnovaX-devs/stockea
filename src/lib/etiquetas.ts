import type { UnidadContenido } from "@/lib/rubro";

export type TamanoEtiqueta = "CHICA" | "MEDIANA";

/** Grilla por hoja A4. CHICA = 24 etiquetas (criterio de aceptación de GO-1). */
export const GRILLA_ETIQUETAS: Record<TamanoEtiqueta, { columnas: number; filas: number }> = {
  CHICA: { columnas: 3, filas: 8 },
  MEDIANA: { columnas: 2, filas: 5 },
};

export function etiquetasPorHoja(tamano: TamanoEtiqueta): number {
  const { columnas, filas } = GRILLA_ETIQUETAS[tamano];
  return columnas * filas;
}

export type PrecioPorUnidad = {
  /** Precio en ARS por 1 kg o por 1 l. */
  precio: number;
  /** Texto para la etiqueta: "por kg" o "por l". */
  base: "kg" | "l";
};

/**
 * Precio por unidad de medida (por kilo / litro) a partir del precio de venta
 * y del contenido. Devuelve null si falta el contenido o la unidad, para que
 * la etiqueta simplemente no muestre esa línea.
 *
 * TODO(GO-1): verificar la normativa vigente de exhibición de precios
 * (si exige kg/l o 100 g/100 ml) antes de dar por cerrado el issue.
 */
export function precioPorUnidadMedida(
  precioArs: number,
  contenido: number | null | undefined,
  unidad: UnidadContenido | string | null | undefined
): PrecioPorUnidad | null {
  if (!Number.isFinite(precioArs) || precioArs <= 0) return null;
  if (contenido == null || !Number.isFinite(contenido) || contenido <= 0) return null;

  switch (unidad) {
    case "G":
      return { precio: (precioArs * 1000) / contenido, base: "kg" };
    case "KG":
      return { precio: precioArs / contenido, base: "kg" };
    case "ML":
      return { precio: (precioArs * 1000) / contenido, base: "l" };
    case "L":
      return { precio: precioArs / contenido, base: "l" };
    default:
      return null;
  }
}

/** Parte la lista en hojas del tamaño pedido (para que cada <Page> tenga su grilla completa). */
export function paginarEtiquetas<T>(items: T[], tamano: TamanoEtiqueta): T[][] {
  const porHoja = etiquetasPorHoja(tamano);
  const hojas: T[][] = [];
  for (let i = 0; i < items.length; i += porHoja) {
    hojas.push(items.slice(i, i + porHoja));
  }
  return hojas;
}