/**
 * Pago de compras (CP-1). Funciones puras: las usan la API y la interfaz.
 *
 * Criterio para compras en dólares: la deuda se sigue en ARS con la
 * cotización de la compra (Compra.cotizacionUsada). Todo lo pagado se
 * guarda en ARS en Compra.montoPagado; si se paga desde una cuenta en
 * dólares, a la cuenta se le descuenta monto ÷ cotización.
 */

export type EstadoPago = "PAGADA" | "PARCIAL" | "SIN_PAGAR";

/** Menos de medio centavo de diferencia cuenta como pagado. */
const TOLERANCIA = 0.005;

export const redondearPesos = (n: number) => Math.round(n * 100) / 100;

type CompraConPago = { totalARS: number | null; montoPagado: number };

/** Lo que falta pagar, en ARS (nunca negativo). */
export function saldoPendiente(c: CompraConPago) {
  return Math.max(0, redondearPesos((c.totalARS ?? 0) - c.montoPagado));
}

export function estadoPago(c: CompraConPago): EstadoPago {
  if (saldoPendiente(c) <= TOLERANCIA) return "PAGADA";
  return c.montoPagado > TOLERANCIA ? "PARCIAL" : "SIN_PAGAR";
}

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  PAGADA: "Pagada",
  PARCIAL: "Pago parcial",
  SIN_PAGAR: "Sin pagar",
};

/** ¿Este monto alcanza para pagar el total? (con la tolerancia de redondeo) */
export function cubreElTotal(monto: number, totalARS: number) {
  return monto >= totalARS - TOLERANCIA;
}
