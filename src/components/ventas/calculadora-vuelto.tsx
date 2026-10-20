"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/currency";

/**
 * Cobro estilo kiosco (issue #68): con cuánto paga el cliente y cuánto vuelto
 * hay que darle. Es solo una ayuda en pantalla: a la caja entra el monto de la
 * venta (lo que ya dice el pago), no lo entregado, así el cierre sigue
 * cuadrando. No guarda nada y funciona igual sin conexión.
 */

/** Billetes que se usan para redondear hacia arriba ("paga con 10.000"). */
const REDONDEOS = [1_000, 10_000, 20_000];

/** Montos rápidos: el justo y los siguientes "redondos" por encima del total. */
export function montosRapidos(monto: number): number[] {
  const justo = Math.round(monto);
  if (justo <= 0) return [];
  const siguientes = REDONDEOS.map((b) => Math.ceil(justo / b) * b).filter((m) => m > justo);
  return [justo, ...new Set(siguientes)].slice(0, 4);
}

export function CalculadoraVuelto({
  montoEfectivo,
  onEnter,
  pagaCon: pagaConExterno,
  onCambiarPagaCon,
}: {
  /** Parte del cobro que se paga en efectivo (ARS). */
  montoEfectivo: number;
  /** Enter en "Paga con": confirma la venta (si la pantalla lo permite). */
  onEnter?: () => void;
  /** Opcional: la pantalla guarda el "paga con" (para el ticket, #86). Si no, lo guarda este componente. */
  pagaCon?: number | null;
  onCambiarPagaCon?: (monto: number | null) => void;
}) {
  const [pagaConInterno, setPagaConInterno] = useState<number | null>(null);
  const controlado = onCambiarPagaCon !== undefined;
  const pagaCon = controlado ? (pagaConExterno ?? null) : pagaConInterno;
  const setPagaCon = (monto: number | null) => (controlado ? onCambiarPagaCon(monto) : setPagaConInterno(monto));
  const efectivo = Math.round(montoEfectivo);
  const vuelto = pagaCon != null ? pagaCon - efectivo : null;
  const rapidos = montosRapidos(efectivo);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <Banknote size={14} className="shrink-0 text-text-dim" />
        <label htmlFor="paga-con" className="shrink-0 text-xs font-medium text-text-dim">
          Paga con
        </label>
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-dim">$</span>
          <input
            id="paga-con"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={pagaCon ?? ""}
            placeholder={String(efectivo)}
            onChange={(e) => setPagaCon(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onEnter && (pagaCon == null || pagaCon >= efectivo)) {
                e.preventDefault();
                onEnter();
              }
            }}
            className="w-full rounded-lg border border-border bg-white py-1.5 pl-5 pr-2 text-right text-sm text-text focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {rapidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rapidos.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setPagaCon(m)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                pagaCon === m ? "border-primary bg-primary text-white" : "border-border bg-white text-text hover:bg-surface-hover"
              )}
            >
              {i === 0 ? "Justo" : formatCurrency(m, "ARS")}
            </button>
          ))}
        </div>
      )}

      {vuelto != null && (
        <div
          role="status"
          className={cn(
            "flex items-baseline justify-between rounded-md px-2 py-1.5",
            vuelto < 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
          )}
        >
          <span className="text-xs font-medium">{vuelto < 0 ? "Falta" : "Vuelto"}</span>
          <span className="font-display text-2xl font-bold tabular-nums">{formatCurrency(Math.abs(vuelto), "ARS")}</span>
        </div>
      )}
    </div>
  );
}
