import { NextResponse } from "next/server";
import { obtenerConfiguracion } from "@/lib/configuracion";

export async function GET() {
  try {
    const config = await obtenerConfiguracion();
    return NextResponse.json({
      licencia: config.licencia,
      usaCotizacionUSD: config.usaCotizacionUSD,
      cotizacionUSD: config.cotizacionUSD,
      habilitarPresupuestos: config.habilitarPresupuestos,
      habilitarReportesAvanzados: config.habilitarReportesAvanzados,
      habilitarGastosFlujoCaja: config.habilitarGastosFlujoCaja,
      // Facturación: solo un Responsable Inscripto discrimina IVA por producto.
      discriminaIva: config.facturacionHabilitada && config.condicionIva === "RESPONSABLE_INSCRIPTO",
    });
  } catch (error) {
    console.error("Error al obtener configuración:", error);
    return NextResponse.json({ error: "Error al obtener la configuración" }, { status: 500 });
  }
}