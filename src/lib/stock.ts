import { Prisma } from "@prisma/client";

/**
 * Movimientos de stock, POR SUCURSAL (issue #31).
 *
 * El stock de cada sucursal está en "StockSucursal" (sin fila = 0).
 * "Producto"."stockActual" es el TOTAL de todas las sucursales y estas
 * funciones lo mantienen sincronizado en la misma transacción: nunca
 * escribir ninguno de los dos a mano.
 *
 * Igual que antes, todo va en UNA consulta sin importar cuántos productos
 * sean, y es atómico ("cantidad = cantidad - 3", no se calcula antes y se
 * pisa): una venta de 200 productos tarda lo mismo que una de 2 y dos
 * operaciones simultáneas sobre el mismo producto no se pisan.
 *
 * Orden de bloqueo: siempre primero "StockSucursal" y después "Producto", en
 * todas las funciones (y en la confirmación de compras), para que dos
 * operaciones simultáneas no se traben entre sí.
 *
 * Se usan dentro de transacciones (`tx`). El sucursalId tiene que venir de
 * requerirSucursalId() o de la venta guardada, nunca del navegador.
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

/** Ajusta el total en "Producto" (después de haber tocado "StockSucursal"). */
async function moverTotal(tx: Db, empresaId: number, grupos: [number, number][], signo: 1 | -1) {
  await tx.$executeRaw`
    UPDATE "Producto" AS p
    SET "stockActual" = p."stockActual" + (${signo}::int * v.cantidad)
    FROM (VALUES ${valores(grupos)}) AS v(id, cantidad)
    WHERE p.id = v.id AND p."empresaId" = ${empresaId}`;
}

/**
 * Resta stock de la sucursal solo si alcanza para TODOS los productos. Si
 * alguno no tiene suficiente en esa sucursal, lanza "Stock insuficiente
 * para ..." y la transacción se deshace entera.
 */
export async function descontarStock(tx: Db, empresaId: number, sucursalId: number, items: Item[]) {
  const grupos = agrupar(items);
  if (grupos.length === 0) return;

  const actualizados = await tx.$queryRaw<{ productoId: number }[]>`
    UPDATE "StockSucursal" AS s
    SET "cantidad" = s."cantidad" - v.cantidad, "updatedAt" = now()
    FROM (VALUES ${valores(grupos)}) AS v(id, cantidad), "Producto" AS p, "Sucursal" AS su
    WHERE s."productoId" = v.id AND s."sucursalId" = ${sucursalId}
      AND p.id = v.id AND p."empresaId" = ${empresaId}
      AND su.id = s."sucursalId" AND su."empresaId" = ${empresaId}
      AND s."cantidad" >= v.cantidad
    RETURNING s."productoId"`;

  if (actualizados.length !== grupos.length) {
    const ok = new Set(actualizados.map((a) => a.productoId));
    const faltantes = grupos.filter(([id]) => !ok.has(id)).map(([id]) => id);
    const producto = await tx.producto.findFirst({
      where: { id: { in: faltantes }, empresaId },
      select: { nombre: true, stocks: { where: { sucursalId }, select: { cantidad: true } } },
    });
    throw new Error(
      producto
        ? `Stock insuficiente para "${producto.nombre}" (disponible: ${producto.stocks[0]?.cantidad ?? 0})`
        : "Uno o más productos no son válidos."
    );
  }

  await moverTotal(tx, empresaId, grupos, -1);
}

/**
 * Suma stock SOLO en la sucursal, sin tocar el total de "Producto". Es para
 * la confirmación de compras, que ya suma el total en su propia consulta
 * (junto con los precios). Todo lo demás usa sumarStock.
 */
export async function sumarStockSucursal(tx: Db, empresaId: number, sucursalId: number, items: Item[]) {
  const grupos = agrupar(items);
  if (grupos.length === 0) return grupos;

  const insertados = await tx.$queryRaw<{ productoId: number }[]>`
    INSERT INTO "StockSucursal" ("productoId", "sucursalId", "cantidad", "updatedAt")
    SELECT v.id, su.id, v.cantidad, now()
    FROM (VALUES ${valores(grupos)}) AS v(id, cantidad)
    JOIN "Producto" AS p ON p.id = v.id AND p."empresaId" = ${empresaId}
    JOIN "Sucursal" AS su ON su.id = ${sucursalId} AND su."empresaId" = ${empresaId}
    WHERE true -- evita que Postgres lea el ON CONFLICT como parte del JOIN
    ON CONFLICT ("productoId", "sucursalId")
    DO UPDATE SET "cantidad" = "StockSucursal"."cantidad" + EXCLUDED."cantidad", "updatedAt" = now()
    RETURNING "productoId"`;

  if (insertados.length !== grupos.length) {
    throw new Error("Uno o más productos (o la sucursal) no son válidos.");
  }
  return grupos;
}

/** Suma stock en la sucursal (devolución por anulación o cancelación). */
export async function sumarStock(tx: Db, empresaId: number, sucursalId: number, items: Item[]) {
  const grupos = await sumarStockSucursal(tx, empresaId, sucursalId, items);
  if (grupos.length === 0) return;
  await moverTotal(tx, empresaId, grupos, 1);
}

/**
 * Ajuste manual desde el formulario del producto: suma o resta `diferencia`
 * en la sucursal. Si resta más de lo que hay en esa sucursal, lanza.
 */
export async function ajustarStock(tx: Db, empresaId: number, sucursalId: number, productoId: number, diferencia: number) {
  if (diferencia > 0) await sumarStock(tx, empresaId, sucursalId, [{ productoId, cantidad: diferencia }]);
  else if (diferencia < 0) await descontarStock(tx, empresaId, sucursalId, [{ productoId, cantidad: -diferencia }]);
}

/** Stock de un producto en una sucursal (0 si no tiene fila). */
export async function stockEnSucursal(db: Db, productoId: number, sucursalId: number): Promise<number> {
  const fila = await db.stockSucursal.findUnique({
    where: { productoId_sucursalId: { productoId, sucursalId } },
    select: { cantidad: true },
  });
  return fila?.cantidad ?? 0;
}

/** La sucursal principal (la más antigua) de la empresa. */
export async function sucursalPrincipalId(db: Db, empresaId: number): Promise<number> {
  const principal = await db.sucursal.findFirst({
    where: { empresaId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!principal) throw new Error("La empresa no tiene sucursales.");
  return principal.id;
}

/**
 * Sucursal de una venta ya guardada (para armar, anular o cancelar). Las
 * ventas sin sucursal (creadas antes del deploy) son de la principal.
 */
export async function sucursalDeVenta(db: Db, venta: { empresaId: number; sucursalId: number | null }) {
  return venta.sucursalId ?? sucursalPrincipalId(db, venta.empresaId);
}
