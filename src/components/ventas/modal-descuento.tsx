"use client";

import { useState } from "react";
import { X } from "lucide-react";

export type Descuento = { tipo: "MONTO" | "PORCENTAJE"; valor: number } | null;

interface Props {
  descuentoActual: Descuento;
  onAplicar: (descuento: Descuento) => void;
  onClose: () => void;
}

export function ModalDescuento({ descuentoActual, onAplicar, onClose }: Props) {
  const [tipo, setTipo] = useState<"MONTO" | "PORCENTAJE">(descuentoActual?.tipo ?? "PORCENTAJE");
  const [valor, setValor] = useState(String(descuentoActual?.valor ?? ""));

  function aplicar() {
    const num = Number(valor);
    if (!valor.trim() || Number.isNaN(num) || num <= 0) {
      onAplicar(null);
      onClose();
      return;
    }
    onAplicar({ tipo, valor: num });
    onClose();
  }

  function quitar() {
    onAplicar(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text">Descuento</h3>
          <button onClick={onClose} className="text-text-dim hover:text-text" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex rounded-lg border border-border bg-bg p-0.5">
          <button
            type="button"
            onClick={() => setTipo("PORCENTAJE")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              tipo === "PORCENTAJE" ? "bg-primary text-white" : "text-text-dim hover:text-text"
            }`}
          >
            Porcentaje (%)
          </button>
          <button
            type="button"
            onClick={() => setTipo("MONTO")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              tipo === "MONTO" ? "bg-primary text-white" : "text-text-dim hover:text-text"
            }`}
          >
            Monto fijo ($)
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-text-dim">
            {tipo === "PORCENTAJE" ? "Porcentaje a descontar" : "Monto a descontar (ARS)"}
          </label>
          <input
            autoFocus
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") aplicar();
              else if (e.key === "Escape") onClose();
            }}
            placeholder={tipo === "PORCENTAJE" ? "Ej: 10" : "Ej: 5000"}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {descuentoActual && (
            <button
              type="button"
              onClick={quitar}
              className="rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Quitar descuento
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aplicar}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}