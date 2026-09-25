import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "Pase" para cambiar de usuario sin cerrar sesión (admin ⇄ empleado).
 *
 * Lo crea SOLO el servidor, después de verificar que el cambio está
 * permitido (ver src/app/(dashboard)/cambio-usuario-actions.ts), y lo
 * consume el provider "cambio-usuario" de src/auth.ts. Va firmado con
 * AUTH_SECRET y vence en 60 segundos, así que no se puede fabricar ni
 * reutilizar después.
 */

const VIGENCIA_MS = 60_000;

function clave(): string {
  const secreto = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secreto) throw new Error("Falta AUTH_SECRET");
  return secreto;
}

function firmar(datos: string): string {
  return createHmac("sha256", clave()).update(`cambio-usuario:${datos}`).digest("base64url");
}

export function crearPaseCambioUsuario(usuarioId: number): string {
  const datos = `${usuarioId}.${Date.now() + VIGENCIA_MS}`;
  return `${datos}.${firmar(datos)}`;
}

/** Devuelve el id del usuario si el pase es válido y no venció; si no, null. */
export function verificarPaseCambioUsuario(pase: unknown): number | null {
  if (typeof pase !== "string") return null;
  const partes = pase.split(".");
  if (partes.length !== 3) return null;

  const [id, vence, firma] = partes;
  const esperada = Buffer.from(firmar(`${id}.${vence}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  if (!(Number(vence) > Date.now())) return null;

  const usuarioId = Number(id);
  return Number.isInteger(usuarioId) && usuarioId > 0 ? usuarioId : null;
}
