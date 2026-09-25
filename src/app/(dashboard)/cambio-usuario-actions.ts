"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { crearPaseCambioUsuario } from "@/lib/cambio-usuario";
import { INICIO_EMPLEADO } from "@/lib/permisos";

/**
 * Cambio rápido de usuario sin cerrar sesión (licencia PREMIUM):
 * - Admin → Empleado: directo, sin contraseña.
 * - Empleado → Admin: pide la contraseña del admin.
 *
 * Acá se decide si el cambio está permitido; recién ahí se emite el pase
 * firmado y se abre la sesión del otro usuario (provider "cambio-usuario"
 * en src/auth.ts). El pase nunca llega al navegador.
 */

type Resultado = { success: true; destino: string } | { success: false; error: string };

async function abrirSesion(usuarioId: number, destino: string): Promise<Resultado> {
  try {
    await signIn("cambio-usuario", { pase: crearPaseCambioUsuario(usuarioId), redirect: false });
    return { success: true, destino };
  } catch (e) {
    if (e instanceof AuthError) {
      return { success: false, error: "No se pudo cambiar de usuario. Probá cerrando sesión y entrando de nuevo." };
    }
    throw e;
  }
}

export async function cambiarAEmpleado(): Promise<Resultado> {
  const actual = await obtenerUsuarioActual();
  if (actual.rol !== "ADMIN") return { success: false, error: "Solo el administrador puede hacer este cambio." };

  const empleado = await prisma.usuario.findFirst({
    where: { empresaId: actual.empresaId, rol: "EMPLEADO", activo: true },
    select: { id: true },
  });
  if (!empleado) return { success: false, error: "No hay un usuario empleado. Crealo en Configuración." };

  // Si la empresa no es Premium, el provider rechaza al empleado.
  return abrirSesion(empleado.id, INICIO_EMPLEADO);
}

export async function cambiarAAdmin(password: string): Promise<Resultado> {
  const actual = await obtenerUsuarioActual();
  if (actual.rol !== "EMPLEADO") return { success: false, error: "Ya estás como administrador." };
  if (!password) return { success: false, error: "Ingresá la contraseña del administrador." };

  const admin = await prisma.usuario.findFirst({
    where: { empresaId: actual.empresaId, rol: "ADMIN", activo: true },
    orderBy: { id: "asc" },
    select: { id: true, passwordHash: true },
  });
  if (!admin) return { success: false, error: "No se encontró el usuario administrador." };

  const valida = await bcrypt.compare(password, admin.passwordHash);
  if (!valida) {
    // Pequeña espera para que probar contraseñas de a una sea lento.
    await new Promise((r) => setTimeout(r, 1000));
    return { success: false, error: "Contraseña incorrecta." };
  }

  return abrirSesion(admin.id, "/");
}
