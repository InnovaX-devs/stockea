import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { ErrorSolicitud, actualizarPreciosMasivo, type PayloadActualizarPrecios } from "@/lib/actualizar-precios-masivo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const body: PayloadActualizarPrecios = await request.json();
    const { cantidadAfectados } = await actualizarPreciosMasivo(prisma, empresaId, body);

    return NextResponse.json({
      message: "Precios actualizados con éxito",
      cantidadAfectados,
    });
  } catch (error: unknown) {
    if (error instanceof ErrorSolicitud) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error al actualizar precios masivamente:", error);
    return NextResponse.json(
      { error: (error instanceof Error && error.message) || "Error interno al actualizar precios" },
      { status: 500 }
    );
  }
}
