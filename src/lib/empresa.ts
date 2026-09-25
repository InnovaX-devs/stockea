import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Rol } from "@/lib/permisos";

export type UsuarioActual = {
  id: number;
  empresaId: number;
  rol: Rol;
};

/**
 * Usuario de este request, validado contra la base (no solo contra la
 * cookie): si el admin borró o desactivó al empleado, o la empresa dejó de
 * ser Premium, el acceso se corta en el momento y no cuando vence la sesión.
 *
 * Devuelve null si no hay sesión o si el usuario ya no es válido.
 * `cache` hace que se consulte una sola vez por request.
 */
export const obtenerUsuarioActualOpcional = cache(async (): Promise<UsuarioActual | null> => {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!session?.user?.empresaId || !id) return null;

  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: {
      id: true,
      empresaId: true,
      rol: true,
      activo: true,
      empresa: { select: { configuracion: { select: { licencia: true } } } },
    },
  });

  if (!usuario || !usuario.activo || usuario.empresaId !== session.user.empresaId) return null;
  if (usuario.rol === "EMPLEADO" && usuario.empresa.configuracion?.licencia !== "PREMIUM") return null;

  return { id: usuario.id, empresaId: usuario.empresaId, rol: usuario.rol };
});

/** Igual que la anterior, pero lanza si no hay usuario válido. */
export async function obtenerUsuarioActual(): Promise<UsuarioActual> {
  const usuario = await obtenerUsuarioActualOpcional();
  if (!usuario) {
    throw new Error("No se pudo resolver el usuario autenticado.");
  }
  return usuario;
}

/**
 * Punto ÚNICO de resolución de "a qué empresa pertenece este request".
 *
 * Todo server action y toda ruta API que toque datos de negocio (productos,
 * ventas, clientes, cuentas, etc.) DEBE llamar a esta función y usar el
 * empresaId devuelto en el `where` de cada query — tanto para leer como
 * para escribir. Nunca confiar en un empresaId que venga del cliente
 * (body, query params): siempre se resuelve server-side desde la sesión.
 *
 * Si no hay sesión válida, lanza. Las rutas protegidas ya deberían haber
 * cortado el acceso antes (middleware/auth), así que llegar acá sin sesión
 * es un bug, no un caso esperado — por eso explota en vez de devolver un
 * valor por defecto silencioso.
 */
export async function obtenerEmpresaIdActual(): Promise<number> {
  const usuario = await obtenerUsuarioActual();
  return usuario.empresaId;
}

export async function esAdminActual(): Promise<boolean> {
  const usuario = await obtenerUsuarioActualOpcional();
  return usuario?.rol === "ADMIN";
}

/**
 * Para server actions que son solo del admin. Las server actions se pueden
 * invocar desde cualquier página, así que el proxy no alcanza: cada una que
 * sea de admin tiene que llamar a esto al principio.
 */
export async function requerirAdmin(): Promise<UsuarioActual> {
  const usuario = await obtenerUsuarioActual();
  if (usuario.rol !== "ADMIN") {
    throw new Error("No tenés permiso para hacer esto.");
  }
  return usuario;
}
