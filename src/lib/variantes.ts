/**
 * Variantes de ropa (RV-2): helpers PUROS (sin base de datos), usables desde
 * cliente y servidor. Lo que toca la base está en src/lib/modelos.ts.
 *
 * Cada combinación talle × color es un Producto común agrupado por un
 * ProductoModelo. El nombre visible ("Remera básica · M · Negro") se guarda en
 * Producto.nombre, así búsquedas, tickets y PDFs funcionan sin cambios.
 */

/** Talles sugeridos por defecto: letras y numeración de calzado/pantalón. */
export const TALLES_POR_DEFECTO = ["XS", "S", "M", "L", "XL", "XXL", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];

export const COLORES_POR_DEFECTO = ["Negro", "Blanco", "Gris", "Azul", "Rojo", "Verde", "Beige", "Rosa"];

/** Separador entre las partes del nombre visible. */
export const SEPARADOR_VARIANTE = " · ";

/** Recorta y colapsa espacios. Vacío → null (así queda NULL en la base). */
export function normalizarValor(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").replace(/\s+/g, " ").trim();
  return limpio === "" ? null : limpio;
}

/** "Remera básica · M · Negro". Omite el talle o el color si no tiene. */
export function nombreVariante(modelo: string, talle?: string | null, color?: string | null): string {
  return [modelo.trim(), normalizarValor(talle), normalizarValor(color)].filter(Boolean).join(SEPARADOR_VARIANTE);
}

/**
 * Convierte un texto ("XS, S, M" o una lista por renglón) o un arreglo en una
 * lista limpia: sin vacíos y sin repetidos (sin distinguir mayúsculas), en el
 * mismo orden en que se escribió.
 */
export function limpiarLista(entrada: string | string[] | null | undefined): string[] {
  const partes = Array.isArray(entrada) ? entrada : (entrada ?? "").split(/[\n,;]+/);
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const parte of partes) {
    const valor = normalizarValor(parte);
    if (!valor) continue;
    const clave = valor.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(valor);
  }
  return resultado;
}

/** Texto para mostrar una lista en un textarea (uno por renglón no, separados por coma). */
export function listaATexto(lista: string[] | null | undefined): string {
  return (lista ?? []).join(", ");
}
