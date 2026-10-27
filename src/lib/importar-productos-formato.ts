/**
 * Formato del Excel de importación de productos (solo plan Pro): qué columnas
 * tiene según el rubro y qué otros nombres se aceptan. PURO y sin librerías de
 * servidor, así lo usan tanto el lector (importar-productos-parseo.ts) como la
 * pantalla (para mostrar el ejemplo de cómo tiene que verse el archivo).
 */

export type CampoImportacion =
  | "nombre"
  | "talle"
  | "color"
  | "codigoBarras"
  | "marca"
  | "categoria"
  | "moneda"
  | "precioCosto"
  | "precioVenta"
  | "precioMayorista"
  | "alicuotaIva"
  | "stock"
  | "stockMinimo";

/** Cómo se llama cada columna en la plantilla y qué otros nombres se aceptan. */
export const ENCABEZADOS: Record<CampoImportacion, { titulo: string; alias: string[] }> = {
  nombre: { titulo: "Producto", alias: ["producto", "nombre", "modelo", "articulo", "descripcion", "nombredelproducto", "nombredelmodelo"] },
  talle: { titulo: "Talle", alias: ["talle", "talla", "size"] },
  color: { titulo: "Color", alias: ["color"] },
  codigoBarras: { titulo: "Código de barras", alias: ["codigodebarras", "codigobarras", "codbarras", "codigo", "ean", "sku", "barcode"] },
  marca: { titulo: "Marca", alias: ["marca"] },
  categoria: { titulo: "Categoría", alias: ["categoria", "familia"] },
  moneda: { titulo: "Moneda", alias: ["moneda"] },
  precioCosto: { titulo: "Costo", alias: ["costo", "preciocosto", "preciodecosto"] },
  precioVenta: { titulo: "Precio de venta", alias: ["precio", "precioventa", "preciodeventa", "pvp", "preciominorista", "minorista", "venta"] },
  precioMayorista: { titulo: "Precio mayorista", alias: ["mayorista", "preciomayorista", "preciodemayorista"] },
  alicuotaIva: { titulo: "IVA %", alias: ["iva", "alicuotaiva", "alicuota"] },
  stock: { titulo: "Stock", alias: ["stock", "stockinicial", "cantidad", "existencia"] },
  stockMinimo: { titulo: "Stock mínimo", alias: ["stockminimo", "minimo", "stockmin"] },
};

export type OpcionesParseo = {
  /** Rubro Ropa: se leen las columnas Talle y Color. */
  usaTallesColores: boolean;
  /** La empresa vende en dólares: se lee la columna Moneda. */
  permiteUSD: boolean;
};

/** Columnas de la plantilla, en orden, según el rubro y la configuración. */
export function columnasPlantilla(opciones: OpcionesParseo): { campo: CampoImportacion; titulo: string; obligatoria: boolean }[] {
  const campos: CampoImportacion[] = [
    "nombre",
    ...(opciones.usaTallesColores ? (["talle", "color"] as const) : []),
    "codigoBarras",
    "marca",
    "categoria",
    ...(opciones.permiteUSD ? (["moneda"] as const) : []),
    "precioCosto",
    "precioVenta",
    "precioMayorista",
    "alicuotaIva",
    "stock",
    "stockMinimo",
  ];
  return campos.map((campo) => ({
    campo,
    titulo: campo === "nombre" && opciones.usaTallesColores ? "Modelo" : ENCABEZADOS[campo].titulo,
    obligatoria: campo === "nombre" || campo === "precioVenta",
  }));
}


export type ColumnaFormato = ReturnType<typeof columnasPlantilla>[number];

/** Valor de ejemplo de cada columna, para las dos o tres filas que muestra la pantalla. */
const EJEMPLOS: Record<CampoImportacion, string[]> = {
  nombre: ["Remera básica", "Remera básica", "Cinturón de cuero"],
  talle: ["M", "L", ""],
  color: ["Negro", "Negro", ""],
  codigoBarras: ["7790000000001", "7790000000002", ""],
  marca: ["Nike", "", ""],
  categoria: ["Remeras", "", "Accesorios"],
  moneda: ["ARS", "ARS", "ARS"],
  precioCosto: ["8000", "8000", "6000"],
  precioVenta: ["15000", "15000", "12000"],
  precioMayorista: ["12000", "12000", ""],
  alicuotaIva: ["21", "", ""],
  stock: ["10", "8", "5"],
  stockMinimo: ["2", "", ""],
};

const EJEMPLOS_COMUN: Partial<Record<CampoImportacion, string[]>> = {
  nombre: ["Yerba mate 1 kg", "Fideos tallarín 500 g", "Aceite girasol 900 ml"],
  codigoBarras: ["7790000000011", "7790000000012", ""],
  marca: ["La Tranquera", "Matarazzo", ""],
  categoria: ["Almacén", "Almacén", "Almacén"],
  precioCosto: ["2500", "1200", "1800"],
  precioVenta: ["3500", "1800", "2600"],
  precioMayorista: ["3000", "", ""],
};

/** Filas de ejemplo para mostrar en pantalla, con las mismas columnas que la plantilla. */
export function filasEjemplo(opciones: OpcionesParseo): string[][] {
  const columnas = columnasPlantilla(opciones);
  const cantidad = 3;
  return Array.from({ length: cantidad }, (_, i) =>
    columnas.map((c) => (!opciones.usaTallesColores ? (EJEMPLOS_COMUN[c.campo] ?? EJEMPLOS[c.campo]) : EJEMPLOS[c.campo])[i] ?? "")
  );
}
