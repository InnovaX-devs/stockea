import { Prisma } from "@prisma/client";

/**
 * Movimientos de stock en UNA sola consulta, sin importar cuántos productos
 * sean, y atómicos: el stock se suma o resta en la base ("stock = stock - 3"),
 * no se calcula antes y se pisa. Así:
 * - una venta de 200 productos tarda lo mismo que una de 2 (antes eran 2
 *   consultas por producto y las transacciones grandes vencían);
 * - dos operaciones simultáneas sobre el mismo producto no se pisan.
 *
 * Se usan dentro de transacciones (`tx`).
 */

type Item = { productoId: number | null; cantidad: number };
type Db = Prisma.TransactionClient;

/** Suma cantidades del mismo producto (puede venir dos veces en el carrito). */
function agrupar(items: Item[]) {
  const porProducto = new Map<number, number>();
  for (const { productoId, cantidad } of items) {
    if (productoId == null || !(cantidad > 0)) continue;
    porProducto.set(productoId, (porProducto.get(productoId) ?? 0) + cantidad);
  }
  return [...porProducto.entries()];
}

function valores(grupos: [number, number][]) {
  return Prisma.join(grupos.map(([id, cantidad]) => Prisma.sql`(${id}::int, ${cantidad}::int)`));
}

/**
 * Resta stock solo si alcanza para TODOS los productos. Si alguno no tiene
 * suficiente, lanza "Stock insuficiente para ..." y la transacción se
 * deshace entera.
 */
export async function descontarStock(tx: Db, empresaId: number, items: Item[]) {
  const grupos = agrupar(items);
  if (grupos.length === 0) return;

  const actualizados = await tx.$queryRaw<{ id: number }[]>`
    UPDATE "Producto" AS p
    SET "stockActual" = p."stockActual" - v.cantidad
    FROM (VALUES ${valores(grupos)}) AS v(id, cantidad)
    WHERE p.id = v.id AND p."empresaId" = ${empresaId} AND p."stockActual" >= v.cantidad
    RETURNING p.id`;

  if (actualizados.length !== grupos.length) {
    const ok = new Set(actualizados.map((a) => a.id));
    const faltantes = grupos.filter(([id]) => !ok.has(id)).map(([id]) => id);
    const productos = await tx.producto.findMany({
      where: { id: { in: faltantes }, empresaId },
      select: { nombre: true, stockActual: true },
    });
    const p = productos[0];
    throw new Error(
      p
        ? `Stock insuficiente para "${p.nombre}" (disponible: ${p.stockActual})`
        : "Uno o más productos no son válidos."
    );
  }
}

/** Suma stock (devolución por anulación o cancelación, o compra recibida). */
export async function sumarStock(tx: Db, empresaId: number, items: Item[]) {
  const grupos = agrupar(items);
  if (grupos.length === 0) return;
  await tx.$executeRaw`
    UPDATE "Producto" AS p
    SET "stockActual" = p."stockActual" + v.cantidad
    FROM (VALUES ${valores(grupos)}) AS v(id, cantidad)
    WHERE p.id = v.id AND p."empresaId" = ${empresaId}`;
}
