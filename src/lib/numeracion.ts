import type { Prisma } from "@prisma/client";

/**
 * Numeración visible propia de cada empresa: la venta, compra o presupuesto
 * N.º 1 de un negocio es la primera de ESE negocio (el id es interno y
 * compartido entre empresas).
 *
 * El contador vive en Empresa y se incrementa con un UPDATE atómico. Usarlo
 * DENTRO de la misma transacción que crea el registro: si dos ventas se
 * confirman a la vez, la fila de la empresa queda bloqueada hasta que la
 * primera termina, así nunca se repite un número; y si la transacción falla,
 * el número no se consume.
 */
type Db = Prisma.TransactionClient;

export async function siguienteNumero(db: Db, empresaId: number, tipo: "venta" | "compra" | "presupuesto"): Promise<number> {
  const where = { id: empresaId };
  if (tipo === "venta") {
    const e = await db.empresa.update({ where, data: { ultimoNumeroVenta: { increment: 1 } }, select: { ultimoNumeroVenta: true } });
    return e.ultimoNumeroVenta;
  }
  if (tipo === "compra") {
    const e = await db.empresa.update({ where, data: { ultimoNumeroCompra: { increment: 1 } }, select: { ultimoNumeroCompra: true } });
    return e.ultimoNumeroCompra;
  }
  const e = await db.empresa.update({ where, data: { ultimoNumeroPresupuesto: { increment: 1 } }, select: { ultimoNumeroPresupuesto: true } });
  return e.ultimoNumeroPresupuesto;
}

/** "#12", o "Ajuste" para los ajustes manuales de deuda (sin número). */
export function etiquetaVenta(numero: number | null | undefined) {
  return numero != null ? `#${numero}` : "Ajuste";
}

/** Nombre del PDF del comprobante de una venta (con su número visible). */
export function archivoComprobanteVenta(numero: number | null | undefined, ventaId: number) {
  return numero != null ? `comprobante-venta-${String(numero).padStart(6, "0")}.pdf` : `comprobante-ajuste-${ventaId}.pdf`;
}
