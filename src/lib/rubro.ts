/**
 * Rubro del negocio: ÚNICA fuente de verdad de lo que cambia según el tipo de
 * negocio (qué campos se muestran, textos de ejemplo, categorías sugeridas).
 *
 * El plan (Licencia BASICO/PREMIUM) dice cuánto se puede usar; el rubro dice
 * qué tipo de negocio es. Nada más en el código debe decidir esto mirando el
 * nombre de la empresa u otra cosa: se pregunta acá.
 *
 * Cambiar el rubro NUNCA borra datos: solo oculta o muestra campos. Por eso
 * los endpoints que guardan un campo oculto (ej. el contenido) lo dejan como
 * está en vez de pisarlo con null.
 *
 * Este archivo es puro (sin imports de servidor), se puede usar desde
 * componentes de cliente y del servidor.
 */

export const RUBROS = ["GENERAL", "ALMACEN", "PERFUMERIA", "ROPA"] as const;
export type Rubro = (typeof RUBROS)[number];

export const RUBRO_POR_DEFECTO: Rubro = "GENERAL";

/** Espejo del enum UnidadContenido de Prisma (este archivo no importa del servidor). */
export const UNIDADES_CONTENIDO = ["ML", "L", "G", "KG"] as const;
export type UnidadContenido = (typeof UNIDADES_CONTENIDO)[number];

/** Cómo se escribe cada unidad para el usuario ("100 ml", "500 g"). */
export const ETIQUETA_UNIDAD: Record<UnidadContenido, string> = { ML: "ml", L: "l", G: "g", KG: "kg" };

export function esUnidadContenido(valor: unknown): valor is UnidadContenido {
  return (UNIDADES_CONTENIDO as readonly string[]).includes(valor as string);
}

const formatoContenido = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/**
 * "100 ml", "500 g", "1,5 l". Devuelve null si falta la cantidad, la unidad o
 * la cantidad no es positiva (para poder encadenar con `.filter(Boolean)`).
 */
export function formatearContenido(contenido: number | null | undefined, unidad: UnidadContenido | string | null | undefined): string | null {
  if (contenido == null || !Number.isFinite(contenido) || contenido <= 0 || !esUnidadContenido(unidad)) return null;
  return `${formatoContenido.format(contenido)} ${ETIQUETA_UNIDAD[unidad]}`;
}

/**
 * Igual que formatearContenido, pero respeta el rubro: si el rubro no ofrece la
 * unidad (ej. Ropa, o ml en un rubro que no lo usa) no se muestra. Los datos
 * quedan guardados, solo se ocultan.
 */
export function contenidoVisible(
  rubro: unknown,
  contenido: number | null | undefined,
  unidad: UnidadContenido | string | null | undefined
): string | null {
  if (!esUnidadContenido(unidad) || !CONFIG[normalizarRubro(rubro)].unidadesContenido.includes(unidad)) return null;
  return formatearContenido(contenido, unidad);
}

export type ConfigRubro = {
  rubro: Rubro;
  /** Nombre para mostrar en el panel InnovaX. */
  nombre: string;
  /** Unidades de contenido que se ofrecen (en orden). Vacío = el rubro no usa contenido y el campo no se muestra. */
  unidadesContenido: UnidadContenido[];
  /** Atajo: el rubro usa contenido (cantidad + unidad) en productos, catálogo, listados y tickets. */
  usaContenido: boolean;
  /** Ropa: muestra la lista de talles y colores sugeridos en Configuración y el alta de modelos con variantes. */
  usaTallesColores: boolean;
  /** Ejemplos y textos de ayuda que dependen del tipo de negocio. */
  textos: {
    /** Buscador de producto en Ventas ("Buscar … o escanear código de barras..."). */
    buscarProductoVenta: string;
    /** Buscador del listado/catálogo de productos y de consultar precio. */
    buscarProductoListado: string;
    /** Buscador de producto al armar un presupuesto. */
    buscarProductoPresupuesto: string;
    /** Placeholder del eslogan en Configuración. */
    ejemploEslogan: string;
    /** Placeholder al crear una marca. */
    ejemploMarca: string;
    /** Placeholder al crear una categoría. */
    ejemploCategoria: string;
  };
  /** Categorías que se ofrecen como atajo al crear una categoría. */
  categoriasSugeridas: string[];
};

const CONFIG: Record<Rubro, ConfigRubro> = {
  GENERAL: {
    rubro: "GENERAL",
    nombre: "General",
    unidadesContenido: ["ML", "L", "G", "KG"],
    usaContenido: true,
    usaTallesColores: false,
    textos: {
      buscarProductoVenta: "Buscar producto o escanear código de barras...",
      buscarProductoListado: "Buscar por nombre o marca...",
      buscarProductoPresupuesto: "Buscar producto (incluye productos sin stock)...",
      ejemploEslogan: "Ej: Todo para tu hogar",
      ejemploMarca: "Ej: Philips",
      ejemploCategoria: "Ej: Accesorios",
    },
    categoriasSugeridas: [],
  },
  ALMACEN: {
    rubro: "ALMACEN",
    nombre: "Almacén",
    unidadesContenido: ["G", "KG", "ML", "L"],
    usaContenido: true,
    usaTallesColores: false,
    textos: {
      buscarProductoVenta: "Buscar producto o escanear código de barras...",
      buscarProductoListado: "Buscar por nombre o marca...",
      buscarProductoPresupuesto: "Buscar producto (incluye productos sin stock)...",
      ejemploEslogan: "Ej: Tu almacén de barrio",
      ejemploMarca: "Ej: La Serenísima",
      ejemploCategoria: "Ej: Bebidas",
    },
    categoriasSugeridas: ["Bebidas", "Lácteos", "Fiambres", "Almacén", "Golosinas", "Limpieza", "Perfumería", "Congelados"],
  },
  PERFUMERIA: {
    rubro: "PERFUMERIA",
    nombre: "Perfumería",
    unidadesContenido: ["ML"],
    usaContenido: true,
    usaTallesColores: false,
    textos: {
      buscarProductoVenta: "Buscar perfume o escanear código de barras...",
      buscarProductoListado: "Buscar perfume por nombre o marca...",
      buscarProductoPresupuesto: "Buscar perfume (incluye productos sin stock)...",
      ejemploEslogan: "Ej: Perfumería de Lujo",
      ejemploMarca: "Ej: Chanel",
      ejemploCategoria: "Ej: Perfumes",
    },
    categoriasSugeridas: ["Perfumes", "Cremas", "Maquillaje", "Cuidado capilar", "Cuidado personal", "Accesorios"],
  },
  ROPA: {
    rubro: "ROPA",
    nombre: "Ropa",
    unidadesContenido: [],
    usaContenido: false,
    usaTallesColores: true,
    textos: {
      buscarProductoVenta: "Buscar prenda o escanear código de barras...",
      buscarProductoListado: "Buscar prenda por nombre o marca...",
      buscarProductoPresupuesto: "Buscar prenda (incluye productos sin stock)...",
      ejemploEslogan: "Ej: Moda para todos los días",
      ejemploMarca: "Ej: Nike",
      ejemploCategoria: "Ej: Remeras",
    },
    categoriasSugeridas: ["Remeras", "Pantalones", "Camperas", "Vestidos", "Calzado", "Ropa interior", "Accesorios"],
  },
};

/** Valida un valor cualquiera (de la base o de un formulario) y devuelve un Rubro. */
export function normalizarRubro(valor: unknown): Rubro {
  return (RUBROS as readonly string[]).includes(valor as string) ? (valor as Rubro) : RUBRO_POR_DEFECTO;
}

/** Todo lo que cambia según el rubro. Un valor desconocido cae en GENERAL. */
export function configRubro(rubro: unknown): ConfigRubro {
  return CONFIG[normalizarRubro(rubro)];
}

export const NOMBRES_RUBRO: Record<Rubro, string> = {
  GENERAL: CONFIG.GENERAL.nombre,
  ALMACEN: CONFIG.ALMACEN.nombre,
  PERFUMERIA: CONFIG.PERFUMERIA.nombre,
  ROPA: CONFIG.ROPA.nombre,
};
