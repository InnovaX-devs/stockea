import { NextRequest, NextResponse } from "next/server";
import { crearPromocion, leerPromocionInput, listarPromociones } from "@/lib/promociones";
import { accesoPromociones, respuestaDeError } from "./acceso";

export const dynamic = "force-dynamic";

/** Listado de promociones (#114). */
export async function GET() {
  const acceso = await accesoPromociones();
  if (acceso instanceof NextResponse) return acceso;
  try {
    return NextResponse.json({ items: await listarPromociones(acceso.empresaId) });
  } catch (error) {
    return respuestaDeError(error, "cargar");
  }
}

/** Nueva promoción. */
export async function POST(request: NextRequest) {
  const acceso = await accesoPromociones();
  if (acceso instanceof NextResponse) return acceso;
  try {
    const input = leerPromocionInput(await request.json().catch(() => null));
    const id = await crearPromocion(acceso.empresaId, input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return respuestaDeError(error, "crear");
  }
}
