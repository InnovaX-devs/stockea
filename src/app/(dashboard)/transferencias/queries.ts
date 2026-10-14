import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import type { TransferenciaDTO } from "@/types/transferencia";

const INCLUIR = {
  origen: { select: { id: true, nombre: true } },
  destino: { select: { id: true, nombre: true } },
  usuarioEnvio: { select: { nombre: true } },
  usuarioRecepcion: { select: { nombre: true } },
  items: {
    orderBy: { id: "asc" },
    select: { id: true, cantidad: true, producto: { select: { id: true, nombre: true, marca: { select: { nombre: true } } } } },
  },
} satisfies Prisma.TransferenciaInclude;

type ConRelaciones = Prisma.TransferenciaGetPayload<{ include: typeof INCLUIR }>;

function aDTO(t: ConRelaciones, sucursalActualId: number | null): TransferenciaDTO {
  return {
    id: t.id,
    numero: t.numero,
    estado: t.estado,
    origen: t.origen,
    destino: t.destino,
    usuarioEnvio: t.usuarioEnvio.nombre,
    usuarioRecepcion: t.usuarioRecepcion?.nombre ?? null,
    fechaEnvio: t.fechaEnvio.toISOString(),
    fechaRecepcion: t.fechaRecepcion?.toISOString() ?? null,
    observaciones: t.observaciones,
    items: t.items.map((i) => ({
      id: i.id,
      productoId: i.producto.id,
      nombre: i.producto.nombre,
      marca: i.producto.marca?.nombre ?? null,
      cantidad: i.cantidad,
    })),
    puedeRecibir: t.estado === "ENVIADA" && sucursalActualId != null && t.destinoId === sucursalActualId,
  };
}

/**
 * Bandeja "Por recibir": transferencias enviadas que todavía no se confirmaron.
 * En una sucursal, las que vienen hacia ella; el admin en "Todas" ve las de
 * toda la empresa (solo consulta).
 */
export async function listarPorRecibir(): Promise<TransferenciaDTO[]> {
  const { empresaId } = await obtenerUsuarioActual();
  const { actual } = await obtenerContextoSucursal();
  const filas = await prisma.transferencia.findMany({
    where: { empresaId, estado: "ENVIADA", ...(actual ? { destinoId: actual.id } : {}) },
    orderBy: { fechaEnvio: "asc" },
    include: INCLUIR,
  });
  return filas.map((t) => aDTO(t, actual?.id ?? null));
}

export const TAMANO_HISTORIAL = 50;

/**
 * Historial: transferencias que salieron de la sucursal actual o llegaron a
 * ella; con "Todas", las de la empresa.
 */
export async function listarHistorial(pagina = 1): Promise<{ items: TransferenciaDTO[]; total: number; paginas: number; pagina: number }> {
  const { empresaId } = await obtenerUsuarioActual();
  const { actual } = await obtenerContextoSucursal();
  const where: Prisma.TransferenciaWhereInput = {
    empresaId,
    ...(actual ? { OR: [{ origenId: actual.id }, { destinoId: actual.id }] } : {}),
  };
  const total = await prisma.transferencia.count({ where });
  const paginas = Math.max(1, Math.ceil(total / TAMANO_HISTORIAL));
  const paginaSegura = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const filas = await prisma.transferencia.findMany({
    where,
    orderBy: [{ fechaEnvio: "desc" }, { id: "desc" }],
    skip: (paginaSegura - 1) * TAMANO_HISTORIAL,
    take: TAMANO_HISTORIAL,
    include: INCLUIR,
  });
  return { items: filas.map((t) => aDTO(t, actual?.id ?? null)), total, paginas, pagina: paginaSegura };
}