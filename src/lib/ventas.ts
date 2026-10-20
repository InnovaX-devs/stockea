import { Prisma } from "@prisma/client";
import type { EstadoPago, TipoPrecioVenta } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { redondearARS, montoEnCuentaUSD } from "@/lib/currency";
import { mensajeSiCajaCerrada } from "@/lib/caja";
import { siguienteNumero } from "@/lib/numeracion";
import { descontarStock, descontarStockPermitiendoNegativo } from "@/lib/stock";
import { requerirSucursalId } from "@/lib/sucursal";
import { validarCuentaParaSucursal } from "@/lib/cuenta-sucursal";

/**
 * Alta de una venta o pedido. Vive acá (y no en la server action) para que la
 * usen tanto "Confirmar venta" / "Registrar pedido" como la sincronización de
 * ventas hechas sin conexión (POST /api/sync/ventas, issue #41).
 */

export type ItemInput = {
  productoId: number;
  cantidad: number;
  precioUnitarioArs: number;
  tipoPrecio: TipoPrecioVenta;
};

export type PagoInput = {
  cuentaId: number;
  /** Equivalente en ARS (lo que se descuenta del total). */
  monto: number;
  /** Dólares que entran a la cuenta, si la cuenta es USD. */
  montoUSD?: number | null;
};

export type VentaInput = {
  clienteId: number | null;
  items: ItemInput[];
  pagos: PagoInput[];
  descuentoMonto: number | null;
  descuentoPorcentaje: number | null;
  totalARS: number;
  cotizacionUSD: number;
  presupuestoId?: number | null; // presente solo cuando la venta viene de "Convertir a venta"
  /**
   * uuid generado en la compu al confirmar. Si ya existe una venta de la
   * empresa con este id, no se crea otra: se devuelve la que ya estaba
   * (`duplicada: true`). Así un reintento o una respuesta perdida no duplica
   * ventas, stock ni cobros.
   */
  idCliente?: string | null;
};

/** Solo para ventas que llegan de la cola sin conexión. */
export type OpcionesVenta = {
  /** Sucursal donde se hizo la venta (ya validada por quien llama). */
  sucursalId?: number;
  /** Momento real de la venta (ya acotado por quien llama). */
  fecha?: Date;
  /** Si no alcanza el stock, vender igual y dejarlo negativo (marca la venta). */
  permitirStockNegativo?: boolean;
  /** La venta ya pasó en el mostrador: no se rechaza porque la caja esté cerrada ahora. */
  omitirControlCaja?: boolean;
};

export type ResultadoVenta =
  // ventaId = id interno; numero = el que ve el negocio (1, 2, 3…)
  | {
      success: true;
      ventaId: number;
      numero: number;
      /** La venta ya estaba guardada (mismo idCliente): no se hizo nada nuevo. */
      duplicada?: boolean;
      /** Dejó stock negativo en algún producto. */
      stockNegativo?: boolean;
      /** Nombres de los productos que quedaron en negativo. */
      productosStockNegativo?: string[];
    }
  | { success: false; error: string };

async function ventaExistente(empresaId: number, idCliente: string): Promise<ResultadoVenta | null> {
  const existente = await prisma.venta.findUnique({
    where: { empresaId_idCliente: { empresaId, idCliente } },
    select: { id: true, numero: true, stockNegativo: true },
  });
  if (!existente || existente.numero == null) return null;
  return {
    success: true,
    ventaId: existente.id,
    numero: existente.numero,
    duplicada: true,
    stockNegativo: existente.stockNegativo,
  };
}

export async function crearVentaInterna(
  input: VentaInput,
  armado: boolean,
  opciones: OpcionesVenta = {}
): Promise<ResultadoVenta> {
  if (input.items.length === 0) {
    return { success: false, error: "El carrito está vacío." };
  }

  const empresaId = await obtenerEmpresaIdActual();
  const idCliente = input.idCliente?.trim() || null;

  // Misma venta otra vez (reintento / respuesta perdida): se devuelve la que
  // ya está, ANTES de mirar caja o stock (que ahora pueden ser otros).
  if (idCliente) {
    const yaGuardada = await ventaExistente(empresaId, idCliente);
    if (yaGuardada) return yaGuardada;
  }

  // Se vende siempre en una sucursal concreta: de ahí sale el stock.
  let sucursalId: number;
  if (opciones.sucursalId != null) {
    sucursalId = opciones.sucursalId;
  } else {
    try {
      sucursalId = await requerirSucursalId();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Elegí una sucursal." };
    }
  }

  // Con la caja cerrada no se vende (ver src/lib/caja.ts).
  if (!opciones.omitirControlCaja) {
    const cajaCerrada = await mensajeSiCajaCerrada(empresaId, sucursalId);
    if (cajaCerrada) return { success: false, error: cajaCerrada };
  }

  // Blindaje: sin importar qué pantalla llame a esta función, el total
  // siempre se redondea acá, en el backend. Así "lo que se ve" y "lo que se
  // compara" son siempre el mismo número, sin decimales invisibles de la
  // conversión USD -> ARS.
  const totalARS = redondearARS(input.totalARS);

  const pagosValidos = input.pagos
    .filter((p) => p.cuentaId != null && p.monto > 0)
    .map((p) => ({ ...p, monto: redondearARS(p.monto) }));
  const montoPagado = pagosValidos.reduce((acc, p) => acc + p.monto, 0);

  let estadoPago: EstadoPago;
  if (montoPagado >= totalARS - 0.01) {
    estadoPago = "PAGADA";
  } else {
    // Pago parcial: necesitamos cliente para poder trackear la deuda.
    if (!input.clienteId) {
      return {
        success: false,
        error: "Para dejar un saldo pendiente hace falta seleccionar un cliente.",
      };
    }
    estadoPago = "A_CUENTA";
  }

  // Blindaje: la cotización que se guarda en la venta la decide el server,
  // no el cliente. Si el negocio no opera con dólares (usaCotizacionUSD
  // apagado), cotizacionUsada siempre es 1, sin importar qué haya quedado
  // cargado en el campo cotizacionUSD de Configuración.
  const configuracionActual = await obtenerConfiguracion();
  // Se usa la de Configuración, no la que manda la pantalla: si la venta se
  // confirmaba antes de que la pantalla cargara la cotización, llegaba 0 y la
  // venta quedaba guardada con el dólar a $1 (costos y ganancias mal para
  // siempre en los reportes).
  const cotizacionConfig = configuracionActual.usaCotizacionUSD ? configuracionActual.cotizacionUSD : 1;
  const cotizacionUsada = cotizacionConfig > 0 ? cotizacionConfig : 1;
  const totalUSD = totalARS / cotizacionUsada;

  try {
    const { ventaId, numero, productosStockNegativo } = await prisma.$transaction(async (tx) => {
      // 0. Si viene de un presupuesto, revalidar que siga siendo convertible
      //    (nadie lo convirtió en otra pestaña, y no venció mientras el
      //    usuario armaba el cobro).
      if (input.presupuestoId != null) {
        const presupuesto = await tx.presupuesto.findFirst({
          where: { id: input.presupuestoId, empresaId },
          select: { estado: true, fechaVencimiento: true },
        });

        if (!presupuesto) {
          throw new Error("El presupuesto de origen ya no existe.");
        }
        if (presupuesto.estado !== "BORRADOR") {
          throw new Error("Este presupuesto ya fue convertido o ya no es un borrador.");
        }
        if (presupuesto.fechaVencimiento < new Date()) {
          throw new Error("Este presupuesto venció, no se puede convertir.");
        }
      }

      // 0.5 Todo productoId del carrito tiene que ser de esta empresa —
      //     sin esto, un id de producto de otra empresa podría colarse en
      //     un ItemVenta (grave: filtración de datos entre negocios).
      const productoIdsDelCarrito = [
        ...new Set(input.items.map((i) => i.productoId).filter((id): id is number => id != null)),
      ];
      if (productoIdsDelCarrito.length > 0) {
        const productosDelCarrito = await tx.producto.findMany({
          where: { id: { in: productoIdsDelCarrito }, empresaId },
          select: { id: true, nombre: true, precioAbierto: true },
        });
        if (productosDelCarrito.length !== productoIdsDelCarrito.length) {
          throw new Error("Uno o más productos del carrito no son válidos.");
        }

        // 0.6 Productos de precio abierto (verdura, fiambre…): el precio no sale
        //     del producto, lo carga quien vende. Es el único caso en que el
        //     monto que manda la pantalla se toma tal cual, así que se valida
        //     acá, en el servidor (no alcanza con lo que controla la pantalla):
        //     tiene que ser un monto real, mayor a cero.
        const abiertos = new Map(productosDelCarrito.filter((p) => p.precioAbierto).map((p) => [p.id, p.nombre]));
        for (const item of input.items) {
          const nombre = abiertos.get(item.productoId);
          if (nombre === undefined) continue;
          if (!Number.isFinite(item.precioUnitarioArs) || item.precioUnitarioArs <= 0 || item.precioUnitarioArs >= 1e12) {
            throw new Error(`Ingresá el monto de "${nombre}" (tiene que ser mayor a cero).`);
          }
          if (!Number.isInteger(item.cantidad) || item.cantidad < 1) {
            throw new Error(`Cantidad inválida para "${nombre}".`);
          }
        }
      }

      let productosStockNegativo: string[] = [];
      if (armado) {
        if (opciones.permitirStockNegativo) {
          // Venta ya hecha en el mostrador: se descuenta aunque no alcance.
          const enNegativo = await descontarStockPermitiendoNegativo(tx, empresaId, sucursalId, input.items);
          if (enNegativo.length > 0) {
            const productos = await tx.producto.findMany({
              where: { id: { in: enNegativo.map((f) => f.productoId) }, empresaId },
              select: { nombre: true },
              orderBy: { nombre: "asc" },
            });
            productosStockNegativo = productos.map((p) => p.nombre);
          }
        } else {
          // Una sola consulta para todos los productos, y solo si alcanza el stock.
          await descontarStock(tx, empresaId, sucursalId, input.items);
        }
      }

      // 1.5 Si viene con cliente, validar que sea de esta empresa.
      if (input.clienteId != null) {
        const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, empresaId } });
        if (!cliente) throw new Error("El cliente seleccionado no existe");
      }

      // 2. Crear la venta + ítems, con el número propio de la empresa
      //    (dentro de esta transacción: si algo falla, el número no se gasta).
      const numeroVenta = await siguienteNumero(tx, empresaId, "venta");
      const venta = await tx.venta.create({
        data: {
          empresaId,
          sucursalId,
          numero: numeroVenta,
          idCliente,
          stockNegativo: productosStockNegativo.length > 0,
          ...(opciones.fecha ? { fecha: opciones.fecha } : {}),
          clienteId: input.clienteId,
          presupuestoId: input.presupuestoId ?? null,
          cotizacionUsada,
          descuentoMonto: input.descuentoMonto,
          descuentoPorcentaje: input.descuentoPorcentaje,
          totalARS, // ya redondeado
          totalUSD,
          montoPagado,
          estadoPago,
          armado,
          retirado: armado,
          items: {
            create: input.items.map((item) => ({
              productoId: item.productoId,
              cantidad: item.cantidad,
              precioUnitarioUSD: item.precioUnitarioArs / cotizacionUsada,
              tipoPrecio: item.tipoPrecio,
            })),
          },
        },
      });

      // 3. Registrar pagos + movimientos de caja
      for (const pago of pagosValidos) {
        // La cuenta tiene que ser de esta sucursal o compartida.
        const cuentaInfo = await validarCuentaParaSucursal(tx, empresaId, pago.cuentaId, sucursalId);

        // pago.monto llega en ARS (así arma los totales el front). Si la cuenta
        // es en USD, entran los dólares que escribió el usuario (montoUSD).
        const esCuentaUSD = cuentaInfo.tipo === "EFECTIVO_USD" || cuentaInfo.tipo === "BANCO_USD";
        const montoEnMonedaCuenta = esCuentaUSD ? montoEnCuentaUSD(pago, cotizacionUsada) : pago.monto;

        const cuenta = await tx.cuenta.update({
          where: { id: pago.cuentaId },
          data: { saldoActual: { increment: montoEnMonedaCuenta } },
        });

        await tx.pagoVenta.create({
          data: { ventaId: venta.id, cuentaId: pago.cuentaId, monto: montoEnMonedaCuenta, montoARS: pago.monto },
        });

        await tx.movimientoCaja.create({
          data: {
            empresaId,
            cuentaId: pago.cuentaId,
            tipo: "INGRESO",
            concepto: "VENTA_COBRADA",
            monto: montoEnMonedaCuenta,
            saldoResultante: cuenta.saldoActual,
            ventaId: venta.id,
            sucursalId,
            ...(opciones.fecha ? { fecha: opciones.fecha } : {}),
          },
        });
      }

      // 4. Marcar el presupuesto de origen como CONVERTIDO.
      //    updateMany con el estado como filtro = guard atómico contra
      //    doble conversión en carrera (dos pestañas confirmando a la vez).
      if (input.presupuestoId != null) {
        const actualizado = await tx.presupuesto.updateMany({
          where: { id: input.presupuestoId, empresaId, estado: "BORRADOR" },
          data: { estado: "CONVERTIDO" },
        });
        if (actualizado.count === 0) {
          throw new Error("Este presupuesto ya fue convertido en otra pestaña.");
        }
      }

      return { ventaId: venta.id, numero: numeroVenta, productosStockNegativo };
    });

    revalidatePath("/", "layout");

    return {
      success: true,
      ventaId,
      numero,
      ...(productosStockNegativo.length > 0 ? { stockNegativo: true, productosStockNegativo } : {}),
    };
  } catch (e) {
    // Dos envíos de la misma venta a la vez: el segundo choca con el índice
    // único (empresaId, idCliente) y su transacción se deshace entera (stock,
    // cobros y número incluidos). Se devuelve la venta que ganó la carrera.
    if (idCliente && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const yaGuardada = await ventaExistente(empresaId, idCliente);
      if (yaGuardada) return yaGuardada;
    }
    console.error(e);
    const mensaje = e instanceof Error ? e.message : "Ocurrió un error al procesar la venta.";
    return { success: false, error: mensaje };
  }
}
