/**
 * Ajuste de precios en la actualización masiva (Productos → Actualizar Precios).
 * Funciones puras: las usan la ruta /api/productos/actualizar-precios y la pantalla
 * (para mostrar el precio nuevo antes de aplicar), así los dos calculan igual.
 */

export type TipoAjuste = "PORCENTAJE" | "VALOR_FIJO";

/**
 * Precio después del ajuste: porcentaje (10 = +10 %, -5 = -5 %) o monto fijo (+500, -200).
 * Redondea a 2 decimales y nunca baja de 0. Sin precio actual no hay nada que ajustar.
 */
export function calcularNuevoPrecio(precioActual: number | null | undefined, tipo: TipoAjuste, valor: number): number | null {
  if (precioActual == null) return null;
  const nuevo = tipo === "PORCENTAJE" ? precioActual * (1 + valor / 100) : precioActual + valor;
  return Math.max(0, Math.round(nuevo * 100) / 100);
}

/**
 * Lee lo que se escribió en el campo de ajuste ("10", "-5", "7,5").
 * Devuelve `null` si está vacío (sin ajuste) y `undefined` si no es un número válido o es 0.
 */
export function leerValorAjuste(texto: string): number | null | undefined {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}
