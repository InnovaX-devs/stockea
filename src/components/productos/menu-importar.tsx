"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";

/**
 * Un solo botón "Importar / actualizar" en Productos, con las dos opciones de planilla:
 * cargar productos nuevos (Excel o CSV) o actualizar los que ya existen (CSV).
 */
export function MenuImportar({ onImportar, onActualizar }: { onImportar: () => void; onActualizar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const opciones = [
    { icono: Upload, titulo: "Cargar productos nuevos", detalle: "Desde Excel o CSV. Los que ya existen no se tocan.", accion: onImportar },
    { icono: RefreshCw, titulo: "Actualizar productos existentes", detalle: "Desde un CSV: precios, costos, nombres… (por ejemplo, la lista del proveedor).", accion: onActualizar },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover cursor-pointer"
      >
        <FileSpreadsheet className="h-4 w-4 shrink-0" />
        <span className="truncate">Importar / actualizar</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] max-w-[85vw] rounded-xl border border-border bg-white p-1.5 shadow-xl">
          {opciones.map(({ icono: Icono, titulo, detalle, accion }) => (
            <button
              key={titulo}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                accion();
              }}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover cursor-pointer"
            >
              <Icono className="mt-0.5 h-4 w-4 shrink-0 text-text-dim" />
              <span>
                <span className="block text-sm font-medium text-text">{titulo}</span>
                <span className="block text-xs text-text-dim">{detalle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
