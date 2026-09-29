import { prisma } from "@/lib/prisma";
import { fechaISOAR } from "@/lib/timezone";

/**
 * Turnos de caja (Básico y Premium).
 *
 * - La caja se ABRE sola a la hora configurada (Configuracion.horaAperturaCaja,
 *   por defecto 07:00 de Argentina) o a mano con "Abrir caja ahora".
 * - Se CIERRA con un CierreCaja (ver app/(dashboard)/finanzas/cierre-caja).
 * - Con la caja cerrada no se puede vender ni cobrar: lo controla
 *   mensajeSiCajaCerrada(), que llaman las server actions que mueven plata.
 *
 * No hace falta un proceso programado: la apertura automática se hace "al
 * pasar", la primera vez que alguien usa el sistema después de la hora.
 */

type Db = Pick<typeof prisma, "sesionCaja" | "movimientoCaja" | "configuracion">;

export const NOMBRE_APERTURA_AUTOMATICA = "Apertura automática";

/** Ahora. Centralizado para poder probar la lógica con otra hora. */
export function ahora(): Date {
  return new Date(Date.now());
}

export function esHoraValida(hora: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

/** Instante de hoy (Argentina) a la hora de apertura configurada. */
export function aperturaDeHoy(horaApertura: string, momento: Date = ahora()): Date {
  const hora = esHoraValida(horaApertura) ? horaApertura : "07:00";
  return new Date(`${fechaISOAR(momento)}T${hora}:00-03:00`);
}

export async function sesionAbierta(db: Db, empresaId: number) {
  return db.sesionCaja.findFirst({
    where: { empresaId, cerradaFecha: null },
    orderBy: { id: "asc" },
  });
}

export async function ultimoMovimientoId(db: Db, empresaId: number): Promise<number> {
  const ultimo = await db.movimientoCaja.findFirst({
    where: { empresaId },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return ultimo?.id ?? 0;
}

/**
 * Devuelve el turno abierto. Si no hay y ya corresponde (pasó la hora de
 * apertura desde el último cierre, o nunca se abrió una caja), lo abre solo.
 * Devuelve null si la caja está cerrada y todavía no es hora.
 */
export async function asegurarAperturaAutomatica(empresaId: number, db: Db = prisma) {
  const abierta = await sesionAbierta(db, empresaId);
  if (abierta) return abierta;

  const ultima = await db.sesionCaja.findFirst({ where: { empresaId }, orderBy: { id: "desc" } });
  const config = await db.configuracion.findUnique({
    where: { empresaId },
    select: { horaAperturaCaja: true },
  });
  const apertura = aperturaDeHoy(config?.horaAperturaCaja ?? "07:00");
  const corresponde =
    !ultima || (ahora() >= apertura && ultima.cerradaFecha != null && ultima.cerradaFecha < apertura);
  if (!corresponde) return null;

  await db.sesionCaja.create({
    data: {
      empresaId,
      abiertaPorNombre: NOMBRE_APERTURA_AUTOMATICA,
      aperturaAutomatica: true,
      aperturaMovimientoId: await ultimoMovimientoId(db, empresaId),
    },
  });

  // Si dos pedidos llegaron a abrirla a la vez, queda solo la primera.
  const abiertas = await db.sesionCaja.findMany({
    where: { empresaId, cerradaFecha: null },
    orderBy: { id: "asc" },
  });
  for (const duplicada of abiertas.slice(1)) {
    await db.sesionCaja.delete({ where: { id: duplicada.id } });
  }
  return abiertas[0] ?? null;
}

/**
 * Para las server actions que venden o cobran: devuelve el mensaje de error
 * si la caja está cerrada, o null si se puede seguir.
 */
export async function mensajeSiCajaCerrada(empresaId: number): Promise<string | null> {
  const sesion = await asegurarAperturaAutomatica(empresaId);
  return sesion
    ? null
    : "La caja está cerrada. Abrila desde Nueva venta o desde Finanzas → Cierre de caja para poder vender o cobrar.";
}
