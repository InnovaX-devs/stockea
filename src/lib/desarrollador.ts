import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioActualOpcional } from "@/lib/empresa";

/**
 * Panel de InnovaX (/innovax): solo para los desarrolladores.
 *
 * El permiso es Usuario.esDesarrollador, que se marca a mano con SQL (ver
 * docs/PANEL-INNOVAX.md). Se vuelve a leer de la base en cada request: si se
 * le saca el permiso a alguien, deja de poder entrar en el momento.
 *
 * Todo lo del panel trabaja sobre CUALQUIER empresa (a propósito, no filtra
 * por empresaId), así que cada página y cada server action del panel tiene
 * que empezar llamando a requerirDesarrollador().
 */

export async function esDesarrolladorActual(): Promise<boolean> {
  const usuario = await obtenerUsuarioActualOpcional();
  if (!usuario) return false;
  const fila = await prisma.usuario.findUnique({
    where: { id: usuario.id },
    select: { esDesarrollador: true, activo: true },
  });
  return Boolean(fila?.activo && fila.esDesarrollador);
}

/** Para server actions del panel: lanza si no es desarrollador. */
export async function requerirDesarrollador() {
  const usuario = await obtenerUsuarioActualOpcional();
  if (!usuario || !(await esDesarrolladorActual())) {
    throw new Error("No tenés permiso para esto.");
  }
  return usuario;
}

/** Para páginas del panel: si no es desarrollador, la página "no existe". */
export async function requerirDesarrolladorPagina() {
  if (!(await esDesarrolladorActual())) notFound();
}
