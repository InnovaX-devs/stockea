import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { codigosInternosLibres } from "@/lib/codigo-barras-db";

export const dynamic = "force-dynamic";

/**
 * Generar códigos de barras internos (issue #106). Solo admin.
 *
 * - Sin productoIds: devuelve un código libre para cargarlo en el formulario
 *   del producto (se guarda cuando se guarda el producto).
 * - Con productoIds: les asigna un código a los que NO tienen. Nunca pisa uno
 *   existente.
 */
export async function POST(request: NextRequest) {
  let empresaId: number;
  try {
    empresaId = (await requerirAdmin()).empresaId;
  } catch {
    return NextResponse.json({ error: "No tenés permiso para hacer esto." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body?.productoIds)
    ? [...new Set<number>(body.productoIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))]
    : [];

  try {
    if (ids.length === 0) {
      const [codigo] = await codigosInternosLibres(prisma, empresaId, 1);
      return NextResponse.json({ codigo });
    }
    if (ids.length > 2000) return NextResponse.json({ error: "Máximo 2000 productos a la vez." }, { status: 400 });

    const asignados = await prisma.$transaction(async (tx) => {
      const sinCodigo = await tx.producto.findMany({
        where: { id: { in: ids }, empresaId, OR: [{ codigoBarras: null }, { codigoBarras: "" }] },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      const codigos = await codigosInternosLibres(tx, empresaId, sinCodigo.length);
      const resultado: { id: number; codigo: string }[] = [];
      for (const [i, p] of sinCodigo.entries()) {
        // El where vuelve a exigir "sin código": si alguien le cargó uno recién, no se pisa.
        const r = await tx.producto.updateMany({
          where: { id: p.id, empresaId, OR: [{ codigoBarras: null }, { codigoBarras: "" }] },
          data: { codigoBarras: codigos[i], updatedAt: new Date() },
        });
        if (r.count === 1) resultado.push({ id: p.id, codigo: codigos[i] });
      }
      return resultado;
    }, { timeout: 30000 });

    return NextResponse.json({ asignados });
  } catch (error) {
    console.error("Error al generar códigos de barras:", error);
    return NextResponse.json({ error: "No se pudieron generar los códigos. Probá de nuevo." }, { status: 500 });
  }
}
