"use client";

import Select from "@/components/ui/select";
import DateInput from "@/components/ui/date-input";
import type { CuentaDTO } from "@/types/cuenta";
import { ETIQUETAS_CONCEPTO, type ConceptoMovimientoCaja } from "@/types/movimiento-caja";
import { fechaISOAR } from "@/lib/timezone";

export type PeriodoRapido = "HOY" | "SEMANA" | "MES" | "PERSONALIZADO";

export interface FiltrosFlujo {
  periodoRapido: PeriodoRapido;
  desde: string;
  hasta: string;
  tipo: "" | "INGRESO" | "EGRESO";
  cuentaId: string;
  concepto: "" | ConceptoMovimientoCaja;
}

interface Props {
  filtros: FiltrosFlujo;
  onChange: (filtros: FiltrosFlujo) => void;
  cuentas: CuentaDTO[];
}

function calcularRango(
  periodo: PeriodoRapido
): { desde: string; hasta: string } {
  const hoy = fechaISOAR();

  if (periodo === "HOY") {
    return { desde: hoy, hasta: hoy };
  }

  if (periodo === "SEMANA") {
    const fecha = new Date(`${hoy}T00:00:00-03:00`);

    // Domingo como inicio de semana, igual que tu lógica anterior.
    fecha.setDate(fecha.getDate() - fecha.getDay());

    return {
      desde: fechaISOAR(fecha),
      hasta: hoy,
    };
  }

  if (periodo === "MES") {
    const [anio, mes] = hoy.split("-");

    return {
      desde: `${anio}-${mes}-01`,
      hasta: hoy,
    };
  }

  return { desde: "", hasta: "" };
}

const OPCIONES_TIPO = [
  { value: "", label: "Todos los tipos" },
  { value: "INGRESO", label: "Ingreso" },
  { value: "EGRESO", label: "Egreso" },
];

export function FiltrosFlujoCaja({ filtros, onChange, cuentas }: Props) {
  function setPeriodoRapido(periodo: PeriodoRapido) {
    const rango = calcularRango(periodo);
    onChange({ ...filtros, periodoRapido: periodo, ...rango });
  }

  const opcionesCuenta = [
    { value: "", label: "Todas las cuentas" },
    ...cuentas.map((c) => ({ value: String(c.id), label: c.nombre })),
  ];

  const opcionesConcepto = [
    { value: "", label: "Todos los medios" },
    ...Object.entries(ETIQUETAS_CONCEPTO).map(([valor, etiqueta]) => ({
      value: valor,
      label: etiqueta,
    })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-dim">Período:</span>
        {(["HOY", "SEMANA", "MES"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriodoRapido(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filtros.periodoRapido === p
                ? "bg-primary text-white"
                : "border border-border bg-white text-text-dim hover:bg-surface-hover cursor-pointer hover:text-text"
            }`}
          >
            {p === "HOY" ? "Hoy" : p === "SEMANA" ? "Esta semana" : "Este mes"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium uppercase tracking-wider text-text-dim">Desde</label>
          <DateInput
            value={filtros.desde}
            onChange={(valor) => onChange({ ...filtros, periodoRapido: "PERSONALIZADO", desde: valor })}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium uppercase tracking-wider text-text-dim">Hasta</label>
          <DateInput
            value={filtros.hasta}
            onChange={(valor) => onChange({ ...filtros, periodoRapido: "PERSONALIZADO", hasta: valor })}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
          />
        </div>
        <Select
          value={filtros.tipo}
          onChange={(value) => onChange({ ...filtros, tipo: value as FiltrosFlujo["tipo"] })}
          options={OPCIONES_TIPO}
          className="w-full sm:w-44"
        />
        <Select
          value={filtros.cuentaId}
          onChange={(value) => onChange({ ...filtros, cuentaId: value })}
          options={opcionesCuenta}
          className="w-full sm:w-48"
        />
        <Select
          value={filtros.concepto}
          onChange={(value) => onChange({ ...filtros, concepto: value as FiltrosFlujo["concepto"] })}
          options={opcionesConcepto}
          className="w-full sm:w-48"
        />
      </div>
    </div>
  );
}