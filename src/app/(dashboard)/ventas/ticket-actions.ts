"use server";

import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { montoARSDePago } from "@/lib/currency";
import { contenidoVisible } from "@/lib/rubro";
import { NOMBRE_TIPO, numeroFormateado } from "@/lib/arca/factura";
import type { DatosTicket, NegocioTicket } from "@/lib/ticket";
import { detallePromocion } from "@/lib/promociones-comun";

/**
 * Datos para el ticket de la comandera (issue #86). El ticket se arma e
 * imprime en el navegador (src/lib/ticket.ts); acá solo se leen los datos.
 */

/** Pagos hechos a menos de esto de la venta son "el cobro de la venta" (los demás, cobros de deuda posteriores). */
const MARGEN_PAGO_EN_EL_MOMENTO_MS = 5 * 60 * 1000;

function negocioDe(c: { nombreNegocio: string; direccion: string | null; telefono: string | null; cuit: string | null; facturacionHabilitada: boolean }): NegocioTicket {
  return {
    nombre: c.nombreNegocio,
    direccion: c.direccion || null,
    telefono: c.telefono || null,
    // El CUIT solo si el negocio factura (si no, lo cargó pero no lo usa).
    cuit: c.facturacionHabilitada && c.cuit ? c.cuit : null,
  };
}

/** Encabezado del ticket. La pantalla de Ventas lo guarda para imprimir sin conexión. */
export async function datosNegocioTicket(): Promise<NegocioTicket> {
  return negocioDe(await obtenerConfiguracion());
}

/** Ticket de una venta ya guardada, para reimprimirlo desde el historial o el detalle. */
export async function datosTicketVenta(
  ventaId: number
): Promise<{ success: true; data: DatosTicket } | { success: false; error: string }> {
  if (!Number.isInteger(ventaId) || ventaId <= 0) return { success: false, error: "Venta inválida." };
  if (!(await obtenerConfiguracion()).habilitarTicket) {
    return { success: false, error: "El ticket para comandera está disponible en el plan Pro." };
  }
  const empresaId = await obtenerEmpresaIdActual();
  const [venta, configuracion] = await Promise.all([
    prisma.venta.findFirst({
      where: { id: ventaId, empresaId },
      include: {
        cliente: { select: { nombre: true, apellido: true } },
        items: {
          orderBy: { id: "asc" },
          include: {
            producto: {
              select: {
                nombre: true,
                contenido: true,
                unidadContenido: true,
                esPromocion: true,
                componentes: {
                  orderBy: { id: "asc" },
                  select: { cantidad: true, producto: { select: { nombre: true, contenido: true, unidadContenido: true } } },
                },
              },
            },
          },
        },
        pagos: { orderBy: { fecha: "asc" }, include: { cuenta: { select: { nombre: true, tipo: true } } } },
        comprobantes: { where: { estado: "AUTORIZADO", tipo: { in: [1, 6, 11] } }, orderBy: { id: "desc" }, take: 1 },
      },
    }),
    obtenerConfiguracion(),
  ]);
  if (!venta) return { success: false, error: "No se encontró la venta." };

  const items = venta.items.map((it) => {
    const precioUnitario = it.precioUnitarioUSD * venta.cotizacionUsada;
    return {
      cantidad: it.cantidad,
      nombre: it.producto
        ? [it.producto.nombre, contenidoVisible(configuracion.rubro, it.producto.contenido, it.producto.unidadContenido)]
            .filter(Boolean)
            .join(" ")
        : (it.descripcionLibre ?? "Producto"),
      precioUnitario,
      importe: Math.round(precioUnitario * it.cantidad),
      // Promoción (#114): lo que incluye.
      detalle: it.producto?.esPromocion
        ? detallePromocion(
            it.producto.componentes.map((c) => ({
              cantidad: c.cantidad,
              nombre: [c.producto.nombre, contenidoVisible(configuracion.rubro, c.producto.contenido, c.producto.unidadContenido)]
                .filter(Boolean)
                .join(" "),
            }))
          )
        : null,
    };
  });
  const subtotal = venta.items.reduce((a, it) => a + it.precioUnitarioUSD * venta.cotizacionUsada * it.cantidad, 0);
  const total = Math.round(venta.totalARS);
  const montoDescuento = Math.max(0, Math.round(subtotal) - total);

  // Lo que se cobró en el momento de la venta, como en el ticket original.
  const pagos = venta.pagos
    .filter((p) => Math.abs(p.fecha.getTime() - venta.fecha.getTime()) <= MARGEN_PAGO_EN_EL_MOMENTO_MS)
    .map((p) => ({ medio: p.cuenta.nombre, monto: Math.round(montoARSDePago(p, p.cuenta.tipo, venta.cotizacionUsada)) }));
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  const factura = venta.comprobantes[0];

  return {
    success: true,
    data: {
      negocio: negocioDe(configuracion),
      numero: venta.numero,
      fecha: venta.fecha,
      cliente: venta.cliente ? [venta.cliente.nombre, venta.cliente.apellido].filter(Boolean).join(" ") : null,
      items,
      subtotal,
      descuento:
        montoDescuento > 0 || venta.descuentoMonto || venta.descuentoPorcentaje
          ? { monto: montoDescuento, porcentaje: venta.descuentoPorcentaje ?? null }
          : null,
      total,
      pagos,
      pagaCon: null, // no se guarda: es solo una ayuda en pantalla al cobrar
      vuelto: null,
      saldoPendiente: Math.max(0, total - pagado),
      factura:
        factura && factura.numero != null
          ? `${NOMBRE_TIPO[factura.tipo] ?? "Factura"} ${numeroFormateado(factura.puntoVenta, factura.numero)}`
          : null,
      anulada: venta.estadoPago === "ANULADA" || venta.estadoPago === "CANCELADA",
      reimpresion: true,
    },
  };
}
