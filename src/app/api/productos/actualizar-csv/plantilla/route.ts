import { NextResponse } from "next/server";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { fechaISOAR } from "@/lib/timezone";
import { generarPlantillaActualizacion } from "@/lib/actualizar-productos-parseo";
import { productosParaPlantilla } from "@/lib/actualizar-productos";

export const dynamic = "force-dynamic";

/**
 * Plantilla para actualizar productos en lote (issue #109): un CSV con los productos
 * ACTUALES y las columnas editables. Solo admin con plan Pro. Se edita en Excel y se
 * vuelve a subir desde Productos → "Actualizar desde CSV".
 */
export async function GET() {
  try {
    const usuario = await requerirAdmin();
    const config = await obtenerConfiguracion();
    if (!config.habilitarImportacion) {
      return NextResponse.json({ error: "Actualizar productos desde un CSV está disponible en el plan Pro." }, { status: 403 });
    }
    const archivo = generarPlantillaActualizacion(await productosParaPlantilla(usuario.empresaId));
    return new NextResponse(new Uint8Array(archivo), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="productos-${fechaISOAR()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No tenés permiso")) {
      return NextResponse.json({ error: "No tenés permiso para descargar la plantilla." }, { status: 403 });
    }
    console.error("Plantilla de actualización de productos:", e);
    return NextResponse.json({ error: "No se pudo generar la plantilla." }, { status: 500 });
  }
}
