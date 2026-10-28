"use client";

import { Tag } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { Descuento } from "./modal-descuento";
import { Tecla } from "./atajos-teclado";

interface Props {
  subtotal: number;
  descuento: Descuento;
  onAbrirDescuento: () => void;
}

export function ResumenVenta({ subtotal, descuento, onAbrirDescuento }: Props) {
  const montoDescuento =
    descuento == null
      ? 0
      : descuento.tipo === "PORCENTAJE"
        ? subtotal * (descuento.valor / 100)
        : Math.min(descuento.valor, subtotal);

  const total = Math.max(0, subtotal - montoDescuento);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAbrirDescuento}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              descuento
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-text-dim hover:bg-surface-hover"
            }`}
          >
            <Tag size={14} />
            {descuento
              ? descuento.tipo === "PORCENTAJE"
                ? `Descuento ${descuento.valor}%`
                : `Descuento ${formatCurrency(descuento.valor, "ARS")}`
              : "Descuento"}
            <Tecla>F6</Tecla>
          </button>
        </div>

        <div className="text-right">
          {montoDescuento > 0 && (
            <>
              <p className="text-xs text-text-dim">
                Subtotal: {formatCurrency(subtotal, "ARS")}
              </p>
              <p className="text-xs text-success">
                Descuento: -{formatCurrency(montoDescuento, "ARS")}
              </p>
            </>
          )}
          <p className="text-xs font-medium uppercase tracking-wider text-text-dim">Total</p>
          <p className="text-2xl font-bold text-text">{formatCurrency(total, "ARS")}</p>
        </div>
      </div>
    </div>
  );
}