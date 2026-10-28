"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Atajos de teclado de Nueva venta (issue #110). La lógica está en use-atajos-venta. */
export const ATAJOS_VENTA: { tecla: string; accion: string }[] = [
  { tecla: "F2", accion: "Ir al buscador de productos (escanear o escribir)" },
  { tecla: "F3", accion: "Buscar cliente" },
  { tecla: "F4", accion: "Consultar precio" },
  { tecla: "F6", accion: "Descuento" },
  { tecla: "F8", accion: "Elegir el medio de pago" },
  { tecla: "F9", accion: "Confirmar venta" },
  { tecla: "+ / −", accion: "Sumar o restar 1 al último producto agregado" },
  { tecla: "Supr", accion: "Quitar el último producto agregado" },
  { tecla: "Esc", accion: "Cerrar la ventana abierta" },
];

/** La tecla del atajo, en chiquito al lado del botón. Solo en pantallas grandes (con teclado). */
export function Tecla({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "hidden rounded border border-current/30 px-1 font-sans text-[10px] font-medium leading-4 opacity-70 lg:inline-block",
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function BotonAtajos() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Atajos de teclado"
        aria-label="Atajos de teclado"
        className="hidden items-center justify-center rounded-lg border border-border bg-white px-2.5 py-2 text-text-dim hover:bg-surface-hover lg:flex"
      >
        <Keyboard size={16} />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-border px-5 pb-4 pt-5">
              <div>
                <h2 className="text-lg font-bold text-text">Atajos de teclado</h2>
                <p className="text-sm text-text-dim">Para cobrar sin usar el mouse</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="text-text-dim hover:text-text" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <ul className="divide-y divide-border px-5 py-2">
              {ATAJOS_VENTA.map((a) => (
                <li key={a.tecla} className="flex items-center gap-3 py-2 text-sm">
                  <kbd className="w-14 shrink-0 rounded-md border border-border bg-surface-hover px-1.5 py-0.5 text-center font-sans text-xs font-semibold text-text">
                    {a.tecla}
                  </kbd>
                  <span className="text-text">{a.accion}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-5 py-3 text-xs text-text-dim">
              &quot;+&quot;, &quot;−&quot; y Supr no se activan mientras escribís en un campo. En notebooks puede hacer falta
              apretar <span className="font-medium">Fn</span> junto con la tecla F.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
