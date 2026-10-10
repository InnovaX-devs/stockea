export type TipoCuenta = "EFECTIVO_ARS" | "EFECTIVO_USD" | "BANCO_ARS" | "BANCO_USD";

export type CuentaDTO = {
  id: number;
  nombre: string;
  tipo: TipoCuenta;
  titular: string | null;
  banco: string | null;
  alias: string | null;
  cbu: string | null;
  color: string | null;
  favorita: boolean;
  saldoInicial: number;
  saldoActual: number;
  limiteMensualIngresos: number | null;
  activa: boolean;
  createdAt: string;
  /** Sucursal de la cuenta; null = compartida por todas. */
  sucursalId?: number | null;
  sucursalNombre?: string | null;
};

export const ES_TIPO_BANCO = (tipo: TipoCuenta) => tipo === "BANCO_ARS" || tipo === "BANCO_USD";