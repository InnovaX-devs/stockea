import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { rangoParaTab, textoRango, type TabReporte } from "@/lib/reportes";
import { obtenerReporte } from "@/app/(dashboard)/reportes/queries";
import { ReporteDocument } from "@/lib/pdf/ReporteDocument";
import { obtenerConfiguracion } from "@/lib/configuracion";

const TABS_VALIDOS: TabReporte[] = ["diario", "semanal", "mensual", "periodo", "cuenta"];

const TITULOS: Record<TabReporte, string> = {
  diario: "Reporte Diario",
  semanal: "Reporte Semanal",
  mensual: "Reporte Mensual",
  periodo: "Reporte por Período",
  cuenta: "Reporte por Cuenta",
};

export async function GET(req: NextRequest) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarReportesAvanzados) {
    return NextResponse.json({ error: "Los reportes no están disponibles en tu plan actual." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tabParam = searchParams.get("tab");
  const tab: TabReporte = TABS_VALIDOS.includes(tabParam as TabReporte)
    ? (tabParam as TabReporte)
    : "diario";
  const desdeParam = searchParams.get("desde") ?? undefined;
  const hastaParam = searchParams.get("hasta") ?? undefined;

  const rango = rangoParaTab(tab, desdeParam, hastaParam);

  const buffer = await renderToBuffer(
    <ReporteDocument
      reporte={await obtenerReporte(rango)}
      configuracion={configuracion}
      titulo={TITULOS[tab]}
      rangoTexto={tab === "periodo" ? textoRango(rango, desdeParam, hastaParam) : undefined}
    />
  );

  const nombreArchivo = `reporte-${tab}-${rango.desde.toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}