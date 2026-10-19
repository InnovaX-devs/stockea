import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nombreVariante, normalizarValor } from "@/lib/variantes";

/**
 * Modelos de ropa (ProductoModelo) y sus combinaciones talle × color (RV-2).
 * Todo filtra SIEMPRE por empresaId, como el resto del sistema.
 */

type Db = Prisma.TransactionClient;

/**
 * ¿Ya existe esa combinación en el modelo? El índice único de la base
 * (empresaId, modeloId, talle, color) NO alcanza cuando talle o color son NULL
 * (Postgres no compara NULL con NULL), así que se chequea acá antes de crear o
 * cambiar una variante. `excluirProductoId` sirve al editar la propia.
 */
export async function existeCombinacion(
  db: Db,
  datos: { empresaId: number; modeloId: number; talle?: string | null; color?: string | null; excluirProductoId?: number }
): Promise<boolean> {
  const existente = await db.producto.findFirst({
    where: {
      empresaId: datos.empresaId,
      modeloId: datos.modeloId,
      talle: normalizarValor(datos.talle),
      color: normalizarValor(datos.color),
      ...(datos.excluirProductoId ? { id: { not: datos.excluirProductoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

/**
 * Copia el nombre, la marca y la categoría del modelo a TODAS sus
 * combinaciones. Va dentro de la misma transacción que cambia el modelo.
 * Los nombres se reconstruyen con el talle y color de cada producto.
 */
export async function sincronizarVariantesDeModelo(db: Db, empresaId: number, modeloId: number): Promise<number> {
  const modelo = await db.productoModelo.findFirst({ where: { id: modeloId, empresaId } });
  if (!modelo) throw new Error("El modelo no existe.");

  const variantes = await db.producto.findMany({
    where: { empresaId, modeloId },
    select: { id: true, nombre: true, talle: true, color: true },
  });

  for (const v of variantes) {
    const nombre = nombreVariante(modelo.nombre, v.talle, v.color);
    await db.producto.update({
      where: { id: v.id },
      data: { marcaId: modelo.marcaId, categoriaId: modelo.categoriaId, ...(nombre !== v.nombre ? { nombre } : {}) },
    });
  }
  return variantes.length;
}

type DatosModelo = { nombre: string; marcaId?: number | null; categoriaId?: number | null };

async function validarMarcaYCategoria(db: Db, empresaId: number, d: DatosModelo) {
  if (d.marcaId && !(await db.marca.findFirst({ where: { id: d.marcaId, empresaId }, select: { id: true } }))) {
    throw new Error("La marca no existe.");
  }
  if (d.categoriaId && !(await db.categoria.findFirst({ where: { id: d.categoriaId, empresaId }, select: { id: true } }))) {
    throw new Error("La categoría no existe.");
  }
}

export async function crearModelo(empresaId: number, datos: DatosModelo) {
  const nombre = normalizarValor(datos.nombre);
  if (!nombre) throw new Error("Ingresá el nombre del modelo.");
  await validarMarcaYCategoria(prisma, empresaId, datos);
  return prisma.productoModelo.create({
    data: { empresaId, nombre, marcaId: datos.marcaId ?? null, categoriaId: datos.categoriaId ?? null },
  });
}

/**
 * Cambia nombre, marca o categoría del modelo y actualiza todas sus
 * combinaciones en la misma transacción (si algo falla, no queda nada a medias).
 */
export async function actualizarModelo(empresaId: number, modeloId: number, datos: DatosModelo) {
  const nombre = normalizarValor(datos.nombre);
  if (!nombre) throw new Error("Ingresá el nombre del modelo.");
  return prisma.$transaction(async (tx) => {
    await validarMarcaYCategoria(tx, empresaId, datos);
    const actualizado = await tx.productoModelo.updateMany({
      where: { id: modeloId, empresaId },
      data: { nombre, marcaId: datos.marcaId ?? null, categoriaId: datos.categoriaId ?? null },
    });
    if (actualizado.count === 0) throw new Error("El modelo no existe.");
    const variantes = await sincronizarVariantesDeModelo(tx, empresaId, modeloId);
    return { variantes };
  });
}
