import {
  CAMPOS_CLAVE,
  CAMPOS_EDITABLES,
  COLUMNAS_ACTUALIZACION,
  ENCABEZADOS_ACTUALIZACION,
  ENCABEZADOS_IGNORADOS,
  type CampoActualizacion,
} from "@/lib/actualizar-productos-formato";
import {
  ErrorArchivo,
  MAX_BYTES_IMPORTACION,
  MAX_FILAS_IMPORTACION,
  decodificarCsv,
  leerNumero,
  normalizarEncabezado,
  parsearCsv,
  textoDe,
  type Celda,
  type ErrorFila,
} from "@/lib/importar-productos-parseo";

/**
 * Actualizar productos en lote desde un CSV (issue #109) — PARTE PURA: leer el
 * archivo y validar cada fila. No toca la base: lo que consulta o escribe está en
 * src/lib/actualizar-productos.ts.
 *
 * Una fila = un producto que YA existe, identificado por código de barras o, sin código, por nombre.
 * Los campos que no vienen (columna ausente o celda vacía) quedan como `undefined` y significan
 * "no cambiar".
 */

export { ErrorArchivo, MAX_BYTES_IMPORTACION, MAX_FILAS_IMPORTACION };
export type { ErrorFila };

const MAX_TEXTO = 200;

export type FilaActualizacion = {
  /** Número de fila en el archivo (la de los encabezados es la 1). */
  fila: number;
  /** Clave para encontrar el producto (tiene prioridad sobre el nombre). */
  codigoBarras: string | null;
  /** Clave para encontrar el producto cuando la fila no tiene código de barras. */
  nombre: string | null;
  precioCosto?: number;
  moneda?: "ARS" | "USD";
  precioVenta?: number;
  precioMayorista?: number;
  stockMinimo?: number;
  categoria?: string;
  marca?: string;
};

export type ResultadoParseoActualizacion = {
  filas: FilaActualizacion[];
  errores: ErrorFila[];
  /** Filas con datos que tenía el archivo (válidas + con error). */
  total: number;
  /** Columnas reconocidas, en el orden de la plantilla. */
  columnas: CampoActualizacion[];
  /** Columnas que se reconocieron pero no se importan (el stock). */
  ignoradas: { titulo: string; motivo: string }[];
};

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

/** El CSV puede venir con coma, punto y coma o tabulación: se prueba cada uno hasta encontrar los encabezados. */
const SEPARADORES_CSV = [";", ",", "\t"];

const POR_ALIAS = new Map<string, CampoActualizacion>();
for (const campo of COLUMNAS_ACTUALIZACION) for (const alias of ENCABEZADOS_ACTUALIZACION[campo].alias) POR_ALIAS.set(alias, campo);

const IGNORADA_POR_ALIAS = new Map<string, { titulo: string; motivo: string }>();
for (const g of ENCABEZADOS_IGNORADOS) for (const alias of g.alias) IGNORADA_POR_ALIAS.set(alias, { titulo: g.titulo, motivo: g.motivo });

type FilaCruda = { fila: number; celdas: Map<CampoActualizacion, Celda> };
type Lectura = { filas: FilaCruda[]; columnas: CampoActualizacion[]; ignoradas: { titulo: string; motivo: string }[] };

/**
 * Busca la fila de encabezados (entre las primeras 10) y devuelve las filas con datos,
 * o null si esta grilla no tiene los encabezados. `grilla[n - 1]` es la fila n del archivo.
 */
function leerGrilla(grilla: Celda[][]): Lectura | null {
  for (let numero = 1; numero <= Math.min(10, grilla.length); numero++) {
    const mapa = new Map<number, CampoActualizacion>();
    const ignoradas = new Map<string, { titulo: string; motivo: string }>();
    (grilla[numero - 1] ?? []).forEach((valor, col) => {
      const texto = textoDe(valor ?? null);
      if (!texto) return;
      const clave = normalizarEncabezado(texto);
      const campo = POR_ALIAS.get(clave);
      if (campo && ![...mapa.values()].includes(campo)) mapa.set(col, campo);
      const ignorada = IGNORADA_POR_ALIAS.get(clave);
      if (ignorada) ignoradas.set(ignorada.titulo, ignorada);
    });

    const encontrados = new Set(mapa.values());
    if (!CAMPOS_CLAVE.some((c) => encontrados.has(c)) || !CAMPOS_EDITABLES.some((c) => encontrados.has(c))) continue;

    const filas: FilaCruda[] = [];
    for (let n = numero + 1; n <= grilla.length; n++) {
      const celdas = new Map<CampoActualizacion, Celda>();
      for (const [col, campo] of mapa) celdas.set(campo, grilla[n - 1]?.[col] ?? null);
      if ([...celdas.values()].every((v) => textoDe(v) == null)) continue; // renglón vacío
      filas.push({ fila: n, celdas });
      if (filas.length > MAX_FILAS_IMPORTACION) {
        throw new ErrorArchivo(`El archivo tiene más de ${MAX_FILAS_IMPORTACION} filas. Dividilo en varios archivos.`);
      }
    }
    return { filas, columnas: COLUMNAS_ACTUALIZACION.filter((c) => encontrados.has(c)), ignoradas: [...ignoradas.values()] };
  }
  return null;
}

function leerFilas(buffer: Buffer): Lectura {
  if (buffer.length === 0) throw new ErrorArchivo("El archivo está vacío.");
  // Un .xlsx es un zip ("PK"): acá solo se aceptan CSV.
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    throw new ErrorArchivo("Este archivo es un Excel (.xlsx). Guardalo como CSV (\"CSV delimitado por comas\" o \"CSV UTF-8\") y subilo de nuevo.");
  }
  const texto = decodificarCsv(buffer);
  for (const separador of SEPARADORES_CSV) {
    const lectura = leerGrilla(parsearCsv(texto, separador));
    if (lectura) return lectura;
  }
  throw new ErrorArchivo(
    "No encontré los encabezados de las columnas. Descargá la plantilla: tiene que haber una columna Código de barras o Nombre y al menos una para actualizar (Costo, Moneda, Precio minorista, Precio mayorista, Stock mínimo, Categoría o Marca)."
  );
}

// ---------------------------------------------------------------------------
// Validación fila por fila
// ---------------------------------------------------------------------------

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Excel muestra los códigos largos como 7,79E+12 y al guardar el CSV pierde los dígitos: no hay forma de recuperarlos. */
const NOTACION_CIENTIFICA = /^\d+([.,]\d+)?e[+-]\d+$/i;
/** Lo que Excel escribe en una celda cuando una fórmula falla (por ejemplo, un nombre que empieza con "-" o "="). */
const ERROR_DE_EXCEL = /^#(NAME\?|REF!|VALUE!|N\/A|DIV\/0!|NUM!|NULL!)$/i;

/** La plantilla escribe los códigos numéricos como ="7790000000001" para que Excel no los convierta: se saca el envoltorio. */
function limpiarCodigo(texto: string): string {
  return texto.replace(/^=\s*"(.*)"$/, "$1").trim();
}

function monto(valor: Celda, etiqueta: string, problemas: string[]): number | undefined {
  const n = leerNumero(valor);
  if (n === null) return undefined; // vacío: no cambia
  if (n === undefined) {
    problemas.push(`${etiqueta} "${textoDe(valor)}" no es un número.`);
    return undefined;
  }
  if (n < 0) {
    problemas.push(`${etiqueta} no puede ser negativo.`);
    return undefined;
  }
  return redondear2(n);
}

/** Valida una fila cruda. Devuelve la fila lista o los problemas que tiene. */
function validarFila(cruda: FilaCruda): FilaActualizacion | string[] {
  const c = cruda.celdas;
  const problemas: string[] = [];

  const nombreLeido = textoDe(c.get("nombre") ?? null);
  let nombre: string | null = null;
  if (nombreLeido) {
    if (nombreLeido.length > MAX_TEXTO) problemas.push(`El nombre supera los ${MAX_TEXTO} caracteres.`);
    else if (ERROR_DE_EXCEL.test(nombreLeido)) problemas.push(`El nombre "${nombreLeido}" es un error de Excel (¿empezaba con - o =?). Corregilo en el archivo.`);
    else nombre = nombreLeido;
  }

  let codigoBarras: string | null = null;
  const textoCodigo = textoDe(c.get("codigoBarras") ?? null);
  if (textoCodigo) {
    const limpio = limpiarCodigo(textoCodigo);
    if (limpio && NOTACION_CIENTIFICA.test(limpio)) {
      // Excel le sacó dígitos: no sirve como clave. Si la fila tiene nombre, se encuentra por nombre.
      if (!nombre && problemas.length === 0) {
        problemas.push(
          `El código de barras "${limpio}" está en notación científica: Excel le sacó dígitos. Formateá la columna como Texto antes de guardar, o dejá el nombre para encontrar el producto por nombre.`
        );
      }
    } else if (limpio.length > 100) {
      problemas.push("El código de barras es demasiado largo.");
    } else if (limpio) {
      codigoBarras = limpio;
    }
  }
  if (!codigoBarras && !nombre && problemas.length === 0) {
    problemas.push("La fila no tiene código de barras ni nombre: no se sabe qué producto es.");
  }

  const fila: FilaActualizacion = { fila: cruda.fila, codigoBarras, nombre };

  const textoMoneda = textoDe(c.get("moneda") ?? null);
  if (textoMoneda) {
    const m = normalizarEncabezado(textoMoneda);
    if (["ars", "pesos", "peso", "arg"].includes(m)) fila.moneda = "ARS";
    else if (["usd", "us", "dolares", "dolar", "uss"].includes(m)) fila.moneda = "USD";
    else problemas.push(`La moneda "${textoMoneda}" no es válida (usá ARS o USD).`);
  }

  const costo = monto(c.get("precioCosto") ?? null, "El costo", problemas);
  const venta = monto(c.get("precioVenta") ?? null, "El precio minorista", problemas);
  const mayorista = monto(c.get("precioMayorista") ?? null, "El precio mayorista", problemas);
  if (costo !== undefined) fila.precioCosto = costo;
  if (venta !== undefined) fila.precioVenta = venta;
  if (mayorista !== undefined) fila.precioMayorista = mayorista;

  const minimo = leerNumero(c.get("stockMinimo") ?? null);
  if (minimo === undefined) problemas.push(`El stock mínimo "${textoDe(c.get("stockMinimo") ?? null)}" no es un número.`);
  else if (minimo !== null) {
    if (minimo < 0) problemas.push("El stock mínimo no puede ser negativo.");
    else if (!Number.isInteger(minimo)) problemas.push("El stock mínimo tiene que ser un número entero.");
    else fila.stockMinimo = minimo;
  }

  for (const [campo, etiqueta] of [
    ["categoria", "La categoría"],
    ["marca", "La marca"],
  ] as const) {
    const texto = textoDe(c.get(campo) ?? null);
    if (!texto) continue;
    if (texto.length > 100) problemas.push(`${etiqueta} es demasiado larga.`);
    else fila[campo] = texto;
  }

  return problemas.length > 0 ? problemas : fila;
}

/** Lee el CSV y valida cada fila. Los repetidos y los productos que no existen se detectan después, contra la base. */
export function leerYValidarActualizacion(buffer: Buffer): ResultadoParseoActualizacion {
  const { filas: crudas, columnas, ignoradas } = leerFilas(buffer);
  const filas: FilaActualizacion[] = [];
  const errores: ErrorFila[] = [];

  for (const cruda of crudas) {
    const r = validarFila(cruda);
    if (Array.isArray(r)) errores.push({ fila: cruda.fila, mensaje: r.join(" ") });
    else filas.push(r);
  }
  return { filas, errores, total: crudas.length, columnas, ignoradas };
}

// ---------------------------------------------------------------------------
// Plantilla descargable: los productos actuales
// ---------------------------------------------------------------------------

export type ProductoPlantilla = {
  codigoBarras: string | null;
  nombre: string;
  precioCosto: number;
  moneda: "ARS" | "USD";
  precioVenta: number;
  precioMayorista: number | null;
  stockMinimo: number;
  categoria: string | null;
  marca: string | null;
};

/** Celda de CSV: entre comillas si lleva el separador, comillas o saltos de línea. */
const celdaCsv = (valor: string) => (/[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor);

/** Número con coma decimal y sin separador de miles: así lo lee el Excel en español como número. */
const numeroCsv = (n: number) => String(redondear2(n)).replace(".", ",");

/** Un código solo de dígitos se escribe ="7790…" para que Excel no lo pase a notación científica ni le borre ceros. */
const codigoCsv = (codigo: string | null) => (!codigo ? "" : /^\d+$/.test(codigo) ? `="${codigo}"` : codigo);

/**
 * CSV con los productos actuales y las columnas editables, separado por punto y coma
 * (así lo abre bien el Excel en español) y con BOM para que se vean las tildes.
 */
export function generarPlantillaActualizacion(productos: ProductoPlantilla[]): Buffer {
  const encabezado = COLUMNAS_ACTUALIZACION.map((c) => ENCABEZADOS_ACTUALIZACION[c].titulo);
  const renglones = productos.map((p) => [
    codigoCsv(p.codigoBarras),
    p.nombre,
    numeroCsv(p.precioCosto),
    p.moneda,
    numeroCsv(p.precioVenta),
    p.precioMayorista == null ? "" : numeroCsv(p.precioMayorista),
    String(p.stockMinimo),
    p.categoria ?? "",
    p.marca ?? "",
  ]);
  return Buffer.from(`﻿${[encabezado, ...renglones].map((r) => r.map(celdaCsv).join(";")).join("\r\n")}\r\n`, "utf-8");
}
