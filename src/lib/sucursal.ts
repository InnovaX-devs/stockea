import { cache } from "react";
import { cookies } from "next/headers";
import type { Licencia } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioActual } from "@/lib/empresa";

/**
 * Sucursales (issue #30).
 *
 * Reglas:
 * - Toda empresa tiene al menos una sucursal ("Principal"). Si por algún
 *   motivo no la tiene (empresa creada antes de las sucursales, seed viejo),
 *   se crea sola la primera vez que se consulta.
 * - BASICO: una sola sucursal. Si la empresa bajó de PREMIUM a BASICO y le
 *   quedaron varias, se usa solo la primera (la más antigua).
 * - PREMIUM: varias. Las adicionales las crea InnovaX con
 *   scripts/crear-sucursal.ts; el cliente no puede agregarlas.
 * - Empleado: fijo en su sucursal (Usuario.sucursalId).
 * - Admin: elige desde la barra superior (cookie). Puede elegir "Todas", pero
 *   solo para consultar: vender, cobrar o cerrar caja exige una sucursal
 *   concreta (ver requerirSucursalId).
 *
 * Igual que con empresaId, NUNCA confiar en un sucursalId que venga del
 * cliente (body, query params): siempre resolverlo con estas funciones.
 */

export const COOKIE_SUCURSAL = "stockea_sucursal";
export const VALOR_TODAS = "todas";

export type SucursalResumen = { id: number; nombre: string; direccion: string | null };

export type ContextoSucursal = {
  /** Sucursales que la empresa puede usar según su licencia, por antigüedad. */
  sucursales: SucursalResumen[];
  /** Sucursal en la que se está trabajando, o null si el admin eligió "Todas". */
  actual: SucursalResumen | null;
  /** Hay más de una sucursal habilitada (si no, no se muestra nada de sucursales). */
  multisucursal: boolean;
  /** El usuario puede cambiar de sucursal (solo el admin, con más de una). */
  puedeElegir: boolean;
};

export function limiteSucursales(licencia: Licencia): number {
  return licencia === "PREMIUM" ? Number.POSITIVE_INFINITY : 1;
}

/** Crea la "Principal" si la empresa todavía no tiene ninguna sucursal. */
async function asegurarSucursalPrincipal(empresaId: number) {
  const existe = await prisma.sucursal.findFirst({ where: { empresaId }, select: { id: true } });
  if (existe) return;
  try {
    await prisma.sucursal.create({ data: { empresaId, nombre: "Principal" } });
  } catch {
    // Dos requests a la vez: la creó el otro (índice único empresaId+nombre).
  }
}

/** Sucursales activas que la empresa puede usar según su licencia. */
export async function listarSucursalesHabilitadas(empresaId: number): Promise<SucursalResumen[]> {
  const config = await prisma.configuracion.findUnique({
    where: { empresaId },
    select: { licencia: true },
  });
  const licencia = config?.licencia ?? "BASICO";

  let sucursales = await prisma.sucursal.findMany({
    where: { empresaId, activa: true },
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, direccion: true },
  });
  if (sucursales.length === 0) {
    await asegurarSucursalPrincipal(empresaId);
    sucursales = await prisma.sucursal.findMany({
      where: { empresaId, activa: true },
      orderBy: { id: "asc" },
      select: { id: true, nombre: true, direccion: true },
    });
  }

  return sucursales.slice(0, limiteSucursales(licencia));
}

/**
 * Punto ÚNICO de resolución de "en qué sucursal se está trabajando".
 * Se calcula una sola vez por request.
 */
export const obtenerContextoSucursal = cache(async (): Promise<ContextoSucursal> => {
  const usuario = await obtenerUsuarioActual();
  const sucursales = await listarSucursalesHabilitadas(usuario.empresaId);
  const multisucursal = sucursales.length > 1;
  const principal = sucursales[0] ?? null;

  if (usuario.rol !== "ADMIN") {
    const propia = await prisma.usuario.findUnique({
      where: { id: usuario.id },
      select: { sucursalId: true },
    });
    // Si su sucursal se desactivó o quedó fuera de la licencia, cae en la principal.
    const actual = sucursales.find((s) => s.id === propia?.sucursalId) ?? principal;
    return { sucursales, actual, multisucursal, puedeElegir: false };
  }

  if (!multisucursal) {
    return { sucursales, actual: principal, multisucursal, puedeElegir: false };
  }

  const elegida = (await cookies()).get(COOKIE_SUCURSAL)?.value;
  if (elegida === VALOR_TODAS) {
    return { sucursales, actual: null, multisucursal, puedeElegir: true };
  }
  const actual = sucursales.find((s) => String(s.id) === elegida) ?? principal;
  return { sucursales, actual, multisucursal, puedeElegir: true };
});

/**
 * Para consultas (listados, reportes, panel): el id de la sucursal actual,
 * o null si el admin eligió "Todas" (en ese caso no filtrar por sucursal).
 */
export async function obtenerSucursalIdActual(): Promise<number | null> {
  const { actual } = await obtenerContextoSucursal();
  return actual?.id ?? null;
}

/**
 * Para operaciones que pasan en un local concreto (vender, cobrar, abrir o
 * cerrar caja, recibir mercadería). Lanza si el admin está en "Todas".
 */
export async function requerirSucursalId(): Promise<number> {
  const { actual } = await obtenerContextoSucursal();
  if (!actual) {
    throw new Error("Elegí una sucursal en la barra superior para hacer esta operación.");
  }
  return actual.id;
}
