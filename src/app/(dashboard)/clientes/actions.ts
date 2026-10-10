"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getHistorialDeuda } from "@/lib/clientes";
import { obtenerEmpresaIdActual, requerirAdmin } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { mensajeSiCajaCerrada } from "@/lib/caja";
import { obtenerSucursalIdActual, requerirSucursalId } from "@/lib/sucursal";
import { validarCuentaParaSucursal, sucursalDelMovimiento } from "@/lib/cuenta-sucursal";
import { normalizarCuit } from "@/lib/arca/certificado";
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
  // Fuera del try: si no, el catch respondía "tiene ventas asociadas" a
  // cualquier error, incluido "no tenés permiso".
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
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
  // Datos para facturar (opcionales). Sin documento → Consumidor Final.
  tipoDocumento?: "CUIT" | "CUIL" | "DNI" | null;
  numeroDocumento?: string | null;
  condicionIva?: "CONSUMIDOR_FINAL" | "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO" | "EXENTO" | null;
};

/**
 * Documento para facturar: CUIT/CUIL con dígito verificador válido, DNI de
 * 7 u 8 números. Devuelve los campos listos para guardar, o un error.
 * Si `data` no trae estos campos (pantallas viejas), no se tocan.
 */
function documentoParaGuardar(data: ClienteInput):
  | { ok: true; campos: { tipoDocumento?: "CUIT" | "CUIL" | "DNI" | null; numeroDocumento?: string | null; condicionIva?: ClienteInput["condicionIva"] } }
  | { ok: false; error: string } {
  if (data.tipoDocumento === undefined && data.numeroDocumento === undefined && data.condicionIva === undefined) {
    return { ok: true, campos: {} };
  }
  const numero = (data.numeroDocumento ?? "").replace(/[\s.-]/g, "");
  if (!data.tipoDocumento || !numero) {
    return { ok: true, campos: { tipoDocumento: null, numeroDocumento: null, condicionIva: "CONSUMIDOR_FINAL" } };
  }
  if (data.tipoDocumento === "DNI") {
    if (!/^\d{7,8}$/.test(numero)) return { ok: false, error: "El DNI tiene que tener 7 u 8 números." };
    return { ok: true, campos: { tipoDocumento: "DNI", numeroDocumento: numero, condicionIva: "CONSUMIDOR_FINAL" } };
  }
  const cuit = normalizarCuit(numero);
  if (!cuit) return { ok: false, error: `El ${data.tipoDocumento} no es válido (revisá los 11 números).` };
  return {
    ok: true,
    campos: { tipoDocumento: data.tipoDocumento, numeroDocumento: cuit, condicionIva: data.condicionIva ?? "CONSUMIDOR_FINAL" },
  };
}

function validarCliente(data: ClienteInput) {
  if (!data.nombre?.trim()) {
    return "El nombre es obligatorio.";
  }
  const doc = documentoParaGuardar(data);
  if (!doc.ok) return doc.error;
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
        ...(documentoParaGuardar(data) as { ok: true; campos: object }).campos,
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
        ...(documentoParaGuardar(data) as { ok: true; campos: object }).campos,
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

  const cajaCerrada = await mensajeSiCajaCerrada(await obtenerEmpresaIdActual());
  if (cajaCerrada) return { success: false as const, error: cajaCerrada };

  // El cobro pasa en una sucursal concreta (ahí entra la plata).
  let sucursalId: number;
  try {
    sucursalId = await requerirSucursalId();
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "Elegí una sucursal." };
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

      // No se puede cobrar más de lo que se debe: si no, la cuenta sumaría
      // solo la deuda pero el cajero habría recibido más plata (y el cierre
      // de caja daría un sobrante sin explicación).
      const deudaTotal = [...pendientePorVenta.values()].reduce((a, b) => a + b, 0);
      const totalCobro = pagosValidos.reduce((a, p) => a + p.monto, 0);
      if (deudaTotal < 0.5) throw new Error("COBRO:El cliente no tiene deuda pendiente.");
      if (totalCobro > deudaTotal + 0.5) {
        throw new Error(
          `COBRO:El cobro ($${totalCobro.toLocaleString("es-AR")}) supera la deuda del cliente ($${deudaTotal.toLocaleString("es-AR")}).`
        );
      }

      // Los cambios a pagos y ventas se juntan en memoria y se guardan al
      // final en 2 consultas, sin importar cuántas ventas pendientes tenga el
      // cliente (antes eran 2 consultas por venta y una deuda con muchas
      // ventas podía vencer el tiempo de la transacción).
      const pagosVenta: Prisma.PagoVentaCreateManyInput[] = [];
      const ventasActualizadas = new Map<number, { montoPagado: number; estadoPago: "PAGADA" | "A_CUENTA" }>();

      for (const pago of pagosValidos) {
        const cuentaValida = await tx.cuenta.findFirst({ where: { id: pago.cuentaId, empresaId } });
        if (!cuentaValida) throw new Error("CUENTA_NO_ENCONTRADA");
        try {
          await validarCuentaParaSucursal(tx, empresaId, pago.cuentaId, sucursalId);
        } catch (e) {
          throw new Error("COBRO:" + (e instanceof Error ? e.message : "Cuenta inválida."));
        }

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

          pagosVenta.push({ ventaId: venta.id, cuentaId: pago.cuentaId, monto: enCuenta(aplicado), montoARS: aplicado });
          ventasActualizadas.set(venta.id, {
            montoPagado: redondearARS(venta.totalARS) - (saldada ? 0 : nuevoPendiente),
            estadoPago: saldada ? "PAGADA" : "A_CUENTA",
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
              sucursalId,
            },
          });
        }
      }

      if (pagosVenta.length > 0) await tx.pagoVenta.createMany({ data: pagosVenta });
      if (ventasActualizadas.size > 0) {
        const filas = Prisma.join(
          [...ventasActualizadas.entries()].map(
            ([id, v]) => Prisma.sql`(${id}::int, ${v.montoPagado}::float8, ${v.estadoPago}::text)`
          )
        );
        await tx.$executeRaw`
          UPDATE "Venta" AS v
          SET "montoPagado" = x.monto, "estadoPago" = x.estado::"EstadoPago"
          FROM (VALUES ${filas}) AS x(id, monto, estado)
          WHERE v.id = x.id AND v."empresaId" = ${empresaId}`;
      }
    });

    revalidatePath("/clientes");
    return { success: true as const };
  } catch (e) {
    console.error(e);
    if (e instanceof Error && e.message.startsWith("COBRO:")) {
      return { success: false as const, error: e.message.slice("COBRO:".length) };
    }
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
  await requerirAdmin(); // solo admin (ver src/lib/permisos.ts)
  const { clienteId, tipo, cuentaId, montoUSD } = input;
  const monto = redondearARS(input.monto);

  if (!monto || monto <= 0) {
    return { success: false as const, error: "Ingresá un monto mayor a $0." };
  }

  const empresaId = await obtenerEmpresaIdActual();
  // Sucursal elegida (null en "Todas": ajuste de la empresa).
  const sucursalId = await obtenerSucursalIdActual();

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
          sucursalId,
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
    try {
      await validarCuentaParaSucursal(prisma, empresaId, cuentaId, sucursalId);
    } catch (e) {
      return { success: false as const, error: e instanceof Error ? e.message : "Cuenta inválida." };
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
          sucursalId: sucursalDelMovimiento(sucursalId, cuentaValida.sucursalId),
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