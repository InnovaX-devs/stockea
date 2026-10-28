import { NextRequest, NextResponse } from "next/server";
import { cambiarEstadoPromocion, editarPromocion, eliminarPromocion, leerPromocionInput } from "@/lib/promociones";
import { accesoPromociones, respuestaDeError } from "../acceso";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

async function leerId(context: Contexto) {
  const id = Number((await context.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Editar la promoción (#114). */
export async function PUT(request: NextRequest, context: Contexto) {
  const acceso = await accesoPromociones();
  if (acceso instanceof NextResponse) return acceso;
  const id = await leerId(context);
  if (id == null) return NextResponse.json({ error: "Promoción inválida." }, { status: 400 });
  try {
    await editarPromocion(acceso.empresaId, id, leerPromocionInput(await request.json().catch(() => null)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaDeError(error, "guardar");
  }
}

/** Pausar o reactivar: { activo: boolean }. */
export async function PATCH(request: NextRequest, context: Contexto) {
  const acceso = await accesoPromociones();
  if (acceso instanceof NextResponse) return acceso;
  const id = await leerId(context);
  const body = await request.json().catch(() => null);
  if (id == null || typeof body?.activo !== "boolean") return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  try {
    await cambiarEstadoPromocion(acceso.empresaId, id, body.activo);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaDeError(error, "actualizar");
  }
}

/** Eliminar (si ya tiene ventas, queda pausada para no perder el historial). */
export async function DELETE(_request: NextRequest, context: Contexto) {
  const acceso = await accesoPromociones();
  if (acceso instanceof NextResponse) return acceso;
  const id = await leerId(context);
  if (id == null) return NextResponse.json({ error: "Promoción inválida." }, { status: 400 });
  try {
    return NextResponse.json({ resultado: await eliminarPromocion(acceso.empresaId, id) });
  } catch (error) {
    return respuestaDeError(error, "eliminar");
  }
}
