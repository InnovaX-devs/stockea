"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirDesarrollador } from "@/lib/desarrollador";
import { isPasswordValid } from "@/lib/password-validation";

/**
 * Panel de InnovaX: alta y mantenimiento de empresas, sucursales y usuarios
 * de todos los clientes. Reemplaza a scripts/crear-empresa.ts,
 * scripts/crear-sucursal.ts y prisma/scripts/reset-password.ts.
 *
 * OJO: estas acciones NO filtran por empresaId (trabajan sobre cualquier
 * empresa). Por eso TODAS empiezan con requerirDesarrollador().
 */

type Resultado<T = undefined> = ({ success: true } & (T extends undefined ? object : { data: T })) | { success: false; error: string };

const ok = { success: true as const };
const error = (e: unknown, porDefecto: string) => ({
  success: false as const,
  error: e instanceof Error ? e.message : porDefecto,
});
const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function refrescar(empresaId?: number) {
  revalidatePath("/innovax");
  if (empresaId) revalidatePath(`/innovax/empresas/${empresaId}`);
}

// ---------------------------------------------------------------- Lecturas

export type EmpresaFila = {
  id: number;
  nombre: string;
  activa: boolean;
  createdAt: string;
  licencia: "BASICO" | "PREMIUM";
  sucursales: number;
  usuarios: number;
  adminEmail: string | null;
};

export async function listarEmpresas(): Promise<EmpresaFila[]> {
  await requerirDesarrollador();
  const empresas = await prisma.empresa.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      nombre: true,
      activa: true,
      createdAt: true,
      configuracion: { select: { licencia: true } },
      sucursales: { where: { activa: true }, select: { id: true } },
      usuarios: { where: { activo: true }, orderBy: { id: "asc" }, select: { email: true, rol: true } },
    },
  });
  return empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    activa: e.activa,
    createdAt: e.createdAt.toISOString(),
    licencia: e.configuracion?.licencia ?? "BASICO",
    sucursales: e.sucursales.length,
    usuarios: e.usuarios.length,
    adminEmail: e.usuarios.find((u) => u.rol === "ADMIN")?.email ?? null,
  }));
}

export type EmpresaDetalle = {
  id: number;
  nombre: string;
  activa: boolean;
  createdAt: string;
  licencia: "BASICO" | "PREMIUM";
  esLaMia: boolean;
  sucursales: { id: number; nombre: string; direccion: string | null; activa: boolean; empleados: number }[];
  usuarios: {
    id: number;
    nombre: string;
    email: string;
    rol: "ADMIN" | "EMPLEADO";
    activo: boolean;
    sucursalNombre: string | null;
    esDesarrollador: boolean;
  }[];
};

export async function obtenerEmpresa(empresaId: number): Promise<EmpresaDetalle | null> {
  const yo = await requerirDesarrollador();
  const e = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      nombre: true,
      activa: true,
      createdAt: true,
      configuracion: { select: { licencia: true } },
      sucursales: {
        orderBy: { id: "asc" },
        select: { id: true, nombre: true, direccion: true, activa: true, usuarios: { where: { rol: "EMPLEADO" }, select: { id: true } } },
      },
      usuarios: {
        orderBy: [{ rol: "asc" }, { id: "asc" }],
        select: { id: true, nombre: true, email: true, rol: true, activo: true, esDesarrollador: true, sucursal: { select: { nombre: true } } },
      },
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    nombre: e.nombre,
    activa: e.activa,
    createdAt: e.createdAt.toISOString(),
    licencia: e.configuracion?.licencia ?? "BASICO",
    esLaMia: e.id === yo.empresaId,
    sucursales: e.sucursales.map((s) => ({ id: s.id, nombre: s.nombre, direccion: s.direccion, activa: s.activa, empleados: s.usuarios.length })),
    usuarios: e.usuarios.map(({ sucursal, ...u }) => ({ ...u, sucursalNombre: sucursal?.nombre ?? null })),
  };
}

// ---------------------------------------------------------------- Empresas

export async function crearEmpresa(input: {
  nombreNegocio: string;
  adminNombre?: string;
  adminEmail: string;
  adminPassword: string;
  licencia: "BASICO" | "PREMIUM";
  cotizacionUSD?: number;
}): Promise<Resultado<{ empresaId: number }>> {
  try {
    await requerirDesarrollador();
    const nombreNegocio = input.nombreNegocio.trim();
    const email = input.adminEmail.trim().toLowerCase();
    const licencia = input.licencia === "PREMIUM" ? "PREMIUM" : "BASICO";
    const cotizacionUSD = input.cotizacionUSD && input.cotizacionUSD > 0 ? input.cotizacionUSD : 1000;

    if (!nombreNegocio) throw new Error("Ingresá el nombre del negocio.");
    if (!emailValido(email)) throw new Error("Ingresá un email válido para el admin.");
    if (!isPasswordValid(input.adminPassword)) throw new Error("La contraseña del admin no cumple con los requisitos de seguridad.");
    if (await prisma.usuario.findUnique({ where: { email } })) throw new Error(`Ya existe un usuario con el email ${email}.`);

    const passwordHash = await bcrypt.hash(input.adminPassword, 10);
    const empresa = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nombre: nombreNegocio } });
      await tx.configuracion.create({ data: { empresaId: empresa.id, nombreNegocio, cotizacionUSD, licencia } });
      await tx.sucursal.create({ data: { empresaId: empresa.id, nombre: "Principal" } });
      await tx.usuario.create({
        data: {
          nombre: input.adminNombre?.trim() || "Administrador",
          email,
          passwordHash,
          rol: "ADMIN",
          activo: true,
          empresaId: empresa.id,
        },
      });
      return empresa;
    });

    refrescar();
    return { success: true, data: { empresaId: empresa.id } };
  } catch (e) {
    return error(e, "No se pudo crear la empresa.");
  }
}

export async function cambiarLicencia(empresaId: number, licencia: "BASICO" | "PREMIUM"): Promise<Resultado> {
  try {
    await requerirDesarrollador();
    const valor = licencia === "PREMIUM" ? "PREMIUM" : "BASICO";
    const actualizada = await prisma.configuracion.updateMany({ where: { empresaId }, data: { licencia: valor } });
    if (actualizada.count === 0) throw new Error("La empresa no tiene configuración.");
    refrescar(empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo cambiar la licencia.");
  }
}

export async function cambiarEstadoEmpresa(empresaId: number, activa: boolean): Promise<Resultado> {
  try {
    const yo = await requerirDesarrollador();
    if (!activa && empresaId === yo.empresaId) throw new Error("No podés suspender tu propia empresa (te quedarías afuera).");
    await prisma.empresa.update({ where: { id: empresaId }, data: { activa } });
    refrescar(empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo cambiar el estado de la empresa.");
  }
}

// ---------------------------------------------------------------- Sucursales

async function licenciaDe(empresaId: number) {
  const config = await prisma.configuracion.findUnique({ where: { empresaId }, select: { licencia: true } });
  return config?.licencia ?? "BASICO";
}

export async function crearSucursal(empresaId: number, input: { nombre: string; direccion?: string }): Promise<Resultado> {
  try {
    await requerirDesarrollador();
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error("Ingresá el nombre de la sucursal.");
    const activas = await prisma.sucursal.count({ where: { empresaId, activa: true } });
    if ((await licenciaDe(empresaId)) !== "PREMIUM" && activas >= 1) {
      throw new Error("Con licencia Básico la empresa puede tener una sola sucursal. Pasala a Premium primero.");
    }
    if (await prisma.sucursal.findFirst({ where: { empresaId, nombre } })) throw new Error(`Ya existe una sucursal "${nombre}".`);
    await prisma.sucursal.create({ data: { empresaId, nombre, direccion: input.direccion?.trim() || null } });
    refrescar(empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo crear la sucursal.");
  }
}

export async function actualizarSucursal(sucursalId: number, input: { nombre: string; direccion?: string }): Promise<Resultado> {
  try {
    await requerirDesarrollador();
    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal) throw new Error("La sucursal no existe.");
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error("Ingresá el nombre de la sucursal.");
    const repetida = await prisma.sucursal.findFirst({ where: { empresaId: sucursal.empresaId, nombre, id: { not: sucursalId } } });
    if (repetida) throw new Error(`Ya existe una sucursal "${nombre}".`);
    await prisma.sucursal.update({ where: { id: sucursalId }, data: { nombre, direccion: input.direccion?.trim() || null } });
    refrescar(sucursal.empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo actualizar la sucursal.");
  }
}

export async function cambiarEstadoSucursal(sucursalId: number, activa: boolean): Promise<Resultado> {
  try {
    await requerirDesarrollador();
    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal) throw new Error("La sucursal no existe.");
    const otrasActivas = await prisma.sucursal.count({ where: { empresaId: sucursal.empresaId, activa: true, id: { not: sucursalId } } });
    if (!activa && otrasActivas === 0) throw new Error("Es la única sucursal activa: la empresa tiene que tener al menos una.");
    if (activa && otrasActivas >= 1 && (await licenciaDe(sucursal.empresaId)) !== "PREMIUM") {
      throw new Error("Con licencia Básico la empresa puede tener una sola sucursal activa.");
    }
    await prisma.sucursal.update({ where: { id: sucursalId }, data: { activa } });
    refrescar(sucursal.empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo cambiar el estado de la sucursal.");
  }
}

// ---------------------------------------------------------------- Usuarios

/** Otro usuario administrador para una empresa (por ejemplo, el socio del dueño, o un desarrollador en InnovaX). */
export async function crearAdmin(empresaId: number, input: { nombre: string; email: string; password: string }): Promise<Resultado> {
  try {
    await requerirDesarrollador();
    const nombre = input.nombre.trim();
    const email = input.email.trim().toLowerCase();
    if (!nombre) throw new Error("Ingresá el nombre.");
    if (!emailValido(email)) throw new Error("Ingresá un email válido.");
    if (!isPasswordValid(input.password)) throw new Error("La contraseña no cumple con los requisitos de seguridad.");
    if (!(await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } }))) throw new Error("La empresa no existe.");
    if (await prisma.usuario.findUnique({ where: { email } })) throw new Error(`Ya existe un usuario con el email ${email}.`);
    await prisma.usuario.create({
      data: { nombre, email, passwordHash: await bcrypt.hash(input.password, 10), rol: "ADMIN", activo: true, empresaId },
    });
    refrescar(empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo crear el usuario.");
  }
}

export async function restablecerPassword(usuarioId: number, password: string): Promise<Resultado> {
  try {
    await requerirDesarrollador();
    if (!isPasswordValid(password)) throw new Error("La contraseña no cumple con los requisitos de seguridad.");
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { empresaId: true } });
    if (!usuario) throw new Error("El usuario no existe.");
    await prisma.usuario.update({ where: { id: usuarioId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    refrescar(usuario.empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo cambiar la contraseña.");
  }
}

export async function cambiarEstadoUsuario(usuarioId: number, activo: boolean): Promise<Resultado> {
  try {
    const yo = await requerirDesarrollador();
    if (!activo && usuarioId === yo.id) throw new Error("No podés desactivar tu propio usuario.");
    const usuario = await prisma.usuario.update({ where: { id: usuarioId }, data: { activo }, select: { empresaId: true } });
    refrescar(usuario.empresaId);
    return ok;
  } catch (e) {
    return error(e, "No se pudo cambiar el estado del usuario.");
  }
}
