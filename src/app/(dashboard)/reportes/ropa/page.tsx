import { notFound } from "next/navigation";
import { rangoParaTab, textoRango, type TabReporte } from "@/lib/reportes";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { configRubro } from "@/lib/rubro";
import { obtenerReporteRopa } from "./queries";
import { TabsReportes } from "@/components/reportes/TabsReportes";
import { EtiquetaSucursal } from "@/components/reportes/etiqueta-sucursal";
import { RankingRopa } from "@/components/reportes/ranking-ropa";

type SearchParams = { tab?: string; desde?: string; hasta?: string };
const TABS_VALIDOS: TabReporte[] = ["diario", "semanal", "mensual", "periodo", "cuenta"];

export default async function ReportesRopaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const config = await obtenerConfiguracion();
  // Solo existe para el rubro ropa: en los demás rubros la ruta no se ve.
  if (!configRubro(config.rubro).usaTallesColores) notFound();

  const params = await searchParams;
  const tab: TabReporte = TABS_VALIDOS.includes(params.tab as TabReporte) ? (params.tab as TabReporte) : "mensual";
  const rango = rangoParaTab(tab, params.desde, params.hasta);
  const faltaPeriodo = tab === "periodo" && (!params.desde || !params.hasta);
  const rangoInvalido = rango.hasta <= rango.desde;

  return (
    <div className="space-y-4 print:p-0">
      <div className="space-y-0.5 print:hidden">
        <p className="text-sm text-text-dim">{textoRango(rango, params.desde, params.hasta)}</p>
        <EtiquetaSucursal />
      </div>
      <TabsReportes tabActual={tab} desde={params.desde} hasta={params.hasta} />

      {faltaPeriodo ? (
        <p className="text-sm text-text-dim">Elegí un rango de fechas para ver el reporte.</p>
      ) : rangoInvalido ? (
        <p className="text-sm text-danger">El &quot;hasta&quot; tiene que ser después del &quot;desde&quot;.</p>
      ) : (
        <Contenido rango={rango} />
      )}
    </div>
  );
}

async function Contenido({ rango }: { rango: { desde: Date; hasta: Date } }) {
  const r = await obtenerReporteRopa(rango);
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-dim">
        {r.totalUnidades} {r.totalUnidades === 1 ? "prenda vendida" : "prendas vendidas"} en el período.
      </p>
      <RankingRopa
        titulo="Más vendidos por modelo"
        vacio="Sin ventas de ropa en el período."
        filas={r.porModelo.map((m) => ({ clave: String(m.modeloId ?? "x"), titulo: m.nombre, cantidad: m.cantidad, montoARS: m.montoARS }))}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingRopa
          titulo="Talles más vendidos"
          vacio="Sin datos de talles."
          filas={r.porTalle.map((t) => ({ clave: t.valor, titulo: `Talle ${t.valor}`, cantidad: t.cantidad, montoARS: t.montoARS }))}
        />
        <RankingRopa
          titulo="Colores más vendidos"
          vacio="Sin datos de colores."
          filas={r.porColor.map((c) => ({ clave: c.valor, titulo: c.valor, cantidad: c.cantidad, montoARS: c.montoARS }))}
        />
      </div>
    </div>
  );
}