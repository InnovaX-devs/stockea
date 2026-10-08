import { prisma } from "@/lib/prisma";
import { calcularEstadoEfectivo, type EstadoPresupuesto } from "@/lib/presupuestos";
import { inicioDiaAR } from "@/lib/timezone";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

export type PresupuestoListado = {
  id: number;
  numero: number; // número visible de la empresa
  clienteNombre: string | null;
  total: number;
  fecha: Date;
  fechaVencimiento: Date;
  estado: EstadoPresupuesto;
};

export type FiltrosPresupuesto = {
  estado?: "TODOS" | EstadoPresupuesto;
  desde?: string; // ISO date
  hasta?: string; // ISO date
  clienteQuery?: string;
};

export async function obtenerPresupuestos(
  filtros: FiltrosPresupuesto
): Promise<PresupuestoListado[]> {
  const empresaId = await obtenerEmpresaIdActual();
  const where: Record<string, unknown> = { empresaId };

  if (filtros.desde || filtros.hasta) {
    where.fecha = {
      ...(filtros.desde
        ? { gte: inicioDiaAR(filtros.desde) }
        : {}),
      ...(filtros.hasta
        ? {
            lt: new Date(
              inicioDiaAR(filtros.hasta).getTime() +
                24 * 60 * 60 * 1000
            ),
          }
        : {}),
    };
  }

  if (filtros.clienteQuery?.trim()) {
    where.cliente = {
      nombre: { contains: filtros.clienteQuery.trim(), mode: "insensitive" },
    };
  }

  const presupuestos = await prisma.presupuesto.findMany({
    where,
    select: {
      id: true,
      numero: true,
      total: true,
      fecha: true,
      fechaVencimiento: true,
      estado: true,
      cliente: { select: { nombre: true, apellido: true } },
    },
    orderBy: { fecha: "desc" },
  });

  // Estado "VENCIDO" es calculado al vuelo, no se guarda en la base
  // (decisión: ver comentario en el issue — evita inconsistencia de cron).
  const conEstadoEfectivo: PresupuestoListado[] = presupuestos.map((p) => ({
    id: p.id,
    numero: p.numero,
    clienteNombre: p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido ?? ""}`.trim() : null,
    total: p.total,
    fecha: p.fecha,
    fechaVencimiento: p.fechaVencimiento,
    estado: calcularEstadoEfectivo(p.estado as EstadoPresupuesto, p.fechaVencimiento),
  }));

  if (!filtros.estado || filtros.estado === "TODOS") {
    return conEstadoEfectivo;
  }

  return conEstadoEfectivo.filter((p) => p.estado === filtros.estado);
}

export async function obtenerPresupuestoPorId(id: number) {
  const empresaId = await obtenerEmpresaIdActual();
  return prisma.presupuesto.findFirst({
    where: { id, empresaId },
    include: {
      cliente: { select: { id: true, nombre: true, apellido: true, esMayorista: true } },
      items: true,
    },
  });
}