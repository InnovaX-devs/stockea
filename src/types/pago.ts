export type ModoCobro = "UNICA" | "MIXTO" | "A_CUENTA";

export type PagoLinea = {
  id: string;
  cuentaId: number | null;
  /** Siempre en ARS: es lo que se descuenta del total / de la deuda. */
  monto: number;
  /** true si la cuenta elegida es en dólares (EFECTIVO_USD / BANCO_USD). */
  esUSD?: boolean;
  /** Dólares que entran a la cuenta cuando esUSD es true (lo que escribe el usuario). */
  montoUSD?: number | null;
};

export type CuentaOption = {
  id: number;
  nombre: string;
  tipo: string;
};
