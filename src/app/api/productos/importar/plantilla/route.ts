import { NextRequest, NextResponse } from "next/server";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { configRubro } from "@/lib/rubro";
import { generarPlantilla, generarPlantillaCsv } from "@/lib/importar-productos-parseo";

export const dynamic = "force-dynamic";

/** Plantilla para importar productos (solo admin con plan Pro), según el rubro: Excel por defecto o CSV con `?formato=csv`. */
export async function GET(request: NextRequest) {
  try {
    await requerirAdmin();
    const config = await obtenerConfiguracion();
    if (!config.habilitarImportacion) {
      return NextResponse.json({ error: "La importación desde Excel está disponible en el plan Pro." }, { status: 403 });
    }
    const opciones = { usaTallesColores: configRubro(config.rubro).usaTallesColores, permiteUSD: config.usaCotizacionUSD };
    const csv = request.nextUrl.searchParams.get("formato") === "csv";
    const archivo = csv ? generarPlantillaCsv(opciones) : await generarPlantilla(opciones);
    return new NextResponse(new Uint8Array(archivo), {
      headers: {
        "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="plantilla-productos.${csv ? "csv" : "xlsx"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "No tenés permiso para descargar la plantilla." }, { status: 403 });
  }
}
