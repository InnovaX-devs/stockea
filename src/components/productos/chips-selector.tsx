"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { limpiarLista } from "@/lib/variantes";

interface ChipsSelectorProps {
  titulo: string;
  /** Opciones ofrecidas (la lista sugerida de Configuración). */
  sugeridos: string[];
  seleccionados: string[];
  onChange: (valores: string[]) => void;
  placeholder?: string;
}

/**
 * Elegir varios valores con chips: se tocan los sugeridos o se escribe uno
 * nuevo (Enter o coma lo agrega). Un valor escrito a mano queda seleccionado y
 * se puede sacar tocándolo de nuevo.
 */
export function ChipsSelector({ titulo, sugeridos, seleccionados, onChange, placeholder }: ChipsSelectorProps) {
  const [texto, setTexto] = useState("");

  const todos = limpiarLista([...sugeridos, ...seleccionados]);
  const estaSeleccionado = (v: string) => seleccionados.some((s) => s.toLowerCase() === v.toLowerCase());

  function alternar(valor: string) {
    // Mantiene el orden de la lista para que la grilla quede prolija.
    onChange(todos.filter((v) => (v === valor ? !estaSeleccionado(v) : estaSeleccionado(v))));
  }

  function agregarEscritos() {
    const nuevos = limpiarLista(texto);
    if (nuevos.length > 0) onChange(limpiarLista([...seleccionados, ...nuevos]));
    setTexto("");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-text-dim">{titulo}</label>
        {seleccionados.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[11px] text-text-dim hover:text-text">
            Limpiar
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {todos.map((valor) => {
          const activo = estaSeleccionado(valor);
          return (
            <button
              key={valor}
              type="button"
              onClick={() => alternar(valor)}
              aria-pressed={activo}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activo ? "border-primary bg-primary text-white" : "border-border bg-surface text-text hover:bg-surface-hover"
              )}
            >
              {valor}
            </button>
          );
        })}
      </div>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            agregarEscritos();
          }
        }}
        onBlur={agregarEscritos}
        placeholder={placeholder ?? "Escribí uno nuevo y apretá Enter"}
        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
      />
    </div>
  );
}
