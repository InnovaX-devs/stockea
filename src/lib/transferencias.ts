import type { Prisma } from "@prisma/client";
import { descontarStock, sumarStock } from "@/lib/stock";
import { siguienteNumero } from "@/lib/numeracion";
import { CANTIDAD_MAXIMA, MAX_ITEMS } from "@/lib/transferencias-constantes";

/**
 * Transferencias de stock entre sucursales (issue #36).
 *
 * - Enviar: descuenta el stock de la sucursal origen (descontarStock, que
 *   falla si no alcanza) y crea la transferencia en estado ENVIADA. Todo en
 *   una transacción: o se hace todo o no se hace nada.
 * - Recibir: la sucursal destino confirma y se suma el stock allí
 *   (sumarStock). El cambio de estado es atómico (ENVIADA → RECIBIDA solo si
 *   sigue ENVIADA), así que confirmar dos veces nunca suma el stock dos veces.
 *
 * Mientras está ENVIADA la mercadería está "en camino": ya no cuenta en el
 * origen y todavía no cuenta en el destino.
 *
 * Los ids de empresa y sucursal tienen que venir de la sesión, nunca del navegador.
 */

type Db = Prisma.TransactionClient;

export class TransferenciaError extends Error {}

type ItemEntrada = { productoId: number; cantidad: number };

/** Valida y suma cantidades del mismo producto (puede venir repetido). */
export function normalizarItems(items: ItemEntrada[]): ItemEntrada[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TransferenciaError("Agregá al menos un producto a transferir.");
  }
  if (items.length > MAX_ITEMS) {
    throw new TransferenciaError(`Una transferencia puede tener hasta ${MAX_ITEMS} productos.`);
  }
  const porProducto = new Map<number, number>();
  for (const { productoId, cantidad } of items) {
    if (!Number.isInteger(productoId) || productoId <= 0) {
      throw new TransferenciaError("Hay un producto inválido en la transferencia.");
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > CANTIDAD_MAXIMA) {
      throw new TransferenciaError(`La cantidad tiene que ser un número entero entre 1 y ${CANTIDAD_MAXIMA}.`);
    }
    porProducto.set(productoId, (porProducto.get(productoId) ?? 0) + cantidad);
  }
  const resultado = [...porProducto.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad }));
  if (resultado.some((i) => i.cantidad > CANTIDAD_MAXIMA)) {
    throw new TransferenciaError(`La cantidad de un producto no puede superar ${CANTIDAD_MAXIMA}.`);
  }
  return resultado;
}

/**
 * Envía: descuenta el stock del origen y registra la transferencia.
 * Lanza "Stock insuficiente para ..." si en el origen no alcanza.
 */
export async function enviarTransferencia(
  tx: Db,
  datos: {
    empresaId: number;
    origenId: number;
    destinoId: number;
    usuarioId: number;
    observaciones: string | null;
    items: ItemEntrada[];
  }
) {
  const { empresaId, origenId, destinoId, usuarioId, observaciones } = datos;
  if (origenId === destinoId) {
    throw new TransferenciaError("La sucursal de destino tiene que ser distinta a la de origen.");
  }
  const items = normalizarItems(datos.items);

  const productos = await tx.producto.findMany({
    // Las promociones no tienen stock propio: no se transfieren (#114).
    where: { id: { in: items.map((i) => i.productoId) }, empresaId, esPromocion: false },
    select: { id: true },
  });
  if (productos.length !== items.length) {
    throw new TransferenciaError("Uno o más productos no son válidos.");
  }

  const numero = await siguienteNumero(tx, empresaId, "transferencia");

  // El stock se descuenta primero: si no alcanza, se deshace todo.
  await descontarStock(tx, empresaId, origenId, items);

  return tx.transferencia.create({
    data: {
      empresaId,
      numero,
      origenId,
      destinoId,
      usuarioEnvioId: usuarioId,
      observaciones,
      items: { create: items },
    },
    select: { id: true, numero: true },
  });
}

/**
 * Recibe: la sucursal destino confirma y el stock entra ahí. Solo funciona si
 * la transferencia es de esa sucursal y sigue ENVIADA.
 */
export async function recibirTransferencia(
  tx: Db,
  datos: { empresaId: number; destinoId: number; usuarioId: number; transferenciaId: number }
) {
  const { empresaId, destinoId, usuarioId, transferenciaId } = datos;

  // Guard atómico: solo una confirmación gana, las demás ven count = 0.
  const marcada = await tx.transferencia.updateMany({
    where: { id: transferenciaId, empresaId, destinoId, estado: "ENVIADA" },
    data: { estado: "RECIBIDA", fechaRecepcion: new Date(), usuarioRecepcionId: usuarioId },
  });
  if (marcada.count === 0) {
    const existente = await tx.transferencia.findFirst({
      where: { id: transferenciaId, empresaId },
      select: { estado: true, destinoId: true },
    });
    if (!existente) throw new TransferenciaError("La transferencia no existe.");
    if (existente.destinoId !== destinoId) {
      throw new TransferenciaError("Esta transferencia es para otra sucursal: solo ella puede confirmarla.");
    }
    throw new TransferenciaError("Esta transferencia ya fue recibida.");
  }

  const items = await tx.itemTransferencia.findMany({
    where: { transferenciaId },
    select: { productoId: true, cantidad: true },
  });
  await sumarStock(tx, empresaId, destinoId, items);
}