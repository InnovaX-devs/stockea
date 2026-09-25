"use server";

import { prisma } from "@/lib/prisma";
import type { TipoPrecioVenta } from "@prisma/client";
import { calcularFechaVencimiento, calcularTotalPresupuesto, calcularEstadoEfectivo } from "@/lib/presupuestos";
import type { ProductoBusqueda, ClienteBusqueda, ItemPresupuestoLocal } from "../../../types/presupuesto";
import type { ProductoBusquedaDTO } from "@/types/producto";
import type { ClienteBusquedaResult } from "@/lib/clientes-busqueda";
import { obtenerEmpresaIdActual, requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";

export async function buscarClientes(query: string): Promise<ClienteBusqueda[]> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  if (!query.trim()) return [];
  const empresaId = await obtenerEmpresaIdActual();
  return prisma.cliente.findMany({
    where: { empresaId, nombre: { contains: query, mode: "insensitive" } },
    select: { id: true, nombre: true, apellido: true, esMayorista: true },
    take: 10,
    orderBy: { nombre: "asc" },
  });
}

export type CrearPresupuestoInput = {
  clienteId: number | null;
  vigenciaDias: number;
  observaciones: string | null;
  descuentoMonto: number | null;
  descuentoPorcentaje: number | null;
  items: ItemPresupuestoLocal[];
};

export async function crearPresupuesto(
  input: CrearPresupuestoInput
): Promise<{ success: true; id: number } | { success: false; error: string }> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  if (input.items.length === 0) {
    return { success: false, error: "Agregá al menos un ítem al presupuesto." };
  }

  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarPresupuestos) {
    return { success: false, error: "Los presupuestos no están disponibles en tu plan actual." };
  }

  const empresaId = await obtenerEmpresaIdActual();

  if (input.clienteId != null) {
    const cliente = await prisma.cliente.findFirst({ where: { id: input.clienteId, empresaId } });
    if (!cliente) return { success: false, error: "El cliente seleccionado no existe." };
  }

  const productoIds = [
    ...new Set(input.items.map((i) => i.productoId).filter((id): id is number => id != null)),
  ];
  if (productoIds.length > 0) {
    const cantidadValida = await prisma.producto.count({
      where: { id: { in: productoIds }, empresaId },
    });
    if (cantidadValida !== productoIds.length) {
      return { success: false, error: "Uno o más productos del presupuesto no son válidos." };
    }
  }

  const fecha = new Date();
  const fechaVencimiento = calcularFechaVencimiento(fecha, input.vigenciaDias);
  const total = calcularTotalPresupuesto(
    input.items,
    input.descuentoMonto,
    input.descuentoPorcentaje
  );

  const presupuesto = await prisma.presupuesto.create({
    data: {
      empresaId,
      clienteId: input.clienteId,
      fecha,
      vigenciaDias: input.vigenciaDias,
      fechaVencimiento,
      observaciones: input.observaciones,
      descuentoMonto: input.descuentoMonto,
      descuentoPorcentaje: input.descuentoPorcentaje,
      total,
      estado: "BORRADOR",
      items: {
        create: input.items.map((item) => ({
          productoId: item.productoId,
          descripcion: item.descripcion,
          tipoPrecio: item.tipoPrecio,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
        })),
      },
    },
  });

  return { success: true, id: presupuesto.id };
}

// --- Conversión a Venta ---

type ItemPrefill = {
  id: string;
  producto: ProductoBusquedaDTO;
  tipoPrecio: TipoPrecioVenta;
  cantidad: number;
  precioUnitarioArs: number;
};

type ResultadoConversion =
  | {
      success: true;
      data: {
        presupuestoId: number;
        cliente: ClienteBusquedaResult | null;
        items: ItemPrefill[];
        descuentoMonto: number | null;
        descuentoPorcentaje: number | null;
      };
    }
  | { success: false; error: string };

export async function obtenerPresupuestoParaConvertir(id: number): Promise<ResultadoConversion> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  const empresaId = await obtenerEmpresaIdActual();
  const presupuesto = await prisma.presupuesto.findFirst({
    where: { id, empresaId },
    include: {
      items: true,
      cliente: {
        select: { id: true, nombre: true, apellido: true, telefono: true, esMayorista: true },
      },
    },
  });

  if (!presupuesto) {
    return { success: false, error: "El presupuesto no existe." };
  }

  const estadoEfectivo = calcularEstadoEfectivo(presupuesto.estado, presupuesto.fechaVencimiento);
  if (estadoEfectivo === "CONVERTIDO") {
    return { success: false, error: "Este presupuesto ya fue convertido a venta." };
  }
  if (estadoEfectivo === "VENCIDO") {
    return { success: false, error: "Este presupuesto venció, no se puede convertir." };
  }

  const itemSinProducto = presupuesto.items.find(
    (item: (typeof presupuesto.items)[number]) => item.productoId == null
  );
  if (itemSinProducto) {
    return {
      success: false,
      error: `El ítem "${itemSinProducto.descripcion}" no tiene un producto de catálogo asociado y todavía no se puede convertir a venta.`,
    };
  }

  const productoIds = presupuesto.items.map((item) => item.productoId as number);
    const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds }, empresaId },
    select: {
      id: true,
      nombre: true,
      codigoBarras: true,
      stockActual: true,
      monedaPrecio: true,
      precioCosto: true,
      precioVenta: true,
      precioMayorista: true,
      contenidoMl: true,
      marca: { select: { nombre: true } },
    },
  });

  const productoPorId = new Map<number, (typeof productos)[number]>(
    productos.map((p) => [p.id, p])
  );

  const items: ItemPrefill[] = [];
  for (const item of presupuesto.items) {
    const producto = productoPorId.get(item.productoId as number);
    if (!producto) {
      return {
        success: false,
        error: `El producto "${item.descripcion}" ya no existe en el catálogo.`,
      };
    }
    items.push({
      id: `${producto.id}-${Date.now()}-${item.id}`,
      producto,
      tipoPrecio: item.tipoPrecio,
      cantidad: item.cantidad,
      precioUnitarioArs: item.precioUnitario,
    });
  }

  return {
    success: true,
    data: {
      presupuestoId: presupuesto.id,
      cliente: presupuesto.cliente,
      items,
      descuentoMonto: presupuesto.descuentoMonto,
      descuentoPorcentaje: presupuesto.descuentoPorcentaje,
    },
  };
}

// --- Detalle para el modal ("Ver") ---

export type DetalleItemPresupuesto = {
  id: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  tipoPrecio: TipoPrecioVenta;
};

export type DetallePresupuesto = {
  id: number;
  estado: "BORRADOR" | "VENCIDO" | "CONVERTIDO";
  puedeConvertir: boolean;
  fecha: Date;
  fechaVencimiento: Date;
  vigenciaDias: number;
  observaciones: string | null;
  clienteNombre: string | null;
  items: DetalleItemPresupuesto[];
  total: number;
};

type ResultadoDetalle =
  | { success: true; data: DetallePresupuesto }
  | { success: false; error: string };

export async function obtenerDetallePresupuesto(id: number): Promise<ResultadoDetalle> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  const empresaId = await obtenerEmpresaIdActual();
  const presupuesto = await prisma.presupuesto.findFirst({
    where: { id, empresaId },
    include: {
      cliente: { select: { nombre: true, apellido: true } },
      items: true,
    },
  });

  if (!presupuesto) {
    return { success: false, error: "El presupuesto no existe." };
  }

  const estado = calcularEstadoEfectivo(presupuesto.estado, presupuesto.fechaVencimiento);

  return {
    success: true,
    data: {
      id: presupuesto.id,
      estado,
      puedeConvertir: estado === "BORRADOR",
      fecha: presupuesto.fecha,
      fechaVencimiento: presupuesto.fechaVencimiento,
      vigenciaDias: presupuesto.vigenciaDias,
      observaciones: presupuesto.observaciones,
      clienteNombre: presupuesto.cliente
        ? `${presupuesto.cliente.nombre} ${presupuesto.cliente.apellido ?? ""}`.trim()
        : null,
      items: presupuesto.items.map((item) => ({
        id: item.id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.cantidad * item.precioUnitario,
        tipoPrecio: item.tipoPrecio,
      })),
      total: presupuesto.total,
    },
  };
}