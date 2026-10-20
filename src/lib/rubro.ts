/**
 * Rubro del negocio: ÚNICA fuente de verdad de lo que cambia según el tipo de
 * negocio (qué campos se muestran, textos de ejemplo, categorías sugeridas).
 *
 * El plan (Licencia BASICO/PREMIUM) dice cuánto se puede usar; el rubro dice
 * qué tipo de negocio es. Nada más en el código debe decidir esto mirando el
 * nombre de la empresa u otra cosa: se pregunta acá.
 *
 * Cambiar el rubro NUNCA borra datos: solo oculta o muestra campos. Por eso
 * los endpoints que guardan un campo oculto (ej. contenidoMl) lo dejan como
 * está en vez de pisarlo con null.
 *
 * Este archivo es puro (sin imports de servidor), se puede usar desde
 * componentes de cliente y del servidor.
 */

export const RUBROS = ["GENERAL", "ALMACEN", "PERFUMERIA", "ROPA"] as const;
export type Rubro = (typeof RUBROS)[number];

export const RUBRO_POR_DEFECTO: Rubro = "GENERAL";

export type ConfigRubro = {
  rubro: Rubro;
  /** Nombre para mostrar en el panel InnovaX. */
  nombre: string;
  /** Muestra el contenido en ml (contenidoMl) en productos, catálogo y listados. */
  usaMl: boolean;
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
    usaMl: false,
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
    // Provisorio: un almacén/dietética puede tener productos con ml. Se reemplaza
    // por cantidad + unidad configurable en RV-8 (#67).
    usaMl: true,
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
    usaMl: true,
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
    usaMl: false,
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
