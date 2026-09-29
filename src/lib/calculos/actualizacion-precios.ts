/**
 * Cálculos para actualizar costos y precios al confirmar una compra.
 * Funciones puras: las usan la ruta /api/compras/[id]/confirmar (preview y
 * confirmación) y se pueden probar sin base de datos.
 */

export type ModoCosto = "PONDERADO" | "COMPRA";

type Moneda = "USD" | "ARS";

/** Pesos: sin centavos. Dólares: 2 decimales. */
export function redondearPrecio(valor: number, moneda: Moneda): number {
  return moneda === "ARS" ? Math.round(valor) : Math.round(valor * 100) / 100;
}

/**
 * Costo promedio ponderado. A diferencia del cálculo viejo (que truncaba a
 * entero), respeta los centavos en productos en dólares.
 */
export function costoPonderado(params: {
  stockActual: number;
  costoActual: number;
  cantidadNueva: number;
  costoNuevo: number;
  moneda: Moneda;
}): number {
  const { stockActual, costoActual, cantidadNueva, costoNuevo, moneda } = params;
  // Con stock negativo o en cero, el costo viejo no pesa: vale el nuevo.
  const stockPrevio = Math.max(0, stockActual);
  const total = stockPrevio + cantidadNueva;
  if (total <= 0) return redondearPrecio(costoNuevo, moneda);
  return redondearPrecio((stockPrevio * costoActual + cantidadNueva * costoNuevo) / total, moneda);
}

/**
 * Precio sugerido que mantiene el mismo margen: si el costo sube un 20%, el
 * precio sube un 20%. Sin costo o precio anterior no hay margen que mantener.
 */
export function precioConMismoMargen(
  precioActual: number | null | undefined,
  costoActual: number,
  costoNuevo: number,
  moneda: Moneda
): number | null {
  if (precioActual == null || precioActual <= 0 || costoActual <= 0) return null;
  return redondearPrecio(precioActual * (costoNuevo / costoActual), moneda);
}

/**
 * Agrupa los ítems de la compra por producto. Los ítems vienen en USD (o en
 * ARS directo si el negocio no usa dólares, con cotización 1); se pasan a la
 * moneda del producto y, si el mismo producto viene en varias líneas, se
 * promedian por cantidad.
 */
export function agruparPorProducto(
  items: { productoId: number; cantidad: number; costoUnitarioUSD: number }[],
  monedaDe: (productoId: number) => Moneda,
  cotizacion: number
) {
  const grupos = new Map<number, { cantidad: number; costoTotal: number }>();
  for (const item of items) {
    const moneda = monedaDe(item.productoId);
    const costoEnMoneda = moneda === "ARS" ? item.costoUnitarioUSD * cotizacion : item.costoUnitarioUSD;
    const g = grupos.get(item.productoId) ?? { cantidad: 0, costoTotal: 0 };
    g.cantidad += item.cantidad;
    g.costoTotal += item.cantidad * costoEnMoneda;
    grupos.set(item.productoId, g);
  }
  return [...grupos.entries()].map(([productoId, g]) => ({
    productoId,
    cantidad: g.cantidad,
    costoCompra: redondearPrecio(g.cantidad > 0 ? g.costoTotal / g.cantidad : 0, monedaDe(productoId)),
  }));
}
