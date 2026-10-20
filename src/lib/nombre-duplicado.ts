/**
 * Marcas y categorías no pueden repetir nombre dentro de una empresa
 * (@@unique([empresaId, nombre]) en el schema). Estas ayudas arman la
 * respuesta para el usuario en lugar de dejar que la base tire un error 500.
 */

type Existente = { nombre: string; activa: boolean };

/** "Ya existe la categoría "Arroces"." (+ cómo reactivarla si está desactivada). */
export function mensajeNombreDuplicado(tipo: "marca" | "categoría", existente: Existente) {
  const base = `Ya existe la ${tipo} "${existente.nombre}".`;
  return existente.activa
    ? base
    : `${base} Está desactivada: podés activarla desde Marcas y categorías.`;
}

/** Error de Prisma por violar un índice único (otro request creó el mismo nombre a la vez). */
export function esErrorDeNombreUnico(error: unknown) {
  return (error as { code?: string } | null)?.code === "P2002";
}
