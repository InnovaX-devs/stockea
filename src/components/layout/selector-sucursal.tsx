"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Layers, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { elegirSucursal } from "@/app/(dashboard)/sucursal-actions";

export type SucursalBarra = {
  sucursales: { id: number; nombre: string }[];
  /** null = "Todas las sucursales" (solo admin). */
  actualId: number | null;
  puedeElegir: boolean;
};

const CHIP =
  "flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white";

/**
 * Sucursal activa en la barra superior. Solo aparece si la empresa tiene más
 * de una sucursal: el admin la puede cambiar; el empleado solo la ve.
 */
export function SelectorSucursal({ sucursales, actualId, puedeElegir }: SucursalBarra) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("click", onClickFuera);
    return () => document.removeEventListener("click", onClickFuera);
  }, []);

  const actual = sucursales.find((s) => s.id === actualId);
  const etiqueta = actual?.nombre ?? "Todas las sucursales";

  if (!puedeElegir) {
    return (
      <span className={cn(CHIP, "max-w-[120px]")} title={`Sucursal: ${etiqueta}`}>
        <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        <span className="hidden truncate lg:inline">{etiqueta}</span>
      </span>
    );
  }

  function elegir(valor: number | "todas") {
    setAbierto(false);
    if ((valor === "todas" && actualId === null) || valor === actualId) return;
    startTransition(async () => {
      const r = await elegirSucursal(valor);
      if (!r.success) return void toast.error(r.error);
      // Recarga completa: varias pantallas (productos, carrito, buscadores)
      // traen el stock del lado del navegador y tienen que volver a pedirlo.
      window.location.reload();
    });
  }

  const opcion = (activa: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors cursor-pointer",
      activa ? "bg-primary-soft/[0.16] text-white" : "text-white hover:bg-white/[0.06]"
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={pendiente}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={cn(
          CHIP,
          "max-w-[120px] cursor-pointer px-2.5 transition-colors hover:border-primary-soft/50 disabled:opacity-60"
        )}
        title={`Sucursal: ${etiqueta} (cambiar)`}
      >
        {actual ? (
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        ) : (
          <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        )}
        {/* En pantallas chicas solo el ícono; en medianas el nombre recortado. */}
        <span className="hidden truncate lg:inline">{pendiente ? "Cambiando..." : etiqueta}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", abierto && "rotate-180")} strokeWidth={2} />
      </button>

      {abierto && (
        <div
          role="listbox"
          className="bg-topbar absolute right-0 top-[calc(100%+6px)] z-[60] min-w-[220px] rounded-xl border border-white/10 p-1.5 shadow-xl"
        >
          {sucursales.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === actualId}
              onClick={() => elegir(s.id)}
              className={opcion(s.id === actualId)}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="flex-1 truncate">{s.nombre}</span>
              {s.id === actualId && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            role="option"
            aria-selected={actualId === null}
            onClick={() => elegir("todas")}
            className={opcion(actualId === null)}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="flex-1">Todas las sucursales</span>
            {actualId === null && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
          <p className="px-3 pb-1 pt-1.5 text-[11px] leading-snug text-white/60">
            &quot;Todas&quot; es para consultar. Para vender o cerrar caja elegí una sucursal.
          </p>
        </div>
      )}
    </div>
  );
}
