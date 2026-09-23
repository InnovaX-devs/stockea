// (dashboard)/reportes/queries.ts
import { prisma } from "@/lib/prisma";
import {
  calcularReporte,
  calcularIngresosPorDia,
  calcularTopProductos,
  calcularTopClientes,
  claveFecha,
  costoHistoricoDelProducto,
  enriquecerVentas,
  type VentaParaReporte,
} from "@/lib/reportes";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import type { ReporteData } from "@/types/reporte";

export type RangoFechas = { desde: Date; hasta: Date };

const ESTADOS_EXCLUIDOS = ["ANULADA", "CANCELADA"] as const;

export async function obtenerReporte(rango: RangoFechas): Promise<ReporteData> {
  const empresaId = await obtenerEmpresaIdActual();
  const { desde, hasta } = rango;

  const [ventasRaw, config] = await Promise.all([
    prisma.venta.findMany({
      where: {
        empresaId,
        fecha: { gte: desde, lt: hasta },
        estadoPago: { notIn: [...ESTADOS_EXCLUIDOS] },
      },
      select: {
        id: true,
        totalARS: true,
        totalUSD: true,
        montoPagado: true,
        cotizacionUsada: true,
        fecha: true,
        cliente: { select: { id: true, nombre: true, apellido: true } },
        items: {
          select: {
            productoId: true,
            cantidad: true,
            precioUnitarioUSD: true,
            tipoPrecio: true,
            producto: {
              select: { id: true, nombre: true, fotoUrl: true, precioCosto: true, monedaPrecio: true },
            },
          },
        },
        pagos: {
          select: { monto: true, montoARS: true, cuenta: { select: { id: true, nombre: true, tipo: true } } },
        },
      },
    }),
    prisma.configuracion.findUnique({ where: { empresaId } }),
  ]);

  const cotizacionActual = config?.cotizacionUSD ?? 1000;

  const productoIds = Array.from(
    new Set(ventasRaw.flatMap((v) => v.items.map((i) => i.productoId).filter((id): id is number => id != null)))
  );

  // historial y movimientosEgreso son independientes entre sí -> en paralelo.
  const [historial, movimientosEgreso] = await Promise.all([
    productoIds.length
      ? prisma.historialPrecio.findMany({
          where: { productoId: { in: productoIds }, campo: "COSTO", empresaId },
          orderBy: { fecha: "asc" },
          select: { productoId: true, valorNuevo: true, fecha: true },
        })
      : Promise.resolve([]),
    prisma.movimientoCaja.findMany({
      where: { empresaId, tipo: "EGRESO", concepto: "GASTO", fecha: { gte: desde, lt: hasta } },
      select: { monto: true, fecha: true, cuenta: { select: { tipo: true } } },
    }),
  ]);

  const historialPorProducto = new Map<number, { valorNuevo: number; fecha: Date }[]>();
  for (const h of historial) {
    const lista = historialPorProducto.get(h.productoId) ?? [];
    lista.push({ valorNuevo: h.valorNuevo, fecha: h.fecha });
    historialPorProducto.set(h.productoId, lista);
  }

  const ventas: VentaParaReporte[] = ventasRaw.map((v) => ({
    id: v.id,
    fecha: v.fecha,
    totalARS: v.totalARS,
    totalUSD: v.totalUSD,
    montoPagado: v.montoPagado,
    cotizacionUsada: v.cotizacionUsada,
    clienteId: v.cliente?.id ?? null,
    clienteNombre: v.cliente ? `${v.cliente.nombre} ${v.cliente.apellido ?? ""}`.trim() : null,
    items: v.items.map((item) => {
      let costoUnitarioARS = 0;

      if (item.producto) {
        const costoBase = costoHistoricoDelProducto(
          historialPorProducto.get(item.producto.id),
          item.producto.precioCosto,
          v.fecha
        );
        costoUnitarioARS =
          item.producto.monedaPrecio === "USD" ? costoBase * v.cotizacionUsada : costoBase;
      }

      return {
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitarioUSD: item.precioUnitarioUSD,
        tipoPrecio: item.tipoPrecio,
        nombreProducto: item.producto?.nombre ?? null,
        fotoUrl: item.producto?.fotoUrl ?? null,
        costoUnitarioARS,
      };
    }),
    pagos: v.pagos.map((p) => ({
      cuentaId: p.cuenta.id,
      cuentaNombre: p.cuenta.nombre,
      tipoCuenta: p.cuenta.tipo,
      monto: p.monto,
      montoARS: p.montoARS,
    })),
  }));

  let egresosGastosARS = 0;
  const egresosGastosPorDiaARS = new Map<string, number>();
  for (const m of movimientosEgreso) {
    const esUSD = m.cuenta.tipo === "EFECTIVO_USD" || m.cuenta.tipo === "BANCO_USD";
    const montoARS = esUSD ? m.monto * cotizacionActual : m.monto;
    egresosGastosARS += montoARS;
    const clave = claveFecha(m.fecha);
    egresosGastosPorDiaARS.set(clave, (egresosGastosPorDiaARS.get(clave) ?? 0) + montoARS);
  }

  // Se calcula UNA sola vez y se reusa en las 3 funciones de abajo.
  const ventasEnriquecidas = enriquecerVentas(ventas);

  const { kpis, desgloseTipoPrecio, desgloseMetodoCobro } = calcularReporte(ventasEnriquecidas, egresosGastosARS);
  const ingresosPorDia = calcularIngresosPorDia(ventasEnriquecidas, egresosGastosPorDiaARS, desde, hasta);
  const topProductos = calcularTopProductos(ventasEnriquecidas);
  const topClientes = calcularTopClientes(ventasEnriquecidas);

  return {
    fechaInicio: desde.toISOString(),
    fechaFin: hasta.toISOString(),
    kpis,
    desgloseTipoPrecio,
    desgloseMetodoCobro,
    ingresosPorDia,
    topProductos,
    topClientes,
  };
}

// Versión liviana para el dashboard: mismos datos de venta que obtenerReporte,
// pero sin calcular ingresosPorDia ni topProductos (no se usan ahí).
export async function obtenerKpisDelDia(rango: RangoFechas): Promise<{ gananciaNetaARS: number; cantidadVentas: number }> {
  const empresaId = await obtenerEmpresaIdActual();
  const { desde, hasta } = rango;

  const [ventasRaw, config] = await Promise.all([
    prisma.venta.findMany({
      where: {
        empresaId,
        fecha: { gte: desde, lt: hasta },
        estadoPago: { notIn: [...ESTADOS_EXCLUIDOS] },
      },
      select: {
        id: true,
        totalARS: true,
        totalUSD: true,
        montoPagado: true,
        cotizacionUsada: true,
        fecha: true,
        items: {
          select: {
            productoId: true,
            cantidad: true,
            precioUnitarioUSD: true,
            tipoPrecio: true,
            producto: {
              select: { id: true, precioCosto: true, monedaPrecio: true },
            },
          },
        },
        pagos: {
          select: { monto: true, montoARS: true, cuenta: { select: { id: true, nombre: true, tipo: true } } },
        },
      },
    }),
    prisma.configuracion.findUnique({ where: { empresaId } }),
  ]);

  const cotizacionActual = config?.cotizacionUSD ?? 1000;

  const productoIds = Array.from(
    new Set(ventasRaw.flatMap((v) => v.items.map((i) => i.productoId).filter((id): id is number => id != null)))
  );

  const [historial, movimientosEgreso] = await Promise.all([
    productoIds.length
      ? prisma.historialPrecio.findMany({
          where: { productoId: { in: productoIds }, campo: "COSTO", empresaId },
          orderBy: { fecha: "asc" },
          select: { productoId: true, valorNuevo: true, fecha: true },
        })
      : Promise.resolve([]),
    prisma.movimientoCaja.findMany({
      where: { empresaId, tipo: "EGRESO", concepto: "GASTO", fecha: { gte: desde, lt: hasta } },
      select: { monto: true, cuenta: { select: { tipo: true } } },
    }),
  ]);

  const historialPorProducto = new Map<number, { valorNuevo: number; fecha: Date }[]>();
  for (const h of historial) {
    const lista = historialPorProducto.get(h.productoId) ?? [];
    lista.push({ valorNuevo: h.valorNuevo, fecha: h.fecha });
    historialPorProducto.set(h.productoId, lista);
  }

  const ventas: VentaParaReporte[] = ventasRaw.map((v) => ({
    id: v.id,
    fecha: v.fecha,
    totalARS: v.totalARS,
    totalUSD: v.totalUSD,
    montoPagado: v.montoPagado,
    cotizacionUsada: v.cotizacionUsada,
    clienteId: null,
    clienteNombre: null,
    items: v.items.map((item) => {
      let costoUnitarioARS = 0;
      if (item.producto) {
        const costoBase = costoHistoricoDelProducto(
          historialPorProducto.get(item.producto.id),
          item.producto.precioCosto,
          v.fecha
        );
        costoUnitarioARS =
          item.producto.monedaPrecio === "USD" ? costoBase * v.cotizacionUsada : costoBase;
      }
      return {
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitarioUSD: item.precioUnitarioUSD,
        tipoPrecio: item.tipoPrecio,
        nombreProducto: null,
        fotoUrl: null,
        costoUnitarioARS,
      };
    }),
    pagos: v.pagos.map((p) => ({
      cuentaId: p.cuenta.id,
      cuentaNombre: p.cuenta.nombre,
      tipoCuenta: p.cuenta.tipo,
      monto: p.monto,
      montoARS: p.montoARS,
    })),
  }));

  let egresosGastosARS = 0;
  for (const m of movimientosEgreso) {
    const esUSD = m.cuenta.tipo === "EFECTIVO_USD" || m.cuenta.tipo === "BANCO_USD";
    egresosGastosARS += esUSD ? m.monto * cotizacionActual : m.monto;
  }

  const ventasEnriquecidas = enriquecerVentas(ventas);
  const { kpis } = calcularReporte(ventasEnriquecidas, egresosGastosARS);
  return { gananciaNetaARS: kpis.gananciaNetaARS, cantidadVentas: kpis.cantidadVentas };
}