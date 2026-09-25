"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { isPasswordValid } from "@/lib/password-validation";

/**
 * Gestión del usuario EMPLEADO (licencia PREMIUM, máximo uno por empresa).
 * Todo esto es solo del admin. Los permisos del empleado están en
 * src/lib/permisos.ts.
 */

type Resultado = { success: true } | { success: false; error: string };

export type UsuarioResumen = {
  id: number;
  nombre: string;
  email: string;
  rol: "ADMIN" | "EMPLEADO";
};

async function requerirAdminPremium() {
  const admin = await requerirAdmin();
  const config = await obtenerConfiguracion();
  if (config.licencia !== "PREMIUM") {
    throw new Error("El usuario empleado está disponible en el plan Premium.");
  }
  return admin;
}

export async function listarUsuarios(): Promise<UsuarioResumen[]> {
  const admin = await requerirAdmin();
  return prisma.usuario.findMany({
    where: { empresaId: admin.empresaId, activo: true },
    orderBy: [{ rol: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, email: true, rol: true },
  });
}

export async function crearEmpleado(input: { nombre: string; email: string; password: string }): Promise<Resultado> {
  try {
    const admin = await requerirAdminPremium();
    const nombre = input.nombre.trim();
    const email = input.email.trim().toLowerCase();

    if (!nombre) return { success: false, error: "Ingresá el nombre del empleado." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "Ingresá un email válido." };
    if (!isPasswordValid(input.password)) {
      return { success: false, error: "La contraseña no cumple con los requisitos de seguridad." };
    }

    const yaHayEmpleado = await prisma.usuario.count({
      where: { empresaId: admin.empresaId, rol: "EMPLEADO" },
    });
    if (yaHayEmpleado > 0) {
      return { success: false, error: "Ya hay un usuario empleado. Eliminalo para crear otro." };
    }

    // El email es único en todo el sistema (todas las empresas).
    const emailEnUso = await prisma.usuario.findUnique({ where: { email } });
    if (emailEnUso) return { success: false, error: "Ese email ya está en uso. Probá con otro." };

    await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash: await bcrypt.hash(input.password, 10),
        rol: "EMPLEADO",
        activo: true,
        empresaId: admin.empresaId,
      },
    });

    revalidatePath("/configuracion");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo crear el empleado." };
  }
}

export async function restablecerPasswordEmpleado(password: string): Promise<Resultado> {
  try {
    const admin = await requerirAdminPremium();
    if (!isPasswordValid(password)) {
      return { success: false, error: "La contraseña no cumple con los requisitos de seguridad." };
    }

    const { count } = await prisma.usuario.updateMany({
      where: { empresaId: admin.empresaId, rol: "EMPLEADO" },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    if (count === 0) return { success: false, error: "No hay un usuario empleado." };

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo cambiar la contraseña." };
  }
}

export async function eliminarEmpleado(): Promise<Resultado> {
  try {
    // Solo requerirAdmin (no Premium): si la empresa bajó a BASICO, el admin
    // tiene que poder borrar al empleado igual.
    const admin = await requerirAdmin();
    // Las ventas no guardan qué usuario las hizo, así que borrar el usuario
    // no afecta ningún dato. Su sesión se corta sola en el próximo request
    // (ver obtenerUsuarioActualOpcional).
    await prisma.usuario.deleteMany({ where: { empresaId: admin.empresaId, rol: "EMPLEADO" } });
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo eliminar el empleado." };
  }
}
