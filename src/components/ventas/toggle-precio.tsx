"use client";

import { useVenta } from "./venta-context";

export function TogglePrecio() {
  const { tipoPrecio, setTipoPrecio } = useVenta();

  return (
    <div className="flex rounded-lg border border-border bg-surface p-0.5">
      <button
        type="button"
        onClick={() => setTipoPrecio("MINORISTA")}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          tipoPrecio === "MINORISTA" ? "bg-primary text-white" : "text-text-dim cursor-pointer hover:text-text"
        }`}
      >
        Min
      </button>
      <button
        type="button"
        onClick={() => setTipoPrecio("MAYORISTA")}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          tipoPrecio === "MAYORISTA" ? "bg-primary text-white" : "text-text-dim cursor-pointer hover:text-text"
        }`}
      >
        May
      </button>
    </div>
  );
}