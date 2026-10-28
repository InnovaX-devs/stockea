import { NextResponse } from "next/server";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { PromocionError } from "@/lib/promociones";

/** Promociones (#114): solo el administrador, y solo en el plan Pro. */
export async function accesoPromociones(): Promise<{ empresaId: number } | NextResponse> {
  let empresaId: number;
  try {
    empresaId = (await requerirAdmin()).empresaId;
  } catch {
    return NextResponse.json({ error: "No tenés permiso para hacer esto." }, { status: 403 });
  }
  if (!(await obtenerConfiguracion()).habilitarPromociones) {
    return NextResponse.json({ error: "Las promociones están disponibles en el plan Pro." }, { status: 403 });
  }
  return { empresaId };
}

export function respuestaDeError(error: unknown, accion: string) {
  if (error instanceof PromocionError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(`[promociones] ${accion}:`, error);
  return NextResponse.json({ error: `No se pudo ${accion} la promoción.` }, { status: 500 });
}
