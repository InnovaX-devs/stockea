"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getHistorialDeuda } from "@/lib/clientes";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { redondearARS, esCuentaUSD, montoEnCuentaUSD, redondearUSD } from "@/lib/currency";

// Saldo pendiente de una venta en pesos enteros. El totalARS puede tener
// decimales (conversión USD → ARS, descuentos) y nadie cobra los centavos:
// si no redondeamos, la venta queda "A_CUENTA" con $0,20 de deuda.
function pendienteDeVenta(venta: { totalARS: number; montoPagado: number }) {
  return Math.max(0, redondearARS(venta.totalARS) - venta.montoPagado);
}

// Mismo criterio que en ventas/actions.ts: si el negocio no opera con
// dólares, la cotización es 1.
async function obtenerCotizacion() {
  const config = await obtenerConfiguracion();
  const cotizacionRaw = config.usaCotizacionUSD ? config.cotizacionUSD : 1;
  return cotizacionRaw > 0 ? cotizacionRaw : 1;
}

// Proporción "moneda de la cuenta / ARS" de un pago. En cuentas USD respeta
// los dólares que escribió el usuario, así la cuenta recibe ese monto exacto
// aunque el pago se reparta entre varias ventas.
function factorCuenta(pago: { monto: number; montoUSD?: number | null }, esUSD: boolean, cotizacion: number) {
  return esUSD ? montoEnCuentaUSD(pago, cotizacion) / pago.monto : 1;
}

export async function eliminarCliente(clienteId: number) { // antes: string
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
    if (!cliente) {
      return { success: false as const, error: "Cliente no encontrado." };
    }
    await prisma.cliente.delete({ where: { id: clienteId } });
    revalidatePath("/clientes");
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error:
        "No se puede eliminar: el cliente tiene ventas o presupuestos asociados.",
    };
  }
}

export type ClienteInput = {
  nombre: string;
  apellido?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  localidad?: string;
  esMayorista: boolean;
};

function validarCliente(data: ClienteInput) {
  if (!data.nombre?.trim()) {
    return "El nombre es obligatorio.";
  }
  return null;
}

export async function crearCliente(data: ClienteInput) {
  const errorValidacion = validarCliente(data);
  if (errorValidacion) {
    return { success: false as const, error: errorValidacion };
  }

  try {
    const empresaId = await obtenerEmpresaIdActual();
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nombre: data.nombre.trim(),
        apellido: data.apellido?.trim() || null,
        telefono: data.telefono?.trim() || null,
        email: data.email?.trim() || null,
        direccion: data.direccion?.trim() || null,
        localidad: data.localidad?.trim() || null,
        esMayorista: data.esMayorista,
      },
      select: { id: true, nombre: true, apellido: true, esMayorista: true },
    });
    revalidatePath("/clientes");
    return { success: true as const, cliente };
  } catch {
    return { success: false as const, error: "No se pudo crear el cliente." };
  }
}

export async function actualizarCliente(id: number, data: ClienteInput) { // antes: string
  const errorValidacion = validarCliente(data);
  if (errorValidacion) {
    return { success: false as const, error: errorValidacion };
  }

  try {
    const empresaId = await obtenerEmpresaIdActual();
    const existente = await prisma.cliente.findFirst({ where: { id, empresaId } });
    if (!existente) {
      return { success: false as const, error: "Cliente no encontrado." };
    }

    const cliente = await prisma.cliente.update({
      where: { id },
      data: {
        nombre: data.nombre.trim(),
        apellido: data.apellido?.trim() || null,
        telefono: data.telefono?.trim() || null,
        email: data.email?.trim() || null,
        direccion: data.direccion?.trim() || null,
        localidad: data.localidad?.trim() || null,
        esMayorista: data.esMayorista,
      },
      select: { id: true, nombre: true, apellido: true, esMayorista: true },
    });
    revalidatePath("/clientes");
    return { success: true as const, cliente };
  } catch {
    return { success: false as const, error: "No se pudo actualizar el cliente." };
  }
}

// --- Cobro de deuda ---

interface PagoInput {
  cuentaId: number;
  /** Equivalente en ARS: lo que se descuenta de la deuda. */
  monto: number;
  /** Dólares que entran a la cuenta, si la cuenta es USD. */
  montoUSD?: number | null;
}

export async function cobrarDeuda(clienteId: number, pagos: PagoInput[]) {
  const pagosValidos = pagos
    .filter((p) => p.monto > 0)
    .map((p) => ({ ...p, monto: redondearARS(p.monto) }))
    .filter((p) => p.monto > 0);
  if (pagosValidos.length === 0) {
    return { success: false as const, error: "Ingresá un monto mayor a $0." };
  }

  try {
    const empresaId = await obtenerEmpresaIdActual();
    const cotizacion = await obtenerCotizacion();

    await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id: clienteId, empresaId } });
      if (!cliente) throw new Error("CLIENTE_NO_ENCONTRADO");

      const ventasPendientes = await tx.venta.findMany({
        where: { clienteId, empresaId, estadoPago: "A_CUENTA" },
        orderBy: { fecha: "asc" },
      });

      const pendientePorVenta = new Map<number, number>(
        ventasPendientes.map((v) => [v.id, pendienteDeVenta(v)] as [number, number])
      );

      for (const pago of pagosValidos) {
        const cuentaValida = await tx.cuenta.findFirst({ where: { id: pago.cuentaId, empresaId } });
        if (!cuentaValida) throw new Error("CUENTA_NO_ENCONTRADA");

        // pago.monto llega en ARS. Si la cuenta es en USD, entran los dólares
        // que escribió el usuario (igual que en ventas y pedidos).
        const esUSD = esCuentaUSD(cuentaValida.tipo);
        const factor = factorCuenta(pago, esUSD, cotizacion);
        const enCuenta = (ars: number) => (esUSD ? redondearUSD(ars * factor) : ars);

        let restante = pago.monto;
        const ventasTocadas: number[] = [];

        for (const venta of ventasPendientes) {
          if (restante <= 0) break;
          const pendiente = pendientePorVenta.get(venta.id)!;
          if (pendiente < 0.5) continue;

          const aplicado = Math.min(restante, pendiente);
          const nuevoPendiente = pendiente - aplicado;
          const saldada = nuevoPendiente < 0.5;

          await tx.pagoVenta.create({
            data: { ventaId: venta.id, cuentaId: pago.cuentaId, monto: enCuenta(aplicado), montoARS: aplicado },
          });

          await tx.venta.update({
            where: { id: venta.id },
            data: {
              montoPagado: redondearARS(venta.totalARS) - (saldada ? 0 : nuevoPendiente),
              estadoPago: saldada ? "PAGADA" : "A_CUENTA",
            },
          });

          pendientePorVenta.set(venta.id, nuevoPendiente);
          ventasTocadas.push(venta.id);
          restante -= aplicado;
        }

        const montoAplicado = pago.monto - restante;
        if (montoAplicado > 0.01) {
          const cuenta = await tx.cuenta.update({
            where: { id: pago.cuentaId },
            data: { saldoActual: { increment: enCuenta(montoAplicado) } },
          });

          await tx.movimientoCaja.create({
            data: {
              empresaId,
              cuentaId: pago.cuentaId,
              tipo: "INGRESO",
              concepto: "PAGO_DEUDA_CLIENTE",
              monto: enCuenta(montoAplicado),
              saldoResultante: cuenta.saldoActual,
              ventaId: ventasTocadas.length === 1 ? ventasTocadas[0] : null,
            },
          });
        }
      }
    });

    revalidatePath("/clientes");
    return { success: true as const };
  } catch (e) {
    console.error(e);
    return { success: false as const, error: "Ocurrió un error al registrar el cobro." };
  }
}

export async function obtenerHistorialDeuda(clienteId: number) {
  const historial = await getHistorialDeuda(clienteId);
  return historial.map((h) => ({ ...h, fecha: h.fecha.toISOString() }));
}

// --- Ajuste manual de deuda ---

type AjusteDeudaInput = {
  clienteId: number;
  tipo: "aumentar" | "reducir";
  /** En ARS. */
  monto: number;
  cuentaId?: number;
  /** Solo "reducir" con cuenta USD: dólares que entran a la cuenta. */
  montoUSD?: number | null;
};

export async function ajustarDeudaManual(input: AjusteDeudaInput) {
  const { clienteId, tipo, cuentaId, montoUSD } = input;
  const monto = redondearARS(input.monto);

  if (!monto || monto <= 0) {
    return { success: false as const, error: "Ingresá un monto mayor a $0." };
  }

  const empresaId = await obtenerEmpresaIdActual();

  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
  if (!cliente) {
    return { success: false as const, error: "Cliente no encontrado." };
  }

  if (tipo === "aumentar") {
    try {
      const config = await obtenerConfiguracion();
      // Mismo criterio que en ventas/actions.ts: si el negocio no opera con
      // dólares, la cotización usada es siempre 1 (totalUSD queda espejando
      // a totalARS), sin importar qué haya cargado en Configuración.
      const cotizacionRaw = config.usaCotizacionUSD ? config.cotizacionUSD : 1;
      const cotizacion = cotizacionRaw > 0 ? cotizacionRaw : 1;

      await prisma.venta.create({
        data: {
          empresaId,
          clienteId,
          fecha: new Date(),
          cotizacionUsada: cotizacion,
          totalUSD: monto / cotizacion,
          totalARS: monto,
          montoPagado: 0,
          estadoPago: "A_CUENTA",
          armado: true,   // ← agregar: no es un pedido físico, no hay nada que armar
          retirado: true, // ← agregar: no es algo que el cliente "retire"
          items: {
            create: [
              {
                descripcionLibre: "Ajuste manual de deuda",
                cantidad: 1,
                precioUnitarioUSD: monto / cotizacion,
              },
            ],
          },
        },
      });

      revalidatePath("/clientes");
      return { success: true as const };
    } catch (e) {
      console.error(e);
      return { success: false as const, error: "No se pudo registrar el ajuste." };
    }
  }

  // tipo === "reducir"
  if (!cuentaId) {
    return { success: false as const, error: "Elegí una cuenta." };
  }

  try {
    const cuentaValida = await prisma.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
    if (!cuentaValida) {
      return { success: false as const, error: "La cuenta seleccionada no existe." };
    }

    let aplicadoTotal = 0;
    const esUSD = esCuentaUSD(cuentaValida.tipo);
    const factor = factorCuenta({ monto, montoUSD }, esUSD, await obtenerCotizacion());
    const enCuenta = (ars: number) => (esUSD ? redondearUSD(ars * factor) : ars);

    await prisma.$transaction(async (tx) => {
      const ventasPendientes = await tx.venta.findMany({
        where: { clienteId, empresaId, estadoPago: "A_CUENTA" },
        orderBy: { fecha: "asc" },
      });

      let restante = monto;
      const ventasTocadas: number[] = [];

      for (const venta of ventasPendientes) {
        if (restante <= 0) break;
        const pendiente = pendienteDeVenta(venta);
        if (pendiente < 0.5) continue;

        const aplicado = Math.min(restante, pendiente);
        const nuevoPendiente = pendiente - aplicado;
        const saldada = nuevoPendiente < 0.5;

        await tx.pagoVenta.create({
          data: { ventaId: venta.id, cuentaId, monto: enCuenta(aplicado), montoARS: aplicado },
        });

        await tx.venta.update({
          where: { id: venta.id },
          data: {
            montoPagado: redondearARS(venta.totalARS) - (saldada ? 0 : nuevoPendiente),
            estadoPago: saldada ? "PAGADA" : "A_CUENTA",
          },
        });

        ventasTocadas.push(venta.id);
        restante -= aplicado;
      }

      aplicadoTotal = monto - restante;

      if (aplicadoTotal <= 0.01) {
        throw new Error("SIN_DEUDA_PENDIENTE");
      }

      const cuenta = await tx.cuenta.update({
        where: { id: cuentaId },
        data: { saldoActual: { increment: enCuenta(aplicadoTotal) } },
      });

      await tx.movimientoCaja.create({
        data: {
          empresaId,
          cuentaId,
          tipo: "INGRESO",
          concepto: "OTRO",
          monto: enCuenta(aplicadoTotal),
          saldoResultante: cuenta.saldoActual,
          ventaId: ventasTocadas.length === 1 ? ventasTocadas[0] : null,
        },
      });
    });

    revalidatePath("/clientes");
    return { success: true as const, aplicado: aplicadoTotal };
  } catch (e) {
    if (e instanceof Error && e.message === "SIN_DEUDA_PENDIENTE") {
      return { success: false as const, error: "El cliente no tiene deuda pendiente para reducir." };
    }
    console.error(e);
    return { success: false as const, error: "Ocurrió un error al registrar el ajuste." };
  }
}