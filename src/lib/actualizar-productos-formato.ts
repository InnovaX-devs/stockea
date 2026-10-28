/**
 * Formato del CSV para ACTUALIZAR productos existentes en lote (issue #109).
 * PURO y sin librerías de servidor: lo usan el lector (actualizar-productos-parseo.ts),
 * la generación de la plantilla y la pantalla.
 *
 * Reglas del archivo:
 *  - Cada fila identifica un producto por código de barras o, si la celda está vacía (productos
 *    sin código), por nombre exacto. Esas dos columnas son la CLAVE: no se pueden cambiar desde el CSV.
 *  - Una columna que no está en el archivo no se toca. Una celda vacía tampoco: nunca se
 *    borra un dato desde el CSV.
 *  - El stock NO se modifica desde acá: tiene que moverse con compras o ajustes para quedar registrado.
 */

export type CampoActualizacion =
  | "codigoBarras"
  | "nombre"
  | "precioCosto"
  | "moneda"
  | "precioVenta"
  | "precioMayorista"
  | "stockMinimo"
  | "categoria"
  | "marca";

/** Cómo se llama cada columna en la plantilla y qué otros nombres se aceptan (normalizados: sin tildes ni símbolos). */
export const ENCABEZADOS_ACTUALIZACION: Record<CampoActualizacion, { titulo: string; alias: string[] }> = {
  codigoBarras: { titulo: "Código de barras", alias: ["codigodebarras", "codigobarras", "codbarras", "codigo", "ean", "sku", "barcode"] },
  nombre: { titulo: "Nombre", alias: ["nombre", "producto", "articulo", "descripcion", "nombredelproducto"] },
  precioCosto: { titulo: "Costo", alias: ["costo", "preciocosto", "preciodecosto"] },
  moneda: { titulo: "Moneda", alias: ["moneda"] },
  precioVenta: { titulo: "Precio minorista", alias: ["preciominorista", "minorista", "precioventa", "preciodeventa", "precio", "pvp", "venta"] },
  precioMayorista: { titulo: "Precio mayorista", alias: ["preciomayorista", "preciodemayorista", "mayorista"] },
  stockMinimo: { titulo: "Stock mínimo", alias: ["stockminimo", "minimo", "stockmin"] },
  categoria: { titulo: "Categoría", alias: ["categoria", "familia"] },
  marca: { titulo: "Marca", alias: ["marca"] },
};

/** Columnas de la plantilla, en orden. */
export const COLUMNAS_ACTUALIZACION: CampoActualizacion[] = [
  "codigoBarras",
  "nombre",
  "precioCosto",
  "moneda",
  "precioVenta",
  "precioMayorista",
  "stockMinimo",
  "categoria",
  "marca",
];

/** Columnas que identifican al producto. Hace falta al menos una. */
export const CAMPOS_CLAVE: CampoActualizacion[] = ["codigoBarras", "nombre"];

/** Columnas con datos que se pueden cambiar. Hace falta al menos una. */
export const CAMPOS_EDITABLES: CampoActualizacion[] = COLUMNAS_ACTUALIZACION.filter((c) => !CAMPOS_CLAVE.includes(c));

/**
 * Columnas que se reconocen pero NO se importan (hoy: el stock). Si vienen en el archivo se
 * avisa en la vista previa en vez de ignorarlas en silencio.
 */
export const ENCABEZADOS_IGNORADOS: { titulo: string; alias: string[]; motivo: string }[] = [
  {
    titulo: "Stock",
    alias: ["stock", "stockactual", "stockinicial", "cantidad", "existencia"],
    motivo: "El stock no se modifica desde el CSV: se mueve con compras o ajustes para que quede registrado.",
  },
];
