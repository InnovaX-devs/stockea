import { prisma } from "@/lib/prisma";
import { ajustarStock, stockEnSucursal } from "@/lib/stock";
import { conStockDeSucursal } from "@/lib/stock-sucursal";

/**
 * Stock de un modelo de ropa por talle y color (RV-4, #63).
 *
 * - Lectura: el stock y el mínimo de la sucursal en la que se trabaja (con
 *   "Todas", el total de todas las sucursales).
 * - Edición: siempre en una sucursal concreta; se guarda la diferencia con
 *   ajustarStock (mismo camino que editar el stock de un producto).
 */

export type CeldaStock = {
  id: number;
  nombre: string;
  talle: string | null;
  color: string | null;
  activo: boolean;
  stock: number;
  minimo: number;
};

export async function stockDeModelo(empresaId: number, modeloId: number, sucursalStock: number | null) {
  const modelo = await prisma.productoModelo.findFirst({
    where: { id: modeloId, empresaId },
    select: {
      id: true,
      nombre: true,
      productos: {
        orderBy: { id: "asc" },
        select: { id: true, nombre: true, talle: true, color: true, activo: true, stockActual: true, stockMinimo: true },
      },
    },
  });
  if (!modelo) return null;
  const conStock = await conStockDeSucursal(modelo.productos, sucursalStock);
  const variantes: CeldaStock[] = conStock.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    talle: p.talle,
    color: p.color,
    activo: p.activo,
    stock: p.stockActual,
    minimo: p.stockMinimo ?? 0,
  }));
  return { id: modelo.id, nombre: modelo.nombre, variantes };
}

/** Deja el stock de una combinación del modelo en `cantidad` en la sucursal. Devuelve el anterior y el nuevo. */
export async function fijarStockVariante(
  empresaId: number,
  sucursalId: number,
  modeloId: number,
  productoId: number,
  cantidad: number
) {
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 1_000_000) {
    throw new Error("El stock tiene que ser un número entero entre 0 y 1.000.000.");
  }
  const producto = await prisma.producto.findFirst({
    where: { id: productoId, empresaId, modeloId },
    select: { id: true, nombre: true },
  });
  if (!producto) throw new Error("Esa combinación no es de este modelo.");

  return prisma.$transaction(async (tx) => {
    const anterior = await stockEnSucursal(tx, productoId, sucursalId);
    await ajustarStock(tx, empresaId, sucursalId, productoId, cantidad - anterior);
    return { nombre: producto.nombre, anterior, nuevo: cantidad };
  });
}
