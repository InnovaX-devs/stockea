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

  function actualizarFecha(clave: "desde" | "hasta", valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "periodo");
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

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
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Desde
            <DateInput
              defaultValue={desde ?? ""}
              onChange={(valor) => actualizarFecha("desde", valor)}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-dim">
            Hasta
            <DateInput
              defaultValue={hasta ?? ""}
              onChange={(valor) => actualizarFecha("hasta", valor)}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
      )}
    </div>
  );
}