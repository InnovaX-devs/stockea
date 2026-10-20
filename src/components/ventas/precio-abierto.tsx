"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ProductoBusquedaDTO } from "@/types/producto";
import { formatCurrency } from "@/lib/currency";
import { listarPrecioAbierto } from "@/lib/offline/buscar";

/**
 * Productos de precio abierto (verdura, fiambre…): en el negocio se anota solo
 * el total ("$2.100 de verdura"). Son productos comunes marcados con
 * `precioAbierto`; al venderlos se pide el monto y se agrega una línea con
 * cantidad 1 y ese precio. Ver src/lib/precio-abierto.ts.
 */

/** Botones rápidos, arriba del buscador. No muestra nada si el negocio no tiene ninguno. */
export function BotonesPrecioAbierto({ onElegir }: { onElegir: (producto: ProductoBusquedaDTO) => void }) {
  const [productos, setProductos] = useState<ProductoBusquedaDTO[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    listarPrecioAbierto(controller.signal)
      .then(setProductos)
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });
    return () => controller.abort();
  }, []);

  if (productos.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Productos de precio abierto">
      <span className="text-xs font-medium text-text-dim">Precio abierto:</span>
      {productos.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onElegir(p)}
          className="cursor-pointer rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {p.nombre}
        </button>
      ))}
    </div>
  );
}

/** Pide el monto de un producto de precio abierto. Enter confirma, Escape cancela. */
export function ModalMontoAbierto({
  producto,
  onConfirmar,
  onCancelar,
}: {
  producto: ProductoBusquedaDTO;
  onConfirmar: (montoArs: number) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCancelar]);

  const monto = Number(texto.replace(",", "."));
  const valido = texto.trim() !== "" && Number.isFinite(monto) && monto > 0 && monto < 1e12;

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) {
      setError("Ingresá un monto mayor a cero.");
      return;
    }
    onConfirmar(Math.round(monto * 100) / 100);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form onSubmit={confirmar} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text">{producto.nombre}</h3>
          <button type="button" onClick={onCancelar} className="text-text-dim hover:text-text" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="monto-abierto" className="block text-xs font-medium text-text-dim">
            Monto a cobrar (ARS)
          </label>
          <input
            id="monto-abierto"
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError("");
            }}
            placeholder="Ej: 2100"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-lg font-semibold text-text focus:border-primary focus:outline-none"
          />
          {error ? (
            <p className="mt-1 text-xs text-danger">{error}</p>
          ) : (
            valido && <p className="mt-1 text-xs text-text-dim">Se agrega {formatCurrency(monto, "ARS")} de {producto.nombre.toLowerCase()}.</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            Cancelar
          </button>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Agregar
          </button>
        </div>
      </form>
    </div>
  );
}
