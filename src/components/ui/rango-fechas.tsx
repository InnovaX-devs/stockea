"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, X } from "lucide-react";
import DateInput from "@/components/ui/date-input";

interface RangoFechasProps {
  desde: string | null;
  hasta: string | null;
  onCambiar: (desde: string | null, hasta: string | null) => void;
  alinear?: "inicio" | "fin";
}

function formatearFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function RangoFechas({ desde, hasta, onCambiar, alinear = "inicio" }: RangoFechasProps) {
  const [abierto, setAbierto] = useState(false);
  const [desdeLocal, setDesdeLocal] = useState(desde ?? "");
  const [hastaLocal, setHastaLocal] = useState(hasta ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDesdeLocal(desde ?? "");
    setHastaLocal(hasta ?? "");
  }, [desde, hasta]);

  useEffect(() => {
    if (!abierto) return;
    function handleClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", handleClickFuera);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickFuera);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [abierto]);

  const hayFiltro = !!desde || !!hasta;
  const etiqueta = hayFiltro
    ? `${desde ? formatearFecha(desde) : "…"} — ${hasta ? formatearFecha(hasta) : "…"}`
    : "Rango de fechas";

  function aplicar() {
    onCambiar(desdeLocal || null, hastaLocal || null);
    setAbierto(false);
  }

  function limpiar() {
    setDesdeLocal("");
    setHastaLocal("");
    onCambiar(null, null);
    setAbierto(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={`flex items-center gap-2 rounded-lg border cursor-pointer px-3 py-2 text-sm font-medium transition-colors ${
          hayFiltro
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-bg text-text-dim hover:text-text"
        }`}
      >
        <Calendar size={15} />
        {etiqueta}
      </button>

      {abierto && (
        <div
          className={`fixed inset-x-4 top-1/2 z-40 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-2xl
                     sm:absolute sm:inset-x-auto sm:top-full sm:z-30 sm:mt-2 sm:w-72 sm:translate-y-0 ${
                       alinear === "fin" ? "sm:right-0" : "sm:left-0"
                     }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Filtrar por fecha</span>
            <button type="button" onClick={() => setAbierto(false)} className="text-text-dim hover:text-text" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-dim">Desde</span>
              <DateInput
                value={desdeLocal}
                max={hastaLocal || undefined}
                onChange={(valor) => setDesdeLocal(valor)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-dim">Hasta</span>
              <DateInput
                value={hastaLocal}
                min={desdeLocal || undefined}
                onChange={(valor) => setHastaLocal(valor)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button type="button" onClick={limpiar} className="text-xs font-medium text-text-dim hover:text-text">
              Limpiar
            </button>
            <button
              type="button"
              onClick={aplicar}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}