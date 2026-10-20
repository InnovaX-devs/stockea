"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { buscarVariantes } from "@/lib/offline/buscar";
import type { ProductoBusquedaDTO } from "@/types/producto";
import { GrillaVariantes } from "@/components/ventas/grilla-variantes";

/**
 * Elegir talle y color de un modelo para agregarlo al carrito (RV-5, #64).
 * Trae TODAS las combinaciones del modelo (no solo las que coincidieron con
 * la búsqueda), del servidor o de la copia local si no hay conexión.
 */
export function SelectorVariante({
  modeloId,
  nombre,
  cotizacionUSD,
  onElegir,
  onCerrar,
}: {
  modeloId: number;
  nombre: string;
  cotizacionUSD: number;
  onElegir: (p: ProductoBusquedaDTO) => void;
  onCerrar: () => void;
}) {
  const [variantes, setVariantes] = useState<ProductoBusquedaDTO[] | null>(null);
  const [local, setLocal] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    buscarVariantes(modeloId, controller.signal)
      .then((r) => {
        setVariantes(r.items);
        setLocal(r.local);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setVariantes([]);
      });
    return () => controller.abort();
  }, [modeloId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-10 backdrop-blur-sm sm:pt-24" onClick={onCerrar}>
      <div
        role="dialog"
        aria-label={`Elegir talle y color de ${nombre}`}
        className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">{nombre}</h2>
            <p className="text-xs text-text-dim">Elegí talle y color. El número es el stock de esta sucursal.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>
        {local && variantes && variantes.length > 0 && (
          <p className="mb-2 text-xs text-warning">Sin conexión: stock de la última sincronización.</p>
        )}
        {variantes == null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
          </div>
        ) : variantes.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-dim">Este modelo no tiene combinaciones disponibles.</p>
        ) : (
          <GrillaVariantes variantes={variantes} cotizacionUSD={cotizacionUSD} onElegir={onElegir} />
        )}
      </div>
    </div>
  );
}
