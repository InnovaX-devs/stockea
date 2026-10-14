"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { obtenerContextoSucursal, requerirSucursalId } from "@/lib/sucursal";
import { TransferenciaError, enviarTransferencia as enviar, recibirTransferencia as recibir } from "@/lib/transferencias";
import type { EnviarTransferenciaInput, ResultadoTransferencia } from "@/types/transferencia";

/**
 * Transferencias de stock entre sucursales (issue #36). La sucursal de origen
 * (al enviar) y la de destino (al recibir) son la sucursal en la que se está
 * trabajando, nunca algo que venga del navegador. Pueden enviar y recibir tanto
 * el admin (con una sucursal elegida) como el empleado de la sucursal.
 */

const MAX_OBSERVACIONES = 300;

function mensajeDeError(e: unknown, porDefecto: string) {
  if (e instanceof TransferenciaError) return e.message;
  // Mensajes ya pensados para el usuario que lanza src/lib/stock.ts.
  if (e instanceof Error && (e.message.startsWith("Stock insuficiente") || e.message.startsWith("Uno o más productos"))) {
    return e.message;
  }
  if (e instanceof Error && e.message.startsWith("Elegí una sucursal")) return e.message;
  console.error(porDefecto, e);
  return porDefecto;
}

export async function enviarTransferencia(
  input: EnviarTransferenciaInput
): Promise<ResultadoTransferencia<{ id: number; numero: number }>> {
  try {
    const usuario = await obtenerUsuarioActual();
    const contexto = await obtenerContextoSucursal();
    if (!contexto.multisucursal) {
      return { success: false, error: "Tu plan tiene una sola sucursal: no hay a dónde transferir." };
    }
    const origenId = await requerirSucursalId();

    const destino = contexto.sucursales.find((s) => s.id === Number(input?.destinoId));
    if (!destino) return { success: false, error: "Elegí la sucursal de destino." };
    if (destino.id === origenId) {
      return { success: false, error: "La sucursal de destino tiene que ser distinta a la de origen." };
    }

    const observaciones = typeof input.observaciones === "string" ? input.observaciones.trim().slice(0, MAX_OBSERVACIONES) || null : null;

    const creada = await prisma.$transaction((tx) =>
      enviar(tx, {
        empresaId: usuario.empresaId,
        origenId,
        destinoId: destino.id,
        usuarioId: usuario.id,
        observaciones,
        items: input.items,
      })
    );

    revalidatePath("/transferencias");
    revalidatePath("/productos");
    return { success: true, id: creada.id, numero: creada.numero };
  } catch (e) {
    return { success: false, error: mensajeDeError(e, "No se pudo enviar la transferencia.") };
  }
}

export async function recibirTransferencia(transferenciaId: number): Promise<ResultadoTransferencia> {
  try {
    const usuario = await obtenerUsuarioActual();
    if (!Number.isInteger(transferenciaId) || transferenciaId <= 0) {
      return { success: false, error: "La transferencia no existe." };
    }
    // Se recibe en la sucursal en la que se está: el admin en "Todas" tiene que elegir una.
    const destinoId = await requerirSucursalId();

    await prisma.$transaction((tx) =>
      recibir(tx, { empresaId: usuario.empresaId, destinoId, usuarioId: usuario.id, transferenciaId })
    );

    revalidatePath("/transferencias");
    revalidatePath("/productos");
    return { success: true };
  } catch (e) {
    return { success: false, error: mensajeDeError(e, "No se pudo confirmar la recepción.") };
  }
}