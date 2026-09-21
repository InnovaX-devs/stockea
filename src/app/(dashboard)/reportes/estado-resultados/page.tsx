import { rangoParaTab, esMismoDia, type TabReporte } from "@/lib/reportes";
import { obtenerReporte } from "../queries";
import { TabsReportes } from "@/components/reportes/TabsReportes";
import { formatCurrency } from "@/lib/currency";
import { formatFechaAR } from "@/lib/timezone";
import { cn } from "@/lib/cn";

type SearchParams = { tab?: string; desde?: string; hasta?: string };

const TABS_VALIDOS: TabReporte[] = ["diario", "semanal", "mensual", "periodo", "cuenta"];

export default async function EstadoResultadosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab: TabReporte = TABS_VALIDOS.includes(params.tab as TabReporte) ? (params.tab as TabReporte) : "mensual";
  const rango = rangoParaTab(tab, params.desde, params.hasta);
  const faltaPeriodo = tab === "periodo" && (!params.desde || !params.hasta);
  const hastaVisible = new Date(rango.hasta.getTime() - 1);
  const rangoTexto = esMismoDia(rango.desde, hastaVisible)
    ? formatFechaAR(rango.desde)
    : `${formatFechaAR(rango.desde)} — ${formatFechaAR(hastaVisible)}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-dim">{rangoTexto}</p>
      <TabsReportes tabActual={tab} desde={params.desde} hasta={params.hasta} />

      {faltaPeriodo ? (
        <p className="text-sm text-text-dim">Elegí un rango de fechas para ver el estado de resultados.</p>
      ) : (
        <EstadoResultadosSection rango={rango} />
      )}
    </div>
  );
}

async function EstadoResultadosSection({ rango }: { rango: { desde: Date; hasta: Date } }) {
  const { kpis } = await obtenerReporte(rango);
  const gananciaBrutaARS = kpis.ingresosARS - kpis.costoVentaARS;

  const filas = [
    { label: "Ingresos por ventas (cobrado)", valor: kpis.ingresosARS, tono: "normal" as const },
    { label: "Costo de mercadería vendida", valor: -kpis.costoVentaARS, tono: "resta" as const },
    { label: "Ganancia bruta", valor: gananciaBrutaARS, tono: "subtotal" as const },
    { label: "Gastos operativos", valor: -kpis.egresosARS, tono: "resta" as const },
    { label: "Ganancia neta", valor: kpis.gananciaNetaARS, tono: "total" as const },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Estado de Resultados</h2>
        <p className="text-xs text-text-dim">
          Ingresos por lo efectivamente cobrado en el período (no lo facturado). Margen neto: {kpis.margenPorcentaje.toFixed(1)}%
        </p>
      </div>
      <div className="divide-y divide-border">
        {filas.map((f) => (
          <div
            key={f.label}
            className={cn(
              "flex items-center justify-between px-4 py-3",
              f.tono === "subtotal" && "bg-surface",
              f.tono === "total" && "bg-success/10"
            )}
          >
            <span
              className={cn(
                "text-sm",
                f.tono === "normal" && "text-text-dim",
                f.tono === "resta" && "pl-4 text-text-dim",
                f.tono === "subtotal" && "font-medium text-text",
                f.tono === "total" && "font-semibold text-text"
              )}
            >
              {f.label}
            </span>
            <span
              className={cn(
                "text-sm",
                f.tono === "normal" && "text-text",
                f.tono === "resta" && "text-danger",
                f.tono === "subtotal" && "font-medium text-text",
                f.tono === "total" && "text-lg font-bold text-success"
              )}
            >
              {f.valor < 0 ? "-" : ""}
              {formatCurrency(Math.abs(f.valor), "ARS")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
