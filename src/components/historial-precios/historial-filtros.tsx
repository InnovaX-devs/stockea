"use client";

import { Search } from "lucide-react";
import DateInput from "@/components/ui/date-input";
import Select from "@/components/ui/select";
import { CAMPO_OPTIONS, ORIGEN_OPTIONS } from "@/lib/historial-precio-labels";

export type HistorialFiltrosState = {
  producto: string;
  campo: string;
  origen: string;
  fechaDesde: string;
  fechaHasta: string;
};

type Props = {
  filtros: HistorialFiltrosState;
  onChange: (filtros: HistorialFiltrosState) => void;
};

export function HistorialFiltros({ filtros, onChange }: Props) {
  function set<K extends keyof HistorialFiltrosState>(key: K, value: string) {
    onChange({ ...filtros, [key]: value });
  }

  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="lg:col-span-1">
        <label className="block text-xs font-medium text-text-dim">Producto</label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={filtros.producto}
            onChange={(e) => set("producto", e.target.value)}
            placeholder="Nombre del producto..."
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-dim">Campo</label>
        <Select
          value={filtros.campo}
          onChange={(v) => set("campo", v)}
          options={[
            { value: "", label: "Todos" },
            ...CAMPO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
          className="mt-1"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-dim">Origen</label>
        <Select
          value={filtros.origen}
          onChange={(v) => set("origen", v)}
          options={[
            { value: "", label: "Todos" },
            ...ORIGEN_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
          className="mt-1"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-dim">Desde</label>
        <DateInput
          value={filtros.fechaDesde}
          max={filtros.fechaHasta || undefined}
          onChange={(valor) => set("fechaDesde", valor)}
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-dim">Hasta</label>
        <DateInput
          value={filtros.fechaHasta}
          min={filtros.fechaDesde || undefined}
          onChange={(valor) => set("fechaHasta", valor)}
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}