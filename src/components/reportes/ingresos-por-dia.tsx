"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/currency";
import type { IngresoPorDia } from "@/types/reporte";

type Metrica = "ingresos" | "ganancia" | "items";

const TABS: { value: Metrica; label: string }[] = [
  { value: "ingresos", label: "Ingresos" },
  { value: "ganancia", label: "Ganancia" },
  { value: "items", label: "Ítems" },
];

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatearEtiqueta(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia);
  return `${DIAS_SEMANA[d.getDay()]} ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

function valorDe(item: IngresoPorDia, metrica: Metrica): number {
  if (metrica === "ingresos") return item.ingresosARS;
  if (metrica === "ganancia") return item.gananciaARS;
  return item.items;
}

function formatearValor(valor: number, metrica: Metrica): string {
  return metrica === "items" ? valor.toString() : formatCurrency(valor, "ARS");
}

export function IngresosPorDia({ datos }: { datos: IngresoPorDia[] }) {
  const [metrica, setMetrica] = useState<Metrica>("ingresos");

  if (datos.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Ingresos por día</h2>
        <p className="text-sm text-text-dim">Sin datos en el período.</p>
      </div>
    );
  }

  const valores = datos.map((d) => valorDe(d, metrica));
  const maximoAbs = Math.max(...valores.map((v) => Math.abs(v)), 1);

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Ingresos por día</h2>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-hover p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setMetrica(t.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                metrica === t.value
                  ? "bg-primary text-white"
                  : "text-text-dim hover:bg-surface-hover hover:text-text cursor-pointer"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* h-40 acá es la altura "real" que van a heredar las columnas de abajo */}
      <div className="flex h-40 justify-center gap-1.5 overflow-x-auto pb-1">
        {datos.map((item) => {
          const valor = valorDe(item, metrica);
          const alturaPct = Math.max((Math.abs(valor) / maximoAbs) * 100, valor !== 0 ? 3 : 0);
          return (
            <div
              key={item.fecha}
              className="flex w-full min-w-[28px] max-w-[48px] flex-1 flex-col items-center gap-1"
            >
              {/* esta zona sí tiene altura definida (flex-1 dentro de un padre
                  con altura fija), así que el % de la barra ahora funciona */}
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t transition-all ${valor < 0 ? "bg-red-500" : "bg-primary"}`}
                  style={{ height: `${alturaPct}%` }}
                  title={formatearValor(valor, metrica)}
                />
              </div>
              <span className="shrink-0 text-[10px] text-text-dim">{formatearEtiqueta(item.fecha)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}