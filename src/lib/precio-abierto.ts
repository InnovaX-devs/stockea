/**
 * Productos de precio abierto (verdura, fiambre…): el monto se carga al vender.
 *
 * Son productos comunes con dos marcas (Producto.precioAbierto y
 * Producto.controlaStock) y un "% de costo estimado" opcional
 * (Producto.costoEstimadoPct). Esta función lee y valida esos tres campos del
 * cuerpo que manda el formulario de producto, para el alta y la edición.
 *
 * Devuelve SOLO los campos que vinieron (los demás quedan sin tocar en la
 * edición, y toman su valor por defecto en el alta).
 */

export type DatosPrecioAbierto = {
  precioAbierto?: boolean;
  controlaStock?: boolean;
  costoEstimadoPct?: number | null;
};

export function leerPrecioAbierto(
  body: Record<string, unknown>
): { ok: true; datos: DatosPrecioAbierto } | { ok: false; error: string } {
  const datos: DatosPrecioAbierto = {};

  if (body.precioAbierto !== undefined) datos.precioAbierto = body.precioAbierto === true;
  if (body.controlaStock !== undefined) datos.controlaStock = body.controlaStock !== false;

  if (body.costoEstimadoPct !== undefined) {
    const crudo = body.costoEstimadoPct;
    if (crudo === null || crudo === "") {
      datos.costoEstimadoPct = null;
    } else {
      const pct = Number(crudo);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return { ok: false, error: "El % de costo estimado tiene que estar entre 0 y 100." };
      }
      datos.costoEstimadoPct = pct === 0 ? null : pct;
    }
  }

  // El % de costo estimado solo tiene sentido en productos de precio abierto.
  if (datos.precioAbierto === false) datos.costoEstimadoPct = null;

  return { ok: true, datos };
}
