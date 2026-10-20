"use server";

import { prisma } from "@/lib/prisma";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerEmpresaIdActual, obtenerUsuarioActual, requerirAdmin } from "@/lib/empresa";
import { revalidatePath } from "next/cache";
import type { EstadoPago } from "@prisma/client";
import { redondearARS, montoEnCuentaUSD, montoARSDePago } from "@/lib/currency";
import { mensajeSiCajaCerrada } from "@/lib/caja";
import { notaCreditoTrasAnular } from "@/lib/arca/factura";
import { costoEstimadoDeLinea } from "@/lib/reportes";
import { descontarStock, sumarStock, sucursalDeVenta, stockEnSucursal } from "@/lib/stock";
import { crearVentaInterna, type PagoInput, type VentaInput, type ResultadoVenta } from "@/lib/ventas";
import { filtroPorSucursal, obtenerSucursalIdActual, requerirSucursalId } from "@/lib/sucursal";
import { validarCuentaParaSucursal } from "@/lib/cuenta-sucursal";
import { Prisma } from "@prisma/client";
import { inicioDiaAR } from "@/lib/timezone";
import type {
  FiltrosVentas,
  ResultadoListadoVentas,
  VentaListItem,
  FiltrosPedidos,
  ResultadoListadoPedidos,
  PedidoListItem,
  PedidoDetalle,
} from "@/types/venta"; 



  type DescontarStockItemInput = {
  productoId: number;
  cantidad: number;
};

type ResultadoDetallePedido =
  | { success: true; pedido: PedidoDetalle }
  | { success: false; error: string };

type ResultadoDescontarStock =
  | { success: true }
  | { success: false; error: string };

export async function descontarStockSinVenta(
  items: DescontarStockItemInput[]
): Promise<ResultadoDescontarStock> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  if (items.length === 0) {
    return { success: false, error: "El carrito está vacío." };
  }

  try {
    const empresaId = await obtenerEmpresaIdActual();
    const sucursalId = await requerirSucursalId();

    await prisma.$transaction(async (tx) => {
      // 1. Validar stock
      await descontarStock(tx, empresaId, sucursalId, items);
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (e) {
    console.error(e);
    const mensaje = e instanceof Error ? e.message : "Ocurrió un error al descontar el stock.";
    return { success: false, error: mensaje };
  }
}


export async function confirmarVenta(input: VentaInput): Promise<ResultadoVenta> {
  return crearVentaInterna(input, true);
}

export async function registrarPedido(input: VentaInput): Promise<ResultadoVenta> {
  return crearVentaInterna(input, false);
}

export async function listarVentas(filtros: FiltrosVentas): Promise<ResultadoListadoVentas> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  const empresaId = await obtenerEmpresaIdActual();
  const sucursalId = await obtenerSucursalIdActual(); // null = "Todas" (solo admin)
  const { estado, clienteTexto, fechaDesde, fechaHasta, orden, page, pageSize } = filtros;

  const condicionesBase: Prisma.VentaWhereInput[] = [
    { empresaId, ...filtroPorSucursal(sucursalId) },
    {
      OR: [
        { retirado: true },
        { montoPagado: { gt: 0 } },
        { estadoPago: "CANCELADA" },
        { estadoPago: "ANULADA" },
      ],
    },
  ];

  if (estado !== "TODOS") {
    condicionesBase.push({ estadoPago: estado });
  }

  const where: Prisma.VentaWhereInput = { AND: condicionesBase };

  const texto = clienteTexto.trim();
  if (texto) {
    const soloNumeros = texto.replace(/^#/, ""); // permite escribir "8" o "#8"
    const esNumero = /^\d+$/.test(soloNumeros);

    if (esNumero) {
      // Se busca por el número que ve el negocio, no por el id interno.
      where.numero = Number(soloNumeros);
    } else if (texto.toLowerCase() === "sin cliente") {
      where.clienteId = null;
    } else {
      where.cliente = {
        OR: [
          { nombre: { contains: texto, mode: "insensitive" } },
          { apellido: { contains: texto, mode: "insensitive" } },
        ],
      };
    }
  }

  if (fechaDesde || fechaHasta) {
    where.fecha = {};

    if (fechaDesde) {
      where.fecha.gte = inicioDiaAR(fechaDesde);
    }

    if (fechaHasta) {
      const inicioDiaSiguiente = new Date(
        inicioDiaAR(fechaHasta).getTime() + 24 * 60 * 60 * 1000
      );

      where.fecha.lt = inicioDiaSiguiente;
    }
  }

  const [ventas, totalRegistros] = await Promise.all([
    prisma.venta.findMany({
      where,
      orderBy: { fecha: orden === "MAS_NUEVO" ? "desc" : "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        cliente: { select: { nombre: true, apellido: true } },
        sucursal: { select: { nombre: true } },
        items: {
          include: {
            producto: { select: { precioCosto: true, monedaPrecio: true, precioAbierto: true, costoEstimadoPct: true } },
          },
        },
        comprobantes: {
          orderBy: { id: "desc" },
          select: { estado: true, tipo: true, puntoVenta: true, numero: true, error: true },
        },
      },
    }),
    prisma.venta.count({ where }),
  ]);

  const ventasFormateadas: VentaListItem[] = ventas.map((venta) => {
    const costoTotalARS = venta.items.reduce((acc, item) => {
      if (!item.producto) return acc;

      // Precio abierto: costo estimado como % de lo que se cobró por la línea.
      if (item.producto.precioAbierto) {
        return acc + costoEstimadoDeLinea(item.precioUnitarioUSD * venta.cotizacionUsada, item.producto.costoEstimadoPct) * item.cantidad;
      }

      const costoProductoARS =
        item.producto.monedaPrecio === "USD"
          ? item.producto.precioCosto * venta.cotizacionUsada
          : item.producto.precioCosto;

      return acc + costoProductoARS * item.cantidad;
    }, 0);

    const gananciaARS = venta.totalARS - costoTotalARS;
    const gananciaPorcentaje = costoTotalARS > 0 ? (gananciaARS / costoTotalARS) * 100 : 0;

    return {
      id: venta.id,
      numero: venta.numero,
      clienteNombre: venta.cliente
        ? `${venta.cliente.nombre}${venta.cliente.apellido ? " " + venta.cliente.apellido : ""}`
        : null,
      sucursalNombre: venta.sucursal?.nombre ?? null,
      totalARS: venta.totalARS,
      gananciaARS,
      gananciaPorcentaje,
      fecha: venta.fecha.toISOString(),
      estado: venta.estadoPago,
      ...(() => {
        const num = (c: { puntoVenta: number; numero: number | null }) =>
          c.numero != null ? `${String(c.puntoVenta).padStart(5, "0")}-${String(c.numero).padStart(8, "0")}` : null;
        const f = venta.comprobantes.find((c) => [1, 6, 11].includes(c.tipo));
        const nc = venta.comprobantes.find((c) => [3, 8, 13].includes(c.tipo));
        return {
          factura: f
            ? { estado: f.estado, letra: ({ 1: "A", 6: "B", 11: "C" } as Record<number, string>)[f.tipo] ?? "", numero: num(f), error: f.error }
            : null,
          notaCredito: nc ? { estado: nc.estado, numero: num(nc), error: nc.error } : null,
        };
      })(),
    };
  });

  return { ventas: ventasFormateadas, totalRegistros };
}

export type StockDisponibilidad = {
  stockFisico: number;
  reservado: number;
  disponible: number;
  alcanza: boolean;
};

export async function verificarStockDisponible(
  productoId: number,
  unidadesRequeridas: number
): Promise<StockDisponibilidad> {
  const empresaId = await obtenerEmpresaIdActual();
  // Stock y reservas de la sucursal actual; con "Todas" (solo consulta), el total.
  const sucursalId = await obtenerSucursalIdActual();

  const producto = await prisma.producto.findFirst({
    where: { id: productoId, empresaId },
    select: { stockActual: true, controlaStock: true },
  });
  // Verdura, fiambre…: no controlan stock, siempre "alcanza".
  if (producto && !producto.controlaStock) {
    return { stockFisico: 0, reservado: 0, disponible: unidadesRequeridas, alcanza: true };
  }
  const stockFisico = !producto
    ? 0
    : sucursalId == null
      ? producto.stockActual
      : await stockEnSucursal(prisma, productoId, sucursalId);

  // Reservado = suma de unidades comprometidas en pedidos sin armar (armado=false)
  // que siguen activos (ni cancelados ni anulados), de esta sucursal.
  const itemsPendientes = await prisma.itemVenta.findMany({
    where: {
      productoId,
      venta: {
        empresaId,
        ...(sucursalId != null ? { sucursalId } : {}),
        armado: false,
        estadoPago: { notIn: ["CANCELADA", "ANULADA"] },
      },
    },
    select: { cantidad: true },
  });

  const reservado = itemsPendientes.reduce((acc, item) => acc + item.cantidad, 0);

  const disponible = stockFisico - reservado;

  return {
    stockFisico,
    reservado,
    disponible,
    alcanza: unidadesRequeridas <= disponible,
  };
}

export async function listarPedidos(filtros: FiltrosPedidos): Promise<ResultadoListadoPedidos> {
  const empresaId = await obtenerEmpresaIdActual();
  const sucursalId = await obtenerSucursalIdActual(); // null = "Todas" (solo admin)
  const { clienteTexto, fechaDesde, fechaHasta, orden, sinCobrar, sinArmar, sinEnviar, sinRetirar } = filtros;

  const where: Prisma.VentaWhereInput = {
    empresaId,
    ...filtroPorSucursal(sucursalId),
    retirado: false,
    estadoPago: { notIn: ["CANCELADA", "ANULADA"] },
  };

  if (sinCobrar) where.estadoPago = "A_CUENTA";
  if (sinArmar) where.armado = false;
  if (sinEnviar) where.enviado = false;
  if (sinRetirar) where.retirado = false; // ya está arriba, pero explícito por claridad de filtro activo

  const texto = clienteTexto.trim();
  if (texto) {
    const soloNumeros = texto.replace(/^#/, "");
    const esNumero = /^\d+$/.test(soloNumeros);

    if (esNumero) {
      // Se busca por el número que ve el negocio, no por el id interno.
      where.numero = Number(soloNumeros);
    } else if (texto.toLowerCase() === "sin cliente") {
      where.clienteId = null;
    } else {
      where.cliente = {
        OR: [
          { nombre: { contains: texto, mode: "insensitive" } },
          { apellido: { contains: texto, mode: "insensitive" } },
        ],
      };
    }
  }

  if (fechaDesde || fechaHasta) {
    where.fecha = {};

    if (fechaDesde) {
      where.fecha.gte = inicioDiaAR(fechaDesde);
    }

    if (fechaHasta) {
      const inicioDiaSiguiente = new Date(
        inicioDiaAR(fechaHasta).getTime() + 24 * 60 * 60 * 1000
      );

      where.fecha.lt = inicioDiaSiguiente;
    }
  }
  const ventas = await prisma.venta.findMany({
    where,
    orderBy: { fecha: orden === "MAS_NUEVO" ? "desc" : "asc" },
    include: {
      cliente: { select: { nombre: true, apellido: true } },
    },
  });

  const pedidos: PedidoListItem[] = ventas.map((venta) => ({
    id: venta.id,
    numero: venta.numero,
    clienteNombre: venta.cliente
      ? `${venta.cliente.nombre}${venta.cliente.apellido ? " " + venta.cliente.apellido : ""}`
      : null,
    totalARS: venta.totalARS,
    montoPagado: venta.montoPagado,
    estadoPago: venta.estadoPago,
    armado: venta.armado,
    enviado: venta.enviado,
    retirado: venta.retirado,
    fecha: venta.fecha.toISOString(),
  }));

  return { pedidos };
}

type ResultadoAccionPedido =
  // notaCredito: resultado de la nota de crédito si la venta tenía factura.
  | { success: true; notaCredito?: { ok: boolean; mensaje: string } }
  | { success: false; error: string; codigo?: "SALDO_NEGATIVO" };

/** Error para cortar la transacción cuando una cuenta quedaría en negativo. */
class SaldoNegativoError extends Error {}

export async function marcarArmado(ventaId: number): Promise<ResultadoAccionPedido> {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, empresaId },
      include: { items: true },
    });
    if (!venta) return { success: false, error: "El pedido no existe" };
    if (venta.armado) return { success: false, error: "El pedido ya está armado" };
    if (venta.estadoPago === "CANCELADA" || venta.estadoPago === "ANULADA") {
      return { success: false, error: "El pedido está cancelado" };
    }

    await prisma.$transaction(async (tx) => {
      // El pedido se arma con stock de la sucursal donde se registró.
      await descontarStock(tx, empresaId, await sucursalDeVenta(tx, venta), venta.items);

      // Guard atómico: si en otra pestaña lo armaron o cancelaron, no se descuenta dos veces.
      const marcado = await tx.venta.updateMany({
        where: { id: ventaId, empresaId, armado: false, estadoPago: { notIn: ["CANCELADA", "ANULADA"] } },
        data: { armado: true },
      });
      if (marcado.count === 0) throw new Error("El pedido ya fue armado o cancelado en otra pantalla.");
    });

    revalidatePath("/ventas/pedidos");
    return { success: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al marcar como armado";
    return { success: false, error: mensaje };
  }
}

export async function marcarEnviado(ventaId: number): Promise<ResultadoAccionPedido> {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const venta = await prisma.venta.findFirst({ where: { id: ventaId, empresaId } });
    if (!venta) return { success: false, error: "El pedido no existe" };
    if (!venta.armado) return { success: false, error: "El pedido todavía no fue armado" };

    // updateMany con el estado como filtro: si lo cancelaron en otra pestaña, no se marca.
    const marcado = await prisma.venta.updateMany({
      where: { id: ventaId, empresaId, estadoPago: { notIn: ["CANCELADA", "ANULADA"] } },
      data: { enviado: true },
    });
    if (marcado.count === 0) return { success: false, error: "El pedido está cancelado" };
    revalidatePath("/ventas/pedidos");
    return { success: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al marcar como enviado";
    return { success: false, error: mensaje };
  }
}

export async function obtenerDetallePedido(ventaId: number): Promise<ResultadoDetallePedido> {
  try {
    const { empresaId, rol } = await obtenerUsuarioActual();
    const esEmpleado = rol === "EMPLEADO";
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, empresaId },
      include: {
        cliente: { select: { nombre: true, apellido: true } },
        items: {
          include: {
            producto: {
              select: { nombre: true, precioCosto: true, monedaPrecio: true, precioAbierto: true, costoEstimadoPct: true },
            },
          },
        },
        pagos: {
          include: {
            cuenta: { select: { tipo: true } },
          },
        },
      },
    });

    if (!venta) {
      return { success: false, error: "El pedido no existe" };
    }

    const costoTotalARS = venta.items.reduce((acc, item) => {
      if (!item.producto) return acc;

      // Precio abierto: costo estimado como % de lo que se cobró por la línea.
      if (item.producto.precioAbierto) {
        return acc + costoEstimadoDeLinea(item.precioUnitarioUSD * venta.cotizacionUsada, item.producto.costoEstimadoPct) * item.cantidad;
      }

      const costoProductoARS =
        item.producto.monedaPrecio === "USD"
          ? item.producto.precioCosto * venta.cotizacionUsada
          : item.producto.precioCosto;

      return acc + costoProductoARS * item.cantidad;
    }, 0);

    const gananciaARS = venta.totalARS - costoTotalARS;
    const gananciaPorcentaje = costoTotalARS > 0 ? (gananciaARS / costoTotalARS) * 100 : 0;

    const pedido: PedidoDetalle = {
      id: venta.id,
      numero: venta.numero,
      fecha: venta.fecha.toISOString(),
      clienteNombre: venta.cliente
        ? `${venta.cliente.nombre}${venta.cliente.apellido ? " " + venta.cliente.apellido : ""}`
        : null,
      estadoPago: venta.estadoPago,
      armado: venta.armado,
      enviado: venta.enviado,
      retirado: venta.retirado,
      totalARS: venta.totalARS,
      montoPagado: venta.montoPagado,
      // El empleado no ve costos ni ganancias.
      gananciaARS: esEmpleado ? null : gananciaARS,
      gananciaPorcentaje: esEmpleado ? null : gananciaPorcentaje,
      pagos: venta.pagos.map((p) => {
        return {
          montoARS: montoARSDePago(p, p.cuenta.tipo, venta.cotizacionUsada),
          tipoCuenta: p.cuenta.tipo,
        };
      }),
      items: venta.items.map((item) => ({
        id: item.id,
        productoNombre: item.producto?.nombre ?? item.descripcionLibre ?? "Producto",
        cantidad: item.cantidad,
        precioUnitarioUSD: item.precioUnitarioUSD,
        precioUnitarioARS: item.precioUnitarioUSD * venta.cotizacionUsada,
        subtotalARS: item.precioUnitarioUSD * venta.cotizacionUsada * item.cantidad,
      })),
    };

    return { success: true, pedido };
  } catch (e) {
    console.error(e);
    return { success: false, error: "Error al obtener el detalle del pedido" };
  }
}

export async function marcarRetirado(ventaId: number): Promise<ResultadoAccionPedido> {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const venta = await prisma.venta.findFirst({ where: { id: ventaId, empresaId } });
    if (!venta) return { success: false, error: "El pedido no existe" };
    if (!venta.armado) return { success: false, error: "El pedido todavía no fue armado" };

    // updateMany con el estado como filtro: si lo cancelaron en otra pestaña, no se marca.
    const marcado = await prisma.venta.updateMany({
      where: { id: ventaId, empresaId, estadoPago: { notIn: ["CANCELADA", "ANULADA"] } },
      data: { retirado: true },
    });
    if (marcado.count === 0) return { success: false, error: "El pedido está cancelado" };
    revalidatePath("/ventas/pedidos");
    return { success: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al marcar como retirado";
    return { success: false, error: mensaje };
  }
}

export async function registrarCobroPedido(
  ventaId: number,
  pagos: PagoInput[]
): Promise<ResultadoAccionPedido> {
  const pagosValidos = pagos
    .filter((p) => p.cuentaId != null && p.monto > 0)
    .map((p) => ({ ...p, monto: redondearARS(p.monto) }));
  if (pagosValidos.length === 0) {
    return { success: false, error: "Ingresá al menos un pago válido" };
  }

  // La caja que tiene que estar abierta es la de la sucursal del pedido.
  {
    const empresaIdCaja = await obtenerEmpresaIdActual();
    const pedido = await prisma.venta.findFirst({
      where: { id: ventaId, empresaId: empresaIdCaja },
      select: { empresaId: true, sucursalId: true },
    });
    if (!pedido) return { success: false, error: "El pedido no existe" };
    const cajaCerrada = await mensajeSiCajaCerrada(empresaIdCaja, await sucursalDeVenta(prisma, pedido));
    if (cajaCerrada) return { success: false, error: cajaCerrada };
  }

  try {
    const empresaId = await obtenerEmpresaIdActual();

    // La configuración se lee ANTES de abrir la transacción: obtenerConfiguracion
    // usa su propia conexión, y adentro de la transacción esa consulta puede
    // quedar esperando la misma conexión que tiene tomada la transacción (con
    // el pooler de Supabase) hasta que vence ("Transaction not found").
    // Mismo criterio que al crear la venta: si el negocio no opera con
    // dólares (o la licencia no lo permite), la cotización es 1.
    const configuracion = await obtenerConfiguracion();
    const cotizacionRaw = configuracion.usaCotizacionUSD ? configuracion.cotizacionUSD : 1;
    const cotizacion = cotizacionRaw > 0 ? cotizacionRaw : 1;

    await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findFirst({ where: { id: ventaId, empresaId } });
      if (!venta) throw new Error("El pedido no existe");
      if (venta.estadoPago === "PAGADA") throw new Error("El pedido ya está pagado");
      // El cobro queda en la sucursal del pedido.
      const sucursalPedido = await sucursalDeVenta(tx, venta);

      // Blindaje: si el registro quedó guardado con decimales (pedidos
      // viejos, u otra pantalla que en el futuro no redondee), lo
      // normalizamos acá antes de comparar.
      const totalARS = redondearARS(venta.totalARS);


      const montoNuevo = pagosValidos.reduce((acc, p) => acc + p.monto, 0);
      const restante = totalARS - venta.montoPagado;

      if (montoNuevo > restante + 0.01) {
        throw new Error(
          `El monto ingresado ($${montoNuevo.toFixed(2)}) supera lo que falta cobrar ($${restante.toFixed(2)})`
        );
      }

      for (const pago of pagosValidos) {
        const cuentaInfo = await validarCuentaParaSucursal(tx, empresaId, pago.cuentaId, sucursalPedido);

        const esCuentaUSD = cuentaInfo.tipo === "EFECTIVO_USD" || cuentaInfo.tipo === "BANCO_USD";
        const montoEnMonedaCuenta = esCuentaUSD ? montoEnCuentaUSD(pago, cotizacion) : pago.monto;

        const cuenta = await tx.cuenta.update({
          where: { id: pago.cuentaId },
          data: { saldoActual: { increment: montoEnMonedaCuenta } },
        });

        await tx.pagoVenta.create({
          data: { ventaId, cuentaId: pago.cuentaId, monto: montoEnMonedaCuenta, montoARS: pago.monto },
        });

        await tx.movimientoCaja.create({
          data: {
            empresaId,
            cuentaId: pago.cuentaId,
            tipo: "INGRESO",
            concepto: "VENTA_COBRADA",
            monto: montoEnMonedaCuenta,
            saldoResultante: cuenta.saldoActual,
            ventaId,
            sucursalId: sucursalPedido,
          },
        });
      }

      const nuevoMontoPagado = venta.montoPagado + montoNuevo;
      const nuevoEstado: EstadoPago = nuevoMontoPagado >= totalARS - 0.01 ? "PAGADA" : "A_CUENTA";

      if (nuevoEstado === "A_CUENTA" && !venta.clienteId) {
        throw new Error("Para dejar un saldo pendiente el pedido necesita un cliente asociado.");
      }

      await tx.venta.update({
        where: { id: ventaId },
        data: { montoPagado: nuevoMontoPagado, estadoPago: nuevoEstado },
      });
    });

    revalidatePath("/ventas/pedidos");
    return { success: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al registrar el cobro";
    return { success: false, error: mensaje };
  }
}

export async function anularVenta(
  ventaId: number,
  opciones: { forzar?: boolean } = {}
): Promise<ResultadoAccionPedido> {
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, empresaId },
      include: { items: true, pagos: true },
    });
    if (!venta) return { success: false, error: "La venta no existe" };

    if (venta.estadoPago === "CANCELADA" || venta.estadoPago === "ANULADA") {
      return { success: false, error: "La venta ya está anulada" };
    }

    await prisma.$transaction(async (tx) => {
      // Guard atómico: si el estado cambió entre el findUnique de arriba y
      // este punto (doble click, dos pestañas, otro usuario), este update
      // afecta 0 filas y abortamos sin tocar stock ni caja.
      const marcada = await tx.venta.updateMany({
        where: { id: ventaId, empresaId, estadoPago: venta.estadoPago },
        data: { estadoPago: "ANULADA" },
      });
      if (marcada.count === 0) {
        throw new Error("La venta ya fue anulada o modificada por otra acción.");
      }

      // 1. Devolver stock si ya se había descontado (armado=true)
      if (venta.armado) {
        await sumarStock(tx, empresaId, await sucursalDeVenta(tx, venta), venta.items);
      }

      // 2. Revertir cada pago: restar de la cuenta y dejar registro en movimientos de caja
      for (const pago of venta.pagos) {
        const cuenta = await tx.cuenta.update({
          where: { id: pago.cuentaId },
          data: { saldoActual: { decrement: pago.monto } },
        });
        // Si la plata ya se movió (transferencia, retiro), la cuenta puede
        // quedar en negativo: se avisa y solo se sigue si el usuario confirma.
        if (cuenta.saldoActual < 0 && !opciones.forzar) {
          throw new SaldoNegativoError(
            `"${cuenta.nombre}" quedaría en ${cuenta.saldoActual.toLocaleString("es-AR", { style: "currency", currency: cuenta.tipo.endsWith("USD") ? "USD" : "ARS" })}.`
          );
        }

        await tx.movimientoCaja.create({
          data: {
            empresaId,
            cuentaId: pago.cuentaId,
            tipo: "EGRESO",
            concepto: "AJUSTE_SALDO",
            monto: pago.monto,
            saldoResultante: cuenta.saldoActual,
            detalle: `Reversión por anulación de venta #${venta.numero ?? venta.id}`,
            ventaId: venta.id,
            sucursalId: await sucursalDeVenta(tx, venta),
          },
        });
      }
    });

    revalidatePath("/ventas/historial");
    revalidatePath("/", "layout");
    // Fuera de la transacción: si la venta tenía factura, nota de crédito.
    const notaCredito = (await notaCreditoTrasAnular(empresaId, ventaId)) ?? undefined;
    return { success: true, notaCredito };
  } catch (e) {
    if (e instanceof SaldoNegativoError) {
      return { success: false, error: e.message, codigo: "SALDO_NEGATIVO" };
    }
    const mensaje = e instanceof Error ? e.message : "Error al anular la venta";
    return { success: false, error: mensaje };
  }
}

export async function cancelarPedido(
  ventaId: number,
  opciones: { forzar?: boolean } = {}
): Promise<ResultadoAccionPedido> {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, empresaId },
      include: { items: true, pagos: true },
    });
    if (!venta) return { success: false, error: "El pedido no existe" };

    if (venta.estadoPago === "CANCELADA" || venta.estadoPago === "ANULADA") {
      return { success: false, error: "El pedido ya está cancelado" };
    }

    await prisma.$transaction(async (tx) => {
      // Guard atómico, mismo motivo que en anularVenta.
      const marcado = await tx.venta.updateMany({
        where: { id: ventaId, empresaId, estadoPago: venta.estadoPago },
        data: { estadoPago: "CANCELADA" },
      });
      if (marcado.count === 0) {
        throw new Error("El pedido ya fue cancelado o modificado por otra acción.");
      }

      if (venta.armado) {
        await sumarStock(tx, empresaId, await sucursalDeVenta(tx, venta), venta.items);
      }

      // Antes esto bloqueaba la cancelación si había pagos; ahora se revierten solos.
      for (const pago of venta.pagos) {
        const cuenta = await tx.cuenta.update({
          where: { id: pago.cuentaId },
          data: { saldoActual: { decrement: pago.monto } },
        });
        // Si la plata ya se movió (transferencia, retiro), la cuenta puede
        // quedar en negativo: se avisa y solo se sigue si el usuario confirma.
        if (cuenta.saldoActual < 0 && !opciones.forzar) {
          throw new SaldoNegativoError(
            `"${cuenta.nombre}" quedaría en ${cuenta.saldoActual.toLocaleString("es-AR", { style: "currency", currency: cuenta.tipo.endsWith("USD") ? "USD" : "ARS" })}.`
          );
        }

        await tx.movimientoCaja.create({
          data: {
            empresaId,
            cuentaId: pago.cuentaId,
            tipo: "EGRESO",
            concepto: "AJUSTE_SALDO",
            monto: pago.monto,
            saldoResultante: cuenta.saldoActual,
            detalle: `Reversión por cancelación de pedido #${venta.numero ?? venta.id}`,
            ventaId: venta.id,
            sucursalId: await sucursalDeVenta(tx, venta),
          },
        });
      }
    });

    revalidatePath("/ventas/pedidos");
    // Fuera de la transacción: si el pedido tenía factura, nota de crédito.
    const notaCredito = (await notaCreditoTrasAnular(empresaId, ventaId)) ?? undefined;
    return { success: true, notaCredito };
  } catch (e) {
    if (e instanceof SaldoNegativoError) {
      return { success: false, error: e.message, codigo: "SALDO_NEGATIVO" };
    }
    const mensaje = e instanceof Error ? e.message : "Error al cancelar el pedido";
    return { success: false, error: mensaje };
  }
}