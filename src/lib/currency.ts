// lib/currency.ts
export type Moneda = "ARS" | "USD";

export function toArs(value: number, moneda: Moneda, cotizacionUSD: number): number {
  return moneda === "USD" ? value * cotizacionUSD : value;
}

export function toUsd(value: number, moneda: Moneda, cotizacionUSD: number): number {
  return moneda === "USD" ? value : value / cotizacionUSD;
}

export function redondearARS(value: number): number {
  return Math.round(value);
}

export function formatCurrency(value: number, currency: Moneda) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ARS" ? 0 : 2,
  }).format(value);
}
export const TIPOS_CUENTA_USD = ["EFECTIVO_USD", "BANCO_USD"];

export function esCuentaUSD(tipo: string | null | undefined): boolean {
  return tipo != null && TIPOS_CUENTA_USD.includes(tipo);
}

export function redondearUSD(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Dólares que entran realmente a una cuenta USD por un pago.
 * `monto` es el equivalente en ARS; si vino `montoUSD` (lo que escribió el
 * usuario) se usa ese, si no se convierte con la cotización.
 */
export function montoEnCuentaUSD(pago: { monto: number; montoUSD?: number | null }, cotizacion: number): number {
  if (pago.montoUSD != null && pago.montoUSD > 0) return redondearUSD(pago.montoUSD);
  return cotizacion > 0 ? pago.monto / cotizacion : pago.monto;
}

/**
 * Cuánto valió un pago en ARS. Los pagos nuevos lo traen guardado (montoARS);
 * para los viejos se estima con la cotización de la venta.
 */
export function montoARSDePago(
  pago: { monto: number; montoARS?: number | null },
  tipoCuenta: string,
  cotizacionUsada: number
): number {
  if (pago.montoARS != null) return pago.montoARS;
  return esCuentaUSD(tipoCuenta) ? pago.monto * cotizacionUsada : pago.monto;
}
