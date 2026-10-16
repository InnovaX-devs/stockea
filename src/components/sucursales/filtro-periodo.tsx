"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RangoFechas } from "@/components/ui/rango-fechas";
import { cn } from "@/lib/cn";

type Clave = "hoy" | "mes" | "mes-pasado" | "rango";

const OPCIONES: { clave: Exclude<Clave, "rango">; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "mes-pasado", etiqueta: "Mes pasado" },
];

/**
 * Período de los gastos del panel de sucursales. Vive en la URL:
 * ?periodo=hoy | mes-pasado, o ?desde=&hasta= para un rango. Sin parámetros
 * es "Este mes". Ventas y caja son siempre de hoy.
 */
export function FiltroPeriodo({ clave, desde, hasta }: { clave: Clave; desde: string; hasta: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = useTransition();
  const [eligiendo, setEligiendo] = useState(clave === "rango");

  function ir(params: Record<string, string>) {
    const query = new URLSearchParams(params).toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function elegirPreset(c: Exclude<Clave, "rango">) {
    setEligiendo(false);
    ir(c === "mes" ? {} : { periodo: c });
  }

  function elegirRango(d: string | null, h: string | null) {
    if (!d && !h) return elegirPreset("mes");
    ir({ ...(d ? { desde: d } : {}), ...(h ? { hasta: h } : {}) });
  }

  const boton = (activo: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
      activo ? "bg-primary text-white" : "text-text-dim hover:text-text"
    );

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", pendiente && "pointer-events-none opacity-60")}>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1" role="group" aria-label="Período">
        {OPCIONES.map((o) => (
          <button
            key={o.clave}
            type="button"
            onClick={() => elegirPreset(o.clave)}
            className={boton(!eligiendo && clave === o.clave)}
            aria-pressed={!eligiendo && clave === o.clave}
          >
            {o.etiqueta}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEligiendo(true)}
          className={boton(eligiendo)}
          aria-pressed={eligiendo}
        >
          Elegir fechas
        </button>
      </div>
      {eligiendo && (
        <RangoFechas
          desde={clave === "rango" ? desde : null}
          hasta={clave === "rango" ? hasta : null}
          onCambiar={elegirRango}
          alinear="fin"
        />
      )}
    </div>
  );
}