"use client";

import type { CuentaDTO } from "@/types/cuenta";
import { formatCurrency } from "@/lib/currency";

interface Props {
  cuentas: CuentaDTO[];
  cotizacionUSD: number;
  usaCotizacionUSD?: boolean;
}

export function TotalesCuentas({ cuentas, cotizacionUSD, usaCotizacionUSD = false }: Props) {
  const activas = cuentas.filter((c) => c.activa);

  const totalARS = activas
    .filter((c) => c.tipo === "EFECTIVO_ARS" || c.tipo === "BANCO_ARS")
    .reduce((acc, c) => acc + c.saldoActual, 0);

  const totalUSD = activas
    .filter((c) => c.tipo === "EFECTIVO_USD" || c.tipo === "BANCO_USD")
    .reduce((acc, c) => acc + c.saldoActual, 0);

  const arsEnUsd = cotizacionUSD > 0 ? totalARS / cotizacionUSD : 0;
  const usdEnArs = totalUSD * cotizacionUSD;

  if (!usaCotizacionUSD) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl bg-primary p-4 text-white">
          <span className="text-xs font-medium uppercase tracking-wider text-white">Total</span>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalARS, "ARS")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-primary p-4 text-white">
        <span className="text-xs font-medium uppercase tracking-wider text-white">Total ARS</span>
        <p className="mt-1 text-2xl font-bold">{formatCurrency(totalARS, "ARS")}</p>
        <p className="mt-0.5 text-xs text-white">
          = {formatCurrency(arsEnUsd, "USD")}
        </p>
      </div>
      <div className="rounded-xl bg-success p-4 text-white">
        <span className="text-xs font-medium uppercase tracking-wider text-white">Total USD</span>
        <p className="mt-1 text-2xl font-bold">{formatCurrency(totalUSD, "USD")}</p>
        <p className="mt-0.5 text-xs text-white">
          = {formatCurrency(usdEnArs, "ARS")}
        </p>
      </div>
    </div>
  );
}