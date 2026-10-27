import ExcelJS from "exceljs";
import { ENCABEZADOS, columnasPlantilla, filasEjemplo, type CampoImportacion, type OpcionesParseo } from "@/lib/importar-productos-formato";

export { columnasPlantilla };
export type { CampoImportacion, OpcionesParseo };

/**
 * Importación de productos desde Excel (solo plan Pro) — PARTE PURA: leer el
 * archivo y validar cada fila. No toca la base: lo que consulta o escribe en
 * la base está en src/lib/importar-productos.ts.
 *
 * Una fila = una combinación (ropa: modelo + talle + color) o un producto común.
 */

export const MAX_FILAS_IMPORTACION = 5000;
export const MAX_BYTES_IMPORTACION = 4 * 1024 * 1024; // el límite de las server actions es 5 MB
const MAX_TEXTO = 200;
const ALICUOTAS_IVA = [0, 2.5, 5, 10.5, 21, 27];

/** "Código de barras" → "codigodebarras": sin tildes, mayúsculas ni símbolos. */
export function normalizarEncabezado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export type FilaImportacion = {
  /** Número de fila en el Excel (para avisar dónde está el problema). */
  fila: number;
  nombre: string;
  talle: string | null;
  color: string | null;
  codigoBarras: string | null;
  marca: string | null;
  categoria: string | null;
  moneda: "ARS" | "USD";
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
  alicuotaIva: number;
  stock: number;
  stockMinimo: number;
};

export type ErrorFila = { fila: number; mensaje: string };

export class ErrorArchivo extends Error {}

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

type Celda = string | number | null;
type FilaCruda = { fila: number; celdas: Map<CampoImportacion, Celda> };

/** Valor simple de una celda (texto enriquecido, fórmulas, hipervínculos, fechas…). */
function valorCelda(v: ExcelJS.CellValue): Celda {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return valorCelda(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
  }
  return null;
}

function textoDe(c: Celda): string | null {
  if (c == null) return null;
  // Un código de barras numérico (7791234567890) no debe terminar en notación científica.
  const t = typeof c === "number" ? (Number.isInteger(c) ? c.toFixed(0) : String(c)) : c;
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio === "" ? null : limpio;
}

/**
 * Acepta 1500, "1500", "1.500", "1.500,50", "$ 1.500,50" y "1500.5".
 * Devuelve `undefined` si el texto no es un número, y `null` si está vacío.
 */
export function leerNumero(c: Celda): number | null | undefined {
  if (c == null) return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : undefined;
  let t = c.replace(/[\s$]|u\$s|usd|ars/gi, "");
  if (t === "") return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

type Grilla = { nombre: string; filas: Celda[][] };

/** Hojas del .xlsx como grillas de celdas (la fila 1 del Excel es filas[0]). */
async function grillasDeExcel(buffer: Buffer): Promise<Grilla[]> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ErrorArchivo("No se pudo leer el archivo. Verificá que sea un Excel .xlsx válido y que no tenga contraseña.");
  }
  return libro.worksheets.map((hoja) => {
    const filas: Celda[][] = [];
    for (let n = 1; n <= hoja.rowCount; n++) {
      const fila: Celda[] = [];
      hoja.getRow(n).eachCell((celda, col) => {
        fila[col - 1] = valorCelda(celda.value);
      });
      filas.push(fila);
    }
    return { nombre: hoja.name, filas };
  });
}

/** Texto del CSV: UTF-8 (con o sin BOM) o, si no lo es, Windows-1252 (el "CSV" de Excel en Argentina). */
function decodificarCsv(buffer: Buffer): string {
  if (buffer.includes(0)) throw new ErrorArchivo("El archivo no es un CSV ni un Excel .xlsx válido.");
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    texto = new TextDecoder("windows-1252").decode(buffer);
  }
  return texto.replace(/^\uFEFF/, "");
}

/** Parte un CSV en filas y celdas (comillas, comillas escapadas y saltos de línea dentro de una celda). */
export function parsearCsv(texto: string, separador: string): Celda[][] {
  const filas: Celda[][] = [];
  let fila: Celda[] = [];
  let celda = "";
  let entreComillas = false;

  const cerrarCelda = () => {
    fila.push(celda === "" ? null : celda);
    celda = "";
  };
  const cerrarFila = () => {
    cerrarCelda();
    filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"' && celda === "") entreComillas = true;
    else if (c === separador) cerrarCelda();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      cerrarFila();
    } else celda += c;
  }
  if (celda !== "" || fila.length > 0) cerrarFila();
  return filas;
}

/** El CSV puede venir con coma, punto y coma o tabulación: se prueba cada uno hasta encontrar los encabezados. */
const SEPARADORES_CSV = [";", ",", "\t"];

/**
 * Busca la fila de encabezados (entre las primeras 10) y devuelve las filas con datos,
 * o null si esta grilla no tiene los encabezados. `filas[n - 1]` es la fila n del archivo.
 */
function filasDeGrilla(grilla: Celda[][], porAlias: Map<string, CampoImportacion>): FilaCruda[] | null {
  for (let numero = 1; numero <= Math.min(10, grilla.length); numero++) {
    const mapa = new Map<number, CampoImportacion>();
    (grilla[numero - 1] ?? []).forEach((valor, col) => {
      const texto = textoDe(valor ?? null);
      const campo = texto ? porAlias.get(normalizarEncabezado(texto)) : undefined;
      if (campo && ![...mapa.values()].includes(campo)) mapa.set(col, campo);
    });
    const encontrados = new Set(mapa.values());
    if (!encontrados.has("nombre") || !encontrados.has("precioVenta")) continue;

    const filas: FilaCruda[] = [];
    for (let n = numero + 1; n <= grilla.length; n++) {
      const celdas = new Map<CampoImportacion, Celda>();
      for (const [col, campo] of mapa) celdas.set(campo, grilla[n - 1]?.[col] ?? null);
      if ([...celdas.values()].every((v) => textoDe(v) == null)) continue; // renglón vacío
      filas.push({ fila: n, celdas });
      if (filas.length > MAX_FILAS_IMPORTACION) {
        throw new ErrorArchivo(`El archivo tiene más de ${MAX_FILAS_IMPORTACION} filas. Dividilo en varios archivos.`);
      }
    }
    return filas;
  }
  return null;
}

/**
 * Lee el archivo (.xlsx o .csv) y devuelve las filas con datos. Un .xlsx es un zip
 * (empieza con "PK"); cualquier otra cosa se lee como CSV. En un Excel busca la hoja
 * "Productos" (o la primera que tenga los encabezados).
 */
async function leerFilas(buffer: Buffer, opciones: OpcionesParseo): Promise<FilaCruda[]> {
  if (buffer.length === 0) throw new ErrorArchivo("El archivo está vacío.");

  // Se leen las columnas de la plantilla, más "Moneda" siempre: si el archivo trae dólares y el
  // negocio no vende en dólares, hay que avisarlo en vez de cargar los precios como pesos.
  const campos = [...new Set<CampoImportacion>([...columnasPlantilla(opciones).map((c) => c.campo), "moneda"])];
  const porAlias = new Map<string, CampoImportacion>();
  for (const campo of campos) for (const alias of ENCABEZADOS[campo].alias) porAlias.set(alias, campo);

  const esExcel = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  let candidatas: Celda[][][];
  if (esExcel) {
    // Hoja "Productos" primero; si no está, las demás en orden.
    const hojas = (await grillasDeExcel(buffer)).sort((a, b) => Number(normalizarEncabezado(b.nombre) === "productos") - Number(normalizarEncabezado(a.nombre) === "productos"));
    candidatas = hojas.map((h) => h.filas);
  } else {
    const texto = decodificarCsv(buffer);
    candidatas = SEPARADORES_CSV.map((sep) => parsearCsv(texto, sep));
  }

  for (const grilla of candidatas) {
    const filas = filasDeGrilla(grilla, porAlias);
    if (filas) return filas;
  }

  const necesarias = columnasPlantilla(opciones)
    .filter((c) => c.obligatoria)
    .map((c) => c.titulo)
    .join(" y ");
  throw new ErrorArchivo(`No encontré los encabezados de las columnas. Usá la plantilla (columnas obligatorias: ${necesarias}).`);
}

// ---------------------------------------------------------------------------
// Validación fila por fila
// ---------------------------------------------------------------------------

function entero(valor: Celda, campo: string, porDefecto: number): number | string {
  const n = leerNumero(valor);
  if (n === undefined) return `${campo} no es un número.`;
  if (n === null) return porDefecto;
  if (n < 0) return `${campo} no puede ser negativo.`;
  if (!Number.isInteger(n)) return `${campo} tiene que ser un número entero.`;
  return n;
}

function monto(valor: Celda, campo: string, obligatorio: boolean): number | null | string {
  const n = leerNumero(valor);
  if (n === undefined) return `${campo} no es un número.`;
  if (n === null) return obligatorio ? `Falta ${campo.toLowerCase()}.` : null;
  if (n < 0) return `${campo} no puede ser negativo.`;
  return n;
}

const claveVariante = (f: { nombre: string; talle: string | null; color: string | null }) =>
  `${f.nombre.toLowerCase()}|${(f.talle ?? "").toLowerCase()}|${(f.color ?? "").toLowerCase()}`;

export type ResultadoParseo = {
  validas: FilaImportacion[];
  errores: ErrorFila[];
  /** Filas con datos que tenía el archivo (válidas + con error). */
  total: number;
};

/** Valida una fila cruda. Devuelve la fila lista o los problemas que tiene. */
function validarFila(cruda: FilaCruda, opciones: OpcionesParseo): FilaImportacion | string[] {
  const c = cruda.celdas;
  const problemas: string[] = [];

  const nombre = textoDe(c.get("nombre") ?? null);
  if (!nombre) problemas.push(opciones.usaTallesColores ? "Falta el modelo." : "Falta el nombre del producto.");
  else if (nombre.length > MAX_TEXTO) problemas.push(`El nombre supera los ${MAX_TEXTO} caracteres.`);

  const talle = opciones.usaTallesColores ? textoDe(c.get("talle") ?? null) : null;
  const color = opciones.usaTallesColores ? textoDe(c.get("color") ?? null) : null;
  if ((talle?.length ?? 0) > 50 || (color?.length ?? 0) > 50) problemas.push("El talle o el color es demasiado largo.");

  const codigoBarras = textoDe(c.get("codigoBarras") ?? null);
  if ((codigoBarras?.length ?? 0) > 100) problemas.push("El código de barras es demasiado largo.");

  const marca = textoDe(c.get("marca") ?? null);
  const categoria = textoDe(c.get("categoria") ?? null);
  if ((marca?.length ?? 0) > 100 || (categoria?.length ?? 0) > 100) problemas.push("La marca o la categoría es demasiado larga.");

  let moneda: "ARS" | "USD" = "ARS";
  const textoMoneda = textoDe(c.get("moneda") ?? null);
  if (textoMoneda) {
    const m = normalizarEncabezado(textoMoneda);
    if (["ars", "pesos", "peso", "arg"].includes(m)) moneda = "ARS";
    else if (["usd", "us", "dolares", "dolar", "uss"].includes(m)) moneda = "USD";
    else problemas.push(`La moneda "${textoMoneda}" no es válida (usá ARS o USD).`);
    if (moneda === "USD" && !opciones.permiteUSD) problemas.push("Tu negocio no vende en dólares: usá ARS.");
  }

  const costo = monto(c.get("precioCosto") ?? null, "Costo", false); // opcional: vacío = 0
  const venta = monto(c.get("precioVenta") ?? null, "Precio de venta", true);
  const mayorista = monto(c.get("precioMayorista") ?? null, "Precio mayorista", false);
  for (const v of [costo, venta, mayorista]) if (typeof v === "string") problemas.push(v);

  let alicuotaIva = 21;
  const iva = leerNumero(c.get("alicuotaIva") ?? null);
  if (iva === undefined || (iva !== null && !ALICUOTAS_IVA.includes(iva))) problemas.push(`El IVA tiene que ser ${ALICUOTAS_IVA.map((a) => String(a).replace(".", ",")).join(" / ")}.`);
  else if (iva !== null) alicuotaIva = iva;

  const stock = entero(c.get("stock") ?? null, "El stock", 0);
  const stockMinimo = entero(c.get("stockMinimo") ?? null, "El stock mínimo", 0);
  for (const v of [stock, stockMinimo]) if (typeof v === "string") problemas.push(v);

  if (problemas.length > 0) return problemas;
  return {
    fila: cruda.fila,
    nombre: nombre!,
    talle,
    color,
    codigoBarras,
    marca,
    categoria,
    moneda,
    precioCosto: (costo as number | null) ?? 0,
    precioVenta: venta as number,
    precioMayorista: mayorista as number | null,
    alicuotaIva,
    stock: stock as number,
    stockMinimo: stockMinimo as number,
  };
}

/** Lee el Excel y valida todas las filas, incluidos los repetidos dentro del mismo archivo. */
export async function leerYValidarArchivo(buffer: Buffer, opciones: OpcionesParseo): Promise<ResultadoParseo> {
  const crudas = await leerFilas(buffer, opciones);
  const validas: FilaImportacion[] = [];
  const errores: ErrorFila[] = [];

  const vistos = new Map<string, number>(); // clave de producto → fila
  const codigos = new Map<string, number>(); // código de barras → fila
  const modelos = new Map<string, { marca: string | null; categoria: string | null; fila: number }>();

  for (const cruda of crudas) {
    const r = validarFila(cruda, opciones);
    if (Array.isArray(r)) {
      errores.push({ fila: cruda.fila, mensaje: r.join(" ") });
      continue;
    }

    const clave = claveVariante(r);
    const repetida = vistos.get(clave);
    if (repetida) {
      errores.push({ fila: r.fila, mensaje: `Repetido: es el mismo producto que la fila ${repetida}.` });
      continue;
    }
    if (r.codigoBarras) {
      const otra = codigos.get(r.codigoBarras);
      if (otra) {
        errores.push({ fila: r.fila, mensaje: `El código de barras ${r.codigoBarras} ya está en la fila ${otra}.` });
        continue;
      }
    }

    // Las variantes de un mismo modelo comparten marca y categoría.
    if (r.talle || r.color) {
      const clave = r.nombre.toLowerCase();
      const previo = modelos.get(clave);
      if (previo) {
        if (r.marca && previo.marca && r.marca.toLowerCase() !== previo.marca.toLowerCase()) {
          errores.push({ fila: r.fila, mensaje: `El modelo "${r.nombre}" tiene la marca "${previo.marca}" en la fila ${previo.fila}, acá "${r.marca}".` });
          continue;
        }
        if (r.categoria && previo.categoria && r.categoria.toLowerCase() !== previo.categoria.toLowerCase()) {
          errores.push({ fila: r.fila, mensaje: `El modelo "${r.nombre}" tiene la categoría "${previo.categoria}" en la fila ${previo.fila}, acá "${r.categoria}".` });
          continue;
        }
        previo.marca ??= r.marca;
        previo.categoria ??= r.categoria;
      } else {
        modelos.set(clave, { marca: r.marca, categoria: r.categoria, fila: r.fila });
      }
    }

    vistos.set(clave, r.fila);
    if (r.codigoBarras) codigos.set(r.codigoBarras, r.fila);
    validas.push(r);
  }

  return { validas, errores, total: crudas.length };
}

// ---------------------------------------------------------------------------
// Plantilla descargable
// ---------------------------------------------------------------------------

/** Celda de CSV: entre comillas si lleva el separador, comillas o saltos de línea. */
const celdaCsv = (valor: string) => (/[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor);

/**
 * Plantilla en CSV: encabezados y filas de ejemplo (hay que borrarlas antes de cargar los productos
 * propios), separados por punto y coma (así la abre bien el Excel en español) y con BOM para que
 * se vean las tildes.
 */
export function generarPlantillaCsv(opciones: OpcionesParseo): Buffer {
  const renglones = [columnasPlantilla(opciones).map((c) => c.titulo), ...filasEjemplo(opciones)];
  return Buffer.from(`\uFEFF${renglones.map((r) => r.map(celdaCsv).join(";")).join("\r\n")}\r\n`, "utf-8");
}

/** Excel de ejemplo con los encabezados del rubro y una hoja de instrucciones. */
export async function generarPlantilla(opciones: OpcionesParseo): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const columnas = columnasPlantilla(opciones);

  const hoja = libro.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = columnas.map((c) => ({
    header: c.titulo,
    key: c.campo,
    width: c.campo === "nombre" ? 32 : c.campo === "codigoBarras" ? 20 : 16,
    // Texto: Excel no convierte el código de barras a notación científica ni borra ceros.
    style: ["codigoBarras", "talle"].includes(c.campo) ? { numFmt: "@" } : {},
  }));
  // Filas de ejemplo (en gris): hay que borrarlas antes de cargar los productos propios.
  for (const fila of filasEjemplo(opciones)) {
    const agregada = hoja.addRow(fila.map((v, i) => (v !== "" && ["precioCosto", "precioVenta", "precioMayorista", "alicuotaIva", "stock", "stockMinimo"].includes(columnas[i].campo) ? Number(v) : v)));
    agregada.font = { italic: true, color: { argb: "FF71717A" } };
  }
  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.alignment = { vertical: "middle" };
  encabezado.height = 22;
  encabezado.eachCell((celda, col) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: columnas[col - 1].obligatoria ? "FF15803D" : "FF52525B" } };
  });

  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.getColumn(1).width = 26;
  ayuda.getColumn(2).width = 90;
  const lineas: [string, string][] = [
    ["Filas de ejemplo", "Las filas en gris de la hoja \"Productos\" son solo un ejemplo: borralas antes de cargar tus productos."],
    ["Cómo importar", "Completá la hoja \"Productos\" (una fila por producto) y subila desde Productos → Importar (Excel o CSV)."],
    ["Columnas verdes", "Son obligatorias. Las grises son opcionales."],
    ...(opciones.usaTallesColores
      ? ([
          ["Modelo, Talle y Color", "Una fila por cada combinación. Repetí el nombre del modelo en cada fila: \"Remera básica\" talle M color Negro, \"Remera básica\" talle L color Negro, etc."],
          ["Producto sin talle/color", "Si dejás Talle y Color vacíos, se carga como un producto común (un cinturón, por ejemplo)."],
        ] as [string, string][])
      : []),
    ["Código de barras", "Opcional. Si lo cargás, no puede repetirse con otro producto."],
    ["Marca y Categoría", "Si no existen todavía, se crean solas."],
    ...(opciones.permiteUSD ? ([["Moneda", "ARS o USD. Si lo dejás vacío se usa ARS."]] as [string, string][]) : []),
    ["Precio de venta y Costo", "Números sin símbolos (1500 o 1500,50). El costo es opcional: vacío = 0."],
    ["IVA %", "Opcional: 0, 2,5, 5, 10,5, 21 o 27. Vacío = 21."],
    ["Stock", "Opcional, número entero. Se carga en la sucursal en la que estés trabajando. Vacío = 0."],
    ["Productos que ya existen", "Se omiten (no se modifican ni se duplican). Antes de importar vas a ver un resumen."],
    ["Límite", `Hasta ${MAX_FILAS_IMPORTACION} filas por archivo.`],
  ];
  lineas.forEach(([a, b]) => {
    const fila = ayuda.addRow([a, b]);
    fila.getCell(1).font = { bold: true };
    fila.alignment = { vertical: "top", wrapText: true };
  });

  return Buffer.from(await libro.xlsx.writeBuffer());
}
