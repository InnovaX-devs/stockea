"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import DateInput from "@/components/ui/date-input";
import type { TabReporte } from "@/lib/reportes";

const TABS: { value: TabReporte; label: string }[] = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "periodo", label: "Período" },
];

export function TabsReportes({
  tabActual,
  desde,
  hasta,
}: {
  tabActual: TabReporte;
  desde?: string;
  hasta?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function cambiarTab(tab: TabReporte) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // El parámetro va como "2026-10-09" o, con hora, "2026-10-09T08:00".
  const partes = (valor?: string) => ({ fecha: valor?.slice(0, 10) ?? "", hora: valor?.slice(11, 16) ?? "" });
  const desdeP = partes(desde);
  const hastaP = partes(hasta);

  function actualizar(clave: "desde" | "hasta", fecha: string, hora: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "periodo");
    if (fecha) params.set(clave, hora ? `${fecha}T${hora}` : fecha);
    else params.delete(clave);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const claseHora =
    "rounded-md border border-border bg-white px-2 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => cambiarTab(t.value)}
            className={`rounded-lg px-3 py-1.5 text-sm cursor-pointer font-medium transition-colors ${
              tabActual === t.value
                ? "bg-primary text-white"
                : "text-text-dim hover:bg-surface-hover hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabActual === "periodo" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white p-3">
          <div className="flex flex-col gap-1 text-sm text-text-dim">
            Desde
            <div className="flex gap-2">
              <DateInput
                defaultValue={desdeP.fecha}
                onChange={(valor) => actualizar("desde", valor, desdeP.hora)}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="time"
                aria-label="Hora desde (opcional)"
                defaultValue={desdeP.hora}
                disabled={!desdeP.fecha}
                onChange={(e) => actualizar("desde", desdeP.fecha, e.target.value)}
                className={claseHora}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-text-dim">
            Hasta
            <div className="flex gap-2">
              <DateInput
                defaultValue={hastaP.fecha}
                onChange={(valor) => actualizar("hasta", valor, hastaP.hora)}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="time"
                aria-label="Hora hasta (opcional)"
                defaultValue={hastaP.hora}
                disabled={!hastaP.fecha}
                onChange={(e) => actualizar("hasta", hastaP.fecha, e.target.value)}
                className={claseHora}
              />
            </div>
          </div>
          <p className="basis-full text-xs text-text-dim">
            La hora es opcional. Sirve si el negocio trabaja pasada la medianoche: por ejemplo, del jueves 08:00 al viernes 03:00.
          </p>
        </div>
      )}
    </div>
  );
}