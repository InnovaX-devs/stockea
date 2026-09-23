// lib/reportes.ts
import type { TipoCuenta } from "@prisma/client";
import type {
  DesgloseMetodoCobroItem,
  DesgloseTipoPrecioItem,
  IngresoPorDia,
  ReporteKPIs,
  TopProductoItem,
} from "@/types/reporte";

import {
  fechaISOAR,
  inicioDiaAR,
  inicioFinHoyAR,
  siguienteDiaAR,
} from "@/lib/timezone";
import { montoARSDePago } from "@/lib/currency";

export type ItemVentaParaReporte = {
  productoId: number | null;
  cantidad: number;
  precioUnitarioUSD: number;
  tipoPrecio: "MINORISTA" | "MAYORISTA";
  costoUnitarioARS: number;
  nombreProducto: string | null;
  fotoUrl: string | null;
};

export type VentaParaReporte = {
  id: number;
  fecha: Date;
  totalARS: number;
  totalUSD: number;
  montoPagado: number;
  cotizacionUsada: number;
  clienteId: number | null;
  clienteNombre: string | null;
  items: ItemVentaParaReporte[];
  pagos: PagoParaReporte[];
};

export type TopClienteItem = {
  clienteId: number;
  nombre: string;
  cantidadVentas: number;
  montoARS: number;
};

export type PagoParaReporte = {
  cuentaId: number;
  cuentaNombre: string;
  tipoCuenta: TipoCuenta;
  monto: number; // en la moneda de la cuenta
  montoARS?: number | null;
};

export type ReporteCalculado = {
  kpis: ReporteKPIs;
  desgloseTipoPrecio: DesgloseTipoPrecioItem[];
  desgloseMetodoCobro: DesgloseMetodoCobroItem[];
};

// Venta ya con proporcionCobrada/factorDescuento calculados una sola vez,
// para no recalcularlos en cada una de las 3 funciones que recorren ventas.
export type VentaEnriquecida = VentaParaReporte & {
  proporcionCobrada: number;
  factorDescuento: number;
};

/**
 * Busca en el historial (entradas de HistorialPrecio campo COSTO, ordenadas
 * ascendente por fecha) el costo vigente en la fecha de la venta. ItemVenta no
 * guarda un costo "congelado" al momento de vender, así que esto es la mejor
 * aproximación posible con el schema actual. Si no hay historial previo a esa
 * fecha, cae al costo actual del producto.
 */
export function costoHistoricoDelProducto(
  historial: { valorNuevo: number; fecha: Date }[] | undefined,
  costoActual: number,
  fechaVenta: Date
): number {
  if (!historial || historial.length === 0) return costoActual;
  if (historial[0].fecha > fechaVenta) return costoActual;
  let costo = historial[0].valorNuevo;
  for (const entrada of historial) {
    if (entrada.fecha > fechaVenta) break;
    costo = entrada.valorNuevo;
  }
  return costo;
}

/**
 * Calcula proporcionCobrada y factorDescuento una sola vez por venta.
 * Llamar UNA vez en queries.ts y pasar el resultado a calcularReporte,
 * calcularIngresosPorDia y calcularTopProductos (antes cada una lo
 * recalculaba por su cuenta sobre el mismo array de ventas).
 */
export function enriquecerVentas(ventas: VentaParaReporte[]): VentaEnriquecida[] {
  return ventas.map((venta) => {
    const proporcionCobrada = venta.totalARS > 0 ? Math.min(venta.montoPagado / venta.totalARS, 1) : 0;
    const montoListaVentaARS = venta.items.reduce(
      (acc, item) => acc + item.cantidad * item.precioUnitarioUSD * venta.cotizacionUsada,
      0
    );
    const factorDescuento = montoListaVentaARS > 0 ? venta.totalARS / montoListaVentaARS : 1;
    return { ...venta, proporcionCobrada, factorDescuento };
  });
}

/**
 * egresosGastosARS: SOLO movimientos de caja con concepto GASTO. No incluye
 * pagos a proveedores (eso es conversión de efectivo en stock, no una pérdida
 * del período) — esos se reflejan aparte en calcularFlujoCaja.
 */
export function calcularReporte(ventas: VentaEnriquecida[], egresosGastosARS: number): ReporteCalculado {
  let ingresosARS = 0; // cobrado
  let ingresosFacturadosARS = 0; // facturado (informativo)
  let ingresosUSD = 0;
  let costoVentaARS = 0;
  let itemsVendidos = 0;

  const totalesTipoPrecio: Record<"MINORISTA" | "MAYORISTA", { montoARS: number; ventas: Set<number> }> = {
    MINORISTA: { montoARS: 0, ventas: new Set() },
    MAYORISTA: { montoARS: 0, ventas: new Set() },
  };

  const totalesPorCuenta = new Map<
    number,
    { cuentaNombre: string; tipoCuenta: TipoCuenta; montoARS: number; ventas: Set<number> }
  >();

  for (const venta of ventas) {
    ingresosFacturadosARS += venta.totalARS;
    ingresosARS += venta.montoPagado;
    ingresosUSD += venta.totalUSD;

    const { proporcionCobrada, factorDescuento } = venta;

    for (const item of venta.items) {
      itemsVendidos += item.cantidad;

      const montoListaItemARS = item.cantidad * item.precioUnitarioUSD * venta.cotizacionUsada;
      const montoItemConDescuentoARS = montoListaItemARS * factorDescuento;

      const grupo = totalesTipoPrecio[item.tipoPrecio];
      grupo.montoARS += montoItemConDescuentoARS * proporcionCobrada;
      grupo.ventas.add(venta.id);

      costoVentaARS += item.costoUnitarioARS * item.cantidad * proporcionCobrada;
    }

    for (const pago of venta.pagos) {
      const actual = totalesPorCuenta.get(pago.cuentaId) ?? {
        cuentaNombre: pago.cuentaNombre,
        tipoCuenta: pago.tipoCuenta,
        montoARS: 0,
        ventas: new Set<number>(),
      };
      // En cuentas USD `monto` son dólares: hay que pasarlo a pesos.
      actual.montoARS += montoARSDePago(pago, pago.tipoCuenta, venta.cotizacionUsada);
      actual.ventas.add(venta.id);
      totalesPorCuenta.set(pago.cuentaId, actual);
    }
  }

  const gananciaNetaARS = ingresosARS - costoVentaARS - egresosGastosARS;
  const margenPorcentaje = ingresosARS > 0 ? (gananciaNetaARS / ingresosARS) * 100 : 0;

  const totalTipoPrecio = totalesTipoPrecio.MINORISTA.montoARS + totalesTipoPrecio.MAYORISTA.montoARS;
  const desgloseTipoPrecio: DesgloseTipoPrecioItem[] = (["MINORISTA", "MAYORISTA"] as const).map((tipo) => ({
    tipoPrecio: tipo,
    montoARS: totalesTipoPrecio[tipo].montoARS,
    cantidadVentas: totalesTipoPrecio[tipo].ventas.size,
    porcentaje: totalTipoPrecio > 0 ? (totalesTipoPrecio[tipo].montoARS / totalTipoPrecio) * 100 : 0,
  }));

  const totalCobros = Array.from(totalesPorCuenta.values()).reduce((a, c) => a + c.montoARS, 0);
  const desgloseMetodoCobro: DesgloseMetodoCobroItem[] = Array.from(totalesPorCuenta.entries())
    .map(([cuentaId, c]) => ({
      cuentaId,
      cuentaNombre: c.cuentaNombre,
      tipoCuenta: c.tipoCuenta,
      montoARS: c.montoARS,
      cantidadVentas: c.ventas.size,
      porcentaje: totalCobros > 0 ? (c.montoARS / totalCobros) * 100 : 0,
    }))
    .sort((a, b) => b.montoARS - a.montoARS);

  return {
    kpis: {
      ingresosARS,
      ingresosFacturadosARS,
      ingresosUSD,
      costoVentaARS,
      gananciaNetaARS,
      margenPorcentaje,
      egresosARS: egresosGastosARS,
      cantidadVentas: ventas.length,
      itemsVendidos,
    },
    desgloseTipoPrecio,
    desgloseMetodoCobro,
  };
}

export type TabReporte = "diario" | "semanal" | "mensual" | "periodo" | "cuenta";

function fechaASumaDias(fecha: string, dias: number): string {
  const date = new Date(`${fecha}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}

function inicioDelDiaAR(d: Date): Date {
  return inicioDiaAR(fechaISOAR(d));
}

function finDelDiaAR(d: Date): Date {
  const fecha = fechaISOAR(d);
  const siguiente = siguienteDiaAR(fecha);
  return inicioDiaAR(siguiente);
}

function inicioDeSemanaAR(d: Date): Date {
  const fecha = fechaISOAR(d);
  const auxiliar = new Date(`${fecha}T00:00:00Z`);
  const dia = auxiliar.getUTCDay();
  const diff = dia === 0 ? 6 : dia - 1;
  const lunes = fechaASumaDias(fecha, -diff);
  return inicioDiaAR(lunes);
}

function inicioDeMesAR(d: Date): Date {
  const fecha = fechaISOAR(d);
  const [anio, mes] = fecha.split("-");
  return inicioDiaAR(`${anio}-${mes}-01`);
}

function parseFechaLocal(fechaStr: string): Date {
  const [anio, mes, dia] = fechaStr.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

export function rangoParaTab(
  tab: TabReporte,
  desdeParam?: string,
  hastaParam?: string
): { desde: Date; hasta: Date } {
  const ahora = new Date();

  switch (tab) {
    case "diario": {
      const { inicio, fin } = inicioFinHoyAR();
      return { desde: inicio, hasta: fin };
    }
    case "semanal": {
      const desde = inicioDeSemanaAR(ahora);
      const { fin: hasta } = inicioFinHoyAR();
      return { desde, hasta };
    }
    case "mensual": {
      const desde = inicioDeMesAR(ahora);
      const { fin: hasta } = inicioFinHoyAR();
      return { desde, hasta };
    }
    case "periodo":
    case "cuenta":
    default: {
      const fechaDesde = desdeParam ?? fechaISOAR(ahora);
      const fechaHasta = hastaParam ?? fechaISOAR(ahora);
      return {
        desde: inicioDiaAR(fechaDesde),
        hasta: inicioDiaAR(siguienteDiaAR(fechaHasta)),
      };
    }
  }
}

export function claveFecha(d: Date): string {
  return fechaISOAR(d);
}

/**
 * Ingresos/ganancia/ítems por día calendario dentro de [desde, hasta].
 * Incluye días sin ventas con valores en cero, así el gráfico no salta fechas.
 */
export function calcularIngresosPorDia(
  ventas: VentaEnriquecida[],
  egresosGastosPorDiaARS: Map<string, number>,
  desde: Date,
  hasta: Date
): IngresoPorDia[] {
  const porDia = new Map<string, { ingresosARS: number; costoARS: number; items: number }>();

  let fechaCursor = fechaISOAR(desde);
  const fechaFin = fechaISOAR(new Date(hasta.getTime() - 1));

  while (fechaCursor <= fechaFin) {
    porDia.set(fechaCursor, { ingresosARS: 0, costoARS: 0, items: 0 });
    fechaCursor = siguienteDiaAR(fechaCursor);
  }

  for (const venta of ventas) {
    const clave = claveFecha(venta.fecha);
    const bucket = porDia.get(clave) ?? { ingresosARS: 0, costoARS: 0, items: 0 };

    bucket.ingresosARS += venta.montoPagado;
    for (const item of venta.items) {
      bucket.items += item.cantidad;
      bucket.costoARS += item.costoUnitarioARS * item.cantidad * venta.proporcionCobrada;
    }
    porDia.set(clave, bucket);
  }

  return Array.from(porDia.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([fecha, v]) => ({
      fecha,
      ingresosARS: v.ingresosARS,
      gananciaARS: v.ingresosARS - v.costoARS - (egresosGastosPorDiaARS.get(fecha) ?? 0),
      items: v.items,
    }));
}

/**
 * Ranking de productos por cantidad de unidades vendidas. Los ítems
 * "Varios / Muestra" (sin productoId) quedan afuera.
 */
export function calcularTopProductos(ventas: VentaEnriquecida[], limite = 10): TopProductoItem[] {
  const acumulado = new Map<string, TopProductoItem>();

  for (const venta of ventas) {
    const { proporcionCobrada, factorDescuento } = venta;

    for (const item of venta.items) {
      if (item.productoId == null) continue;

      const clave = String(item.productoId);
      const montoListaItemARS = item.cantidad * item.precioUnitarioUSD * venta.cotizacionUsada;
      const montoItemARS = montoListaItemARS * factorDescuento * proporcionCobrada;

      const actual = acumulado.get(clave) ?? {
        productoId: item.productoId,
        nombre: item.nombreProducto ?? "(producto sin nombre)",
        fotoUrl: item.fotoUrl,
        cantidad: 0,
        montoARS: 0,
      };
      actual.cantidad += item.cantidad;
      actual.montoARS += montoItemARS;
      acumulado.set(clave, actual);
    }
  }

  return Array.from(acumulado.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limite);
}

/**
 * Ranking de clientes por monto cobrado. Las ventas sin cliente asociado
 * ("consumidor final") quedan afuera.
 */
export function calcularTopClientes(ventas: VentaEnriquecida[], limite = 10): TopClienteItem[] {
  const acumulado = new Map<number, TopClienteItem>();

  for (const venta of ventas) {
    if (venta.clienteId == null) continue;

    const montoVentaARS = venta.totalARS * venta.proporcionCobrada;

    const actual = acumulado.get(venta.clienteId) ?? {
      clienteId: venta.clienteId,
      nombre: venta.clienteNombre ?? "(cliente sin nombre)",
      cantidadVentas: 0,
      montoARS: 0,
    };
    actual.cantidadVentas += 1;
    actual.montoARS += montoVentaARS;
    acumulado.set(venta.clienteId, actual);
  }

  return Array.from(acumulado.values())
    .sort((a, b) => b.montoARS - a.montoARS)
    .slice(0, limite);
}

export function esMismoDia(a: Date, b: Date): boolean {
  return fechaISOAR(a) === fechaISOAR(b);
}