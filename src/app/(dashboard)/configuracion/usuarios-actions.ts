"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { isPasswordValid } from "@/lib/password-validation";
import { listarSucursalesHabilitadas } from "@/lib/sucursal";

/**
 * Gestión de usuarios EMPLEADO (licencia PREMIUM). Hay como máximo un
 * empleado por sucursal: con un solo local es igual que antes (un empleado);
 * con varias sucursales, cada una tiene el suyo y solo ve y vende en esa.
 * Todo esto es solo del admin. Los permisos del empleado están en
 * src/lib/permisos.ts.
 */

type Resultado = { success: true } | { success: false; error: string };

export type UsuarioResumen = {
  id: number;
  nombre: string;
  email: string;
  rol: "ADMIN" | "EMPLEADO";
  sucursalId: number | null;
  sucursalNombre: string | null;
};

async function requerirAdminPremium() {
  const admin = await requerirAdmin();
  const config = await obtenerConfiguracion();
  if (config.licencia !== "PREMIUM") {
    throw new Error("El usuario empleado está disponible en el plan Premium.");
  }
  return admin;
}

/** Empleado de la empresa por id (nunca uno de otra empresa). */
async function buscarEmpleado(empresaId: number, usuarioId: number) {
  return prisma.usuario.findFirst({
    where: { id: usuarioId, empresaId, rol: "EMPLEADO" },
    select: { id: true },
  });
}

export async function listarUsuarios(): Promise<UsuarioResumen[]> {
  const admin = await requerirAdmin();
  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: admin.empresaId, activo: true },
    orderBy: [{ rol: "asc" }, { sucursalId: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, email: true, rol: true, sucursalId: true, sucursal: { select: { nombre: true } } },
  });
  return usuarios.map(({ sucursal, ...u }) => ({ ...u, sucursalNombre: sucursal?.nombre ?? null }));
}

export async function crearEmpleado(input: {
  nombre: string;
  email: string;
  password: string;
  /** Opcional con una sola sucursal (va a la principal); obligatorio con varias. */
  sucursalId?: number | null;
}): Promise<Resultado> {
  try {
    const admin = await requerirAdminPremium();
    const nombre = input.nombre.trim();
    const email = input.email.trim().toLowerCase();

    if (!nombre) return { success: false, error: "Ingresá el nombre del empleado." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "Ingresá un email válido." };
    if (!isPasswordValid(input.password)) {
      return { success: false, error: "La contraseña no cumple con los requisitos de seguridad." };
    }

    const sucursales = await listarSucursalesHabilitadas(admin.empresaId);
    const sucursal =
      sucursales.length === 1 && input.sucursalId == null
        ? sucursales[0]
        : sucursales.find((s) => s.id === input.sucursalId);
    if (!sucursal) return { success: false, error: "Elegí la sucursal del empleado." };

    // Un empleado por sucursal. Los empleados sin sucursal (de antes de las
    // sucursales) cuentan como de la principal.
    const esPrincipal = sucursal.id === sucursales[0]?.id;
    const yaHayEmpleado = await prisma.usuario.count({
      where: {
        empresaId: admin.empresaId,
        rol: "EMPLEADO",
        OR: esPrincipal ? [{ sucursalId: sucursal.id }, { sucursalId: null }] : [{ sucursalId: sucursal.id }],
      },
    });
    if (yaHayEmpleado > 0) {
      return {
        success: false,
        error:
          sucursales.length > 1
            ? `La sucursal ${sucursal.nombre} ya tiene un empleado. Eliminalo para crear otro.`
            : "Ya hay un usuario empleado. Eliminalo para crear otro.",
      };
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
        sucursalId: sucursal.id,
      },
    });

    revalidatePath("/configuracion", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo crear el empleado." };
  }
}

export async function restablecerPasswordEmpleado(usuarioId: number, password: string): Promise<Resultado> {
  try {
    const admin = await requerirAdminPremium();
    if (!isPasswordValid(password)) {
      return { success: false, error: "La contraseña no cumple con los requisitos de seguridad." };
    }

    const empleado = await buscarEmpleado(admin.empresaId, usuarioId);
    if (!empleado) return { success: false, error: "No se encontró el empleado." };

    await prisma.usuario.update({
      where: { id: empleado.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo cambiar la contraseña." };
  }
}

export async function eliminarEmpleado(usuarioId: number): Promise<Resultado> {
  try {
    // Solo requerirAdmin (no Premium): si la empresa bajó a BASICO, el admin
    // tiene que poder borrar al empleado igual.
    const admin = await requerirAdmin();
    const empleado = await buscarEmpleado(admin.empresaId, usuarioId);
    if (!empleado) return { success: false, error: "No se encontró el empleado." };

    // Las ventas no guardan qué usuario las hizo, así que borrar el usuario
    // no afecta ningún dato. Su sesión se corta sola en el próximo request
    // (ver obtenerUsuarioActualOpcional).
    await prisma.usuario.delete({ where: { id: empleado.id } });
    revalidatePath("/configuracion", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo eliminar el empleado." };
  }
}
