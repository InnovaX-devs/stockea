import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ean13InternoAlAzar } from "@/lib/codigo-barras";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * `cantidad` códigos EAN-13 internos que no usa ningún producto de la empresa
 * (ni se repiten entre sí). El índice único empresaId + codigoBarras es el
 * control final; esto evita chocar en el caso normal.
 */
export async function codigosInternosLibres(db: Db, empresaId: number, cantidad: number): Promise<string[]> {
  const elegidos = new Set<string>();
  for (let intento = 0; intento < 10 && elegidos.size < cantidad; intento++) {
    const candidatos = new Set<string>();
    while (candidatos.size < (cantidad - elegidos.size) * 2) {
      const c = ean13InternoAlAzar();
      if (!elegidos.has(c)) candidatos.add(c);
    }
    const usados = await db.producto.findMany({
      where: { empresaId, codigoBarras: { in: [...candidatos] } },
      select: { codigoBarras: true },
    });
    const ocupados = new Set(usados.map((u) => u.codigoBarras));
    for (const c of candidatos) {
      if (elegidos.size >= cantidad) break;
      if (!ocupados.has(c)) elegidos.add(c);
    }
  }
  if (elegidos.size < cantidad) throw new Error("No se pudieron generar códigos únicos. Probá de nuevo.");
  return [...elegidos];
}
