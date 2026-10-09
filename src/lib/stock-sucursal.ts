import { prisma } from "@/lib/prisma";
import { obtenerContextoSucursal } from "@/lib/sucursal";

/**
 * Lectura de stock por sucursal (issue #32).
 *
 * Las pantallas siguen recibiendo `stockActual` y `stockMinimo` en cada
 * producto, pero con el valor de la sucursal en la que se está trabajando:
 * - Empresa con una sola sucursal: no cambia nada (el total ES el de la
 *   sucursal), así que ni se consulta "StockSucursal".
 * - Sucursal elegida: la cantidad y el mínimo de esa sucursal (0 si no hay fila).
 * - "Todas las sucursales" (solo admin): el total de "Producto", que
 *   src/lib/stock.ts mantiene como suma de todas las sucursales.
 *
 * Así, buscadores, catálogo, carrito, inventario y PDFs muestran el stock
 * correcto sin cambiar cada pantalla.
 */

type ConStock = { id: number; stockActual: number; stockMinimo?: number };

/** Sucursal cuyo stock hay que mostrar, o null si se muestra el total. */
export async function sucursalParaMostrarStock(): Promise<number | null> {
  const { actual, multisucursal } = await obtenerContextoSucursal();
  if (!multisucursal || !actual) return null;
  return actual.id;
}

/** Cantidad y mínimo por producto en una sucursal. */
export async function stockDeSucursal(productoIds: number[], sucursalId: number) {
  const filas = productoIds.length
    ? await prisma.stockSucursal.findMany({
        where: { sucursalId, productoId: { in: productoIds } },
        select: { productoId: true, cantidad: true, stockMinimo: true },
      })
    : [];
  return new Map(filas.map((f) => [f.productoId, f]));
}

/**
 * Devuelve los productos con `stockActual` (y `stockMinimo`, si viene) de la
 * sucursal actual. Usar en todo lo que muestre stock.
 */
export async function conStockDeSucursal<T extends ConStock>(productos: T[], sucursalId?: number | null): Promise<T[]> {
  const sucursal = sucursalId === undefined ? await sucursalParaMostrarStock() : sucursalId;
  if (sucursal == null || productos.length === 0) return productos;

  const porProducto = await stockDeSucursal(
    productos.map((p) => p.id),
    sucursal
  );
  return productos.map((p) => {
    const fila = porProducto.get(p.id);
    return {
      ...p,
      stockActual: fila?.cantidad ?? 0,
      ...(p.stockMinimo !== undefined ? { stockMinimo: fila?.stockMinimo ?? 0 } : {}),
    };
  });
}

/** Igual que conStockDeSucursal, para un solo producto. */
export async function conStockDeSucursalUno<T extends ConStock>(producto: T): Promise<T> {
  const [conStock] = await conStockDeSucursal([producto]);
  return conStock;
}
