"use client";

import { useMemo } from "react";

import DateInput from "@/components/ui/date-input";
import { fechaISOAR } from "@/lib/timezone";

export type PeriodoAnalisis =
  | { modo: "mes"; mes: string } // YYYY-MM
  | { modo: "rango"; desde: string; hasta: string }; // YYYY-MM-DD

interface Props {
  periodo: PeriodoAnalisis;
  onChange: (periodo: PeriodoAnalisis) => void;
}

function mesActualISO(offset = 0) {
  const [anio, mes] = fechaISOAR().split("-").map(Number);

  const fecha = new Date(anio, mes - 1 - offset, 1);

  return `${fecha.getFullYear()}-${String(
    fecha.getMonth() + 1
  ).padStart(2, "0")}`;
}

export function SelectorPeriodoAnalisis({ periodo, onChange }: Props) {
  const accesosRapidos = useMemo(
    () => [
      { label: "Este mes", mes: mesActualISO(0) },
      { label: "Mes anterior", mes: mesActualISO(1) },
      { label: mesActualISO(2), mes: mesActualISO(2) },
      { label: mesActualISO(3), mes: mesActualISO(3) },
    ],
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white p-4">
      <div className="flex overflow-hidden rounded-lg border border-border">
        <button
          onClick={() =>
            onChange({
              modo: "mes",
              mes: mesActualISO(0),
            })
          }
          className={`px-3 py-1.5 text-sm ${
            periodo.modo === "mes"
              ? "bg-primary text-white"
              : "text-text-dim hover:bg-surface-hover cursor-pointer"
          }`}
        >
          Por mes
        </button>

        <button
          onClick={() =>
            onChange({
              modo: "rango",
              desde: `${mesActualISO(0)}-01`,
              hasta: fechaISOAR(),
            })
          }
          className={`px-3 py-1.5 text-sm ${
            periodo.modo === "rango"
              ? "bg-primary text-white"
              : "text-text-dim hover:bg-surface-hover cursor-pointer"
          }`}
        >
          Rango libre
        </button>
      </div>

      {periodo.modo === "mes" ? (
        <>
          <input
            type="month"
            value={periodo.mes}
            onChange={(e) =>
              onChange({
                modo: "mes",
                mes: e.target.value,
              })
            }
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="flex gap-1.5">
            {accesosRapidos.map((a) => (
              <button
                key={a.mes}
                onClick={() =>
                  onChange({
                    modo: "mes",
                    mes: a.mes,
                  })
                }
                className={`rounded-md px-2.5 py-1 text-xs ${
                  periodo.mes === a.mes
                    ? "bg-surface-hover font-medium text-primary"
                    : "text-text-dim hover:bg-surface-hover cursor-pointer"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <DateInput
            value={periodo.desde}
            onChange={(valor) =>
              onChange({
                ...periodo,
                desde: valor,
              })
            }
            max={periodo.hasta || undefined}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <span className="text-text-dim">a</span>

          <DateInput
            value={periodo.hasta}
            onChange={(valor) =>
              onChange({
                ...periodo,
                hasta: valor,
              })
            }
            min={periodo.desde || undefined}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
}