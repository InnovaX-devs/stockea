"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerUsuarioActual, requerirAdmin } from "@/lib/empresa";
import {
  ahora,
  aperturaDeHoy,
  asegurarAperturaAutomatica,
  sesionAbierta,
  ultimoMovimientoId,
} from "@/lib/caja";
import { fechaISOAR, inicioDiaAR } from "@/lib/timezone";

/**
 * Apertura y cierre de caja por turno (Básico y Premium).
 *
 * - El efectivo se CUENTA y la diferencia se ajusta siempre.
 * - Bancos / billeteras (solo admin, opcional): se carga el saldo que muestra
 *   la app; la diferencia queda registrada y se ajusta SOLO si se tilda
 *   (suele ser una transferencia sin acreditar, no plata perdida).
 * - "Esperado" lo calcula el servidor dentro de la transacción.
 * - Diferencia → AJUSTE_SALDO que deja la cuenta en lo contado.
 * - Al cerrar se indica cuánto QUEDA en la caja; el resto se RETIRA:
 *   "Retiro del dueño" (sale del sistema) o transferencia a otra cuenta.
 * - El empleado cierra a ciegas (no ve esperados ni diferencias).
 * - El admin puede anular el último cierre mientras la caja siga cerrada:
 *   revierte ajustes y retiros, y reabre el turno.
 */

type TipoCuenta = "EFECTIVO_ARS" | "EFECTIVO_USD" | "BANCO_ARS" | "BANCO_USD";
type Db = Prisma.TransactionClient;

const redondear = (n: number) => Math.round(n * 100) / 100;
const esEfectivo = (tipo: string) => tipo === "EFECTIVO_ARS" || tipo === "EFECTIVO_USD";
const monedaDe = (tipo: string) => (tipo.endsWith("USD") ? "USD" : "ARS");
export type Destino = "RETIRO" | number;

export type ResumenCuenta = { saldoInicio: number; ingresos: number; egresos: number; esperado: number };

export type EstadoCaja = {
  esAdmin: boolean;
  horaApertura: string;
  abierta: {
    desde: string;
    porNombre: string;
    automatica: boolean;
    desdeAyerOAntes: boolean;
    /** Sin movimientos todavía: se puede revisar el cambio de apertura. */
    puedeRevisarApertura: boolean;
  } | null;
  /** Si está cerrada: cuándo se abre sola. */
  proximaApertura: string | null;
  ultimoCierre: { fecha: string; usuarioNombre: string } | null;
  efectivo: { id: number; nombre: string; tipo: TipoCuenta; fondo: number | null; resumen: ResumenCuenta | null }[];
  /** Solo admin: bancos y billeteras, para revisarlos contra la app. */
  bancos: { id: number; nombre: string; tipo: TipoCuenta; resumen: ResumenCuenta }[];
  /** Cuentas a las que se puede transferir el retiro. */
  destinos: { id: number; nombre: string; tipo: TipoCuenta }[];
};

export type CierreHistorial = {
  id: number;
  fecha: string;
  abiertaFecha: string | null;
  abiertaPorNombre: string | null;
  usuarioNombre: string;
  observacion: string | null;
  anulado: boolean;
  anuladoFecha: string | null;
  anuladoPorNombre: string | null;
  puedeAnular: boolean;
  cuentas: {
    cuentaId: number;
    nombre: string;
    tipo: TipoCuenta;
    saldoInicio: number;
    ingresos: number;
    egresos: number;
    esperado: number;
    contado: number | null;
    diferencia: number | null;
    ajustado: boolean;
    queda: number | null;
    retiro: number | null;
    destinoNombre: string | null;
  }[];
};

type Error_ = { success: false; error: string };
type Resultado = { success: true } | Error_;
type ResultadoCierre = { success: true; data: { diferencias: { nombre: string; diferencia: number }[] | null } } | Error_;

async function nombreUsuario(id: number) {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: { nombre: true } });
  return u.nombre;
}

/** Movimientos por cuenta del turno (id > desdeMovimientoId). */
async function calcularPeriodo(db: Db, empresaId: number, desdeMovimientoId: number) {
  const cuentas = await db.cuenta.findMany({
    where: { empresaId, activa: true },
    orderBy: [{ favorita: "desc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, tipo: true, saldoActual: true },
  });
  const movimientos = await db.movimientoCaja.groupBy({
    by: ["cuentaId", "tipo"],
    where: { empresaId, id: { gt: desdeMovimientoId } },
    _sum: { monto: true },
  });
  return cuentas.map((c) => {
    const suma = (tipo: "INGRESO" | "EGRESO") =>
      redondear(movimientos.find((m) => m.cuentaId === c.id && m.tipo === tipo)?._sum.monto ?? 0);
    const ingresos = suma("INGRESO");
    const egresos = suma("EGRESO");
    const esperado = redondear(c.saldoActual);
    return {
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo as TipoCuenta,
      saldoInicio: redondear(esperado - ingresos + egresos),
      ingresos,
      egresos,
      esperado,
    };
  });
}

/** Ajusta el saldo de una cuenta a `nuevoSaldo` dejando el movimiento. */
async function ajustarSaldo(db: Db, empresaId: number, cuentaId: number, saldoActual: number, nuevoSaldo: number, detalle: string) {
  const diferencia = redondear(nuevoSaldo - saldoActual);
  if (diferencia === 0) return 0;
  // Se suma o resta la diferencia sobre el saldo de ESTE momento (no se pisa
  // con un valor fijo): si entra una venta en el mismo instante, no se pierde.
  const cuenta = await db.cuenta.update({ where: { id: cuentaId }, data: { saldoActual: { increment: diferencia } } });
  await db.movimientoCaja.create({
    data: {
      empresaId,
      cuentaId,
      tipo: diferencia > 0 ? "INGRESO" : "EGRESO",
      concepto: "AJUSTE_SALDO",
      monto: Math.abs(diferencia),
      saldoResultante: cuenta.saldoActual,
      detalle,
    },
  });
  return diferencia;
}

/** Aplica los conteos de apertura (solo efectivo). */
async function aplicarConteosApertura(db: Db, empresaId: number, conteos: { cuentaId: number; contado: number }[], quien: string) {
  const cuentas = await db.cuenta.findMany({ where: { empresaId, activa: true }, select: { id: true, tipo: true, saldoActual: true, nombre: true } });
  for (const conteo of conteos) {
    const cuenta = cuentas.find((c) => c.id === conteo.cuentaId);
    if (!cuenta || !esEfectivo(cuenta.tipo)) continue;
    const contado = redondear(Number(conteo.contado));
    if (!Number.isFinite(contado) || contado < 0) throw new Error(`El monto de "${cuenta.nombre}" no es válido.`);
    await ajustarSaldo(db, empresaId, cuenta.id, cuenta.saldoActual, contado, `Apertura de caja: cambio contado (${quien})`);
  }
}

export async function obtenerEstadoCaja(): Promise<EstadoCaja> {
  const usuario = await obtenerUsuarioActual();
  const esAdmin = usuario.rol === "ADMIN";
  const sesion = await asegurarAperturaAutomatica(usuario.empresaId);

  const [config, ultimo] = await Promise.all([
    prisma.configuracion.findUnique({ where: { empresaId: usuario.empresaId }, select: { horaAperturaCaja: true } }),
    prisma.cierreCaja.findFirst({ where: { empresaId: usuario.empresaId, anulado: false }, orderBy: { id: "desc" } }),
  ]);
  const horaApertura = config?.horaAperturaCaja ?? "07:00";

  const desde = sesion?.aperturaMovimientoId ?? (await ultimoMovimientoId(prisma as unknown as Db, usuario.empresaId));
  const periodo = await calcularPeriodo(prisma as unknown as Db, usuario.empresaId, desde);
  const efectivo = periodo.filter((c) => esEfectivo(c.tipo));
  const otros = periodo.filter((c) => !esEfectivo(c.tipo));

  let proximaApertura: string | null = null;
  if (!sesion) {
    const hoy = aperturaDeHoy(horaApertura);
    const manana = aperturaDeHoy(horaApertura, new Date(hoy.getTime() + 24 * 60 * 60 * 1000));
    proximaApertura = (ahora() < hoy ? hoy : manana).toISOString();
  }

  return {
    esAdmin,
    horaApertura,
    abierta: sesion
      ? {
          desde: sesion.abiertaFecha.toISOString(),
          porNombre: sesion.abiertaPorNombre,
          automatica: sesion.aperturaAutomatica,
          desdeAyerOAntes: sesion.abiertaFecha < inicioDiaAR(fechaISOAR(ahora())),
          puedeRevisarApertura: esAdmin && periodo.every((c) => c.ingresos === 0 && c.egresos === 0),
        }
      : null,
    proximaApertura,
    ultimoCierre: ultimo ? { fecha: ultimo.fecha.toISOString(), usuarioNombre: ultimo.usuarioNombre } : null,
    efectivo: efectivo.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      // El empleado cierra a ciegas: no ve saldos ni esperados.
      fondo: esAdmin ? c.esperado : null,
      resumen: esAdmin && sesion ? { saldoInicio: c.saldoInicio, ingresos: c.ingresos, egresos: c.egresos, esperado: c.esperado } : null,
    })),
    bancos:
      esAdmin && sesion
        ? otros.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            tipo: c.tipo,
            resumen: { saldoInicio: c.saldoInicio, ingresos: c.ingresos, egresos: c.egresos, esperado: c.esperado },
          }))
        : [],
    destinos: periodo.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
  };
}

/** Para Nueva venta: ¿está abierta? (abre sola si ya es hora). */
export async function estadoCajaParaVenta(): Promise<{ abierta: boolean; horaApertura: string }> {
  const usuario = await obtenerUsuarioActual();
  const sesion = await asegurarAperturaAutomatica(usuario.empresaId);
  const config = await prisma.configuracion.findUnique({
    where: { empresaId: usuario.empresaId },
    select: { horaAperturaCaja: true },
  });
  return { abierta: sesion != null, horaApertura: config?.horaAperturaCaja ?? "07:00" };
}

/** Abrir caja a mano. El admin puede además cargar el cambio contado. */
export async function abrirCaja(input: { conteos?: { cuentaId: number; contado: number }[] } = {}): Promise<Resultado> {
  try {
    const usuario = await obtenerUsuarioActual();
    const nombre = await nombreUsuario(usuario.id);
    await prisma.$transaction(async (tx) => {
      if (await sesionAbierta(tx, usuario.empresaId)) throw new Error("La caja ya está abierta.");
      if (usuario.rol === "ADMIN" && input.conteos?.length) {
        await aplicarConteosApertura(tx, usuario.empresaId, input.conteos, nombre);
      }
      await tx.sesionCaja.create({
        data: {
          empresaId: usuario.empresaId,
          abiertaPorNombre: nombre,
          aperturaAutomatica: false,
          aperturaMovimientoId: await ultimoMovimientoId(tx, usuario.empresaId),
        },
      });
    });
    revalidatePath("/finanzas/cierre-caja");
    revalidatePath("/ventas");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo abrir la caja." };
  }
}

/** Corregir el cambio de apertura (solo admin, antes del primer movimiento). */
export async function revisarApertura(conteos: { cuentaId: number; contado: number }[]): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();
    const nombre = await nombreUsuario(admin.id);
    await prisma.$transaction(async (tx) => {
      const sesion = await sesionAbierta(tx, admin.empresaId);
      if (!sesion) throw new Error("La caja está cerrada.");
      const hayMovimientos = await tx.movimientoCaja.count({
        where: { empresaId: admin.empresaId, id: { gt: sesion.aperturaMovimientoId } },
      });
      if (hayMovimientos > 0) throw new Error("Ya hubo movimientos en este turno: corregí la diferencia al cerrar.");
      await aplicarConteosApertura(tx, admin.empresaId, conteos, nombre);
      // Los ajustes de apertura no son parte del turno.
      await tx.sesionCaja.update({
        where: { id: sesion.id },
        data: { aperturaMovimientoId: await ultimoMovimientoId(tx, admin.empresaId) },
      });
    });
    revalidatePath("/finanzas/cierre-caja");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo revisar la apertura." };
  }
}

export async function registrarCierre(input: {
  cuentas: { cuentaId: number; contado: number | null; queda?: number | null; destino?: Destino; ajustar?: boolean }[];
  observacion?: string;
}): Promise<ResultadoCierre> {
  try {
    const usuario = await obtenerUsuarioActual();
    const esAdmin = usuario.rol === "ADMIN";
    const usuarioNombre = await nombreUsuario(usuario.id);
    const porCuenta = new Map(input.cuentas.map((c) => [c.cuentaId, c]));

    const diferencias = await prisma.$transaction(async (tx) => {
      const sesion = await sesionAbierta(tx, usuario.empresaId);
      if (!sesion) throw new Error("La caja ya está cerrada.");

      // Solo cuentas activas de ESTA empresa: ids de otra empresa se ignoran.
      const periodo = await calcularPeriodo(tx, usuario.empresaId, sesion.aperturaMovimientoId);
      const items = periodo.map((c) => {
        const dato = porCuenta.get(c.id);
        const vacio = { ...c, contado: null, diferencia: null, ajustar: false, queda: null, retiro: null, destino: null as Destino | null };
        if (dato?.contado == null) return vacio;

        // Banco / billetera: solo el admin (el empleado no ve saldos), sin retiro.
        if (!esEfectivo(c.tipo)) {
          if (!esAdmin) return vacio;
          const saldoReal = redondear(Number(dato.contado));
          if (!Number.isFinite(saldoReal)) throw new Error(`El saldo cargado en "${c.nombre}" no es válido.`);
          const diferencia = redondear(saldoReal - c.esperado);
          return { ...c, contado: saldoReal, diferencia, ajustar: diferencia !== 0 && dato.ajustar === true, queda: null, retiro: null, destino: null };
        }

        const contado = redondear(Number(dato.contado));
        if (!Number.isFinite(contado) || contado < 0) throw new Error(`El efectivo contado en "${c.nombre}" no es válido.`);
        const queda = dato.queda == null ? contado : redondear(Number(dato.queda));
        if (!Number.isFinite(queda) || queda < 0 || queda > contado) {
          throw new Error(`En "${c.nombre}", lo que queda en caja tiene que estar entre $0 y lo contado.`);
        }
        return {
          ...c,
          contado,
          diferencia: redondear(contado - c.esperado),
          ajustar: true, // el efectivo se ajusta siempre
          queda,
          retiro: redondear(contado - queda),
          destino: (dato.destino ?? "RETIRO") as Destino,
        };
      });
      if (!items.some((it) => it.contado != null)) throw new Error("Revisá al menos una cuenta para cerrar la caja.");

      const guardados = [];
      for (const it of items) {
        if (it.contado == null) {
          guardados.push({ ...it, destinoCuentaId: null as number | null, destinoNombre: null as string | null });
          continue;
        }
        // 1) Diferencia → la cuenta queda en lo contado (bancos: solo si se tildó).
        if (it.ajustar) {
          await ajustarSaldo(
            tx, usuario.empresaId, it.id, it.esperado, it.contado,
            `Cierre de caja: ${it.diferencia! > 0 ? "sobrante" : "faltante"} (cerró ${usuarioNombre})`
          );
        }
        // 2) Retiro → queda en la caja solo lo indicado.
        let destinoCuentaId: number | null = null;
        let destinoNombre: string | null = null;
        if (it.retiro! > 0) {
          if (it.destino === "RETIRO") {
            destinoNombre = "Retiro del dueño";
            const cajaTrasRetiro = await tx.cuenta.update({ where: { id: it.id }, data: { saldoActual: { decrement: it.retiro! } } });
            await tx.movimientoCaja.create({
              data: {
                empresaId: usuario.empresaId, cuentaId: it.id, tipo: "EGRESO", concepto: "OTRO",
                monto: it.retiro!, saldoResultante: cajaTrasRetiro.saldoActual, detalle: `Retiro de caja al cierre (${usuarioNombre})`,
              },
            });
          } else {
            const destino = periodo.find((d) => d.id === it.destino);
            if (!destino || destino.id === it.id) throw new Error(`Elegí a dónde va el retiro de "${it.nombre}".`);
            if (monedaDe(destino.tipo) !== monedaDe(it.tipo)) throw new Error(`"${destino.nombre}" es de otra moneda que "${it.nombre}".`);
            destinoCuentaId = destino.id;
            destinoNombre = destino.nombre;
            const cajaTrasRetiro = await tx.cuenta.update({ where: { id: it.id }, data: { saldoActual: { decrement: it.retiro! } } });
            await tx.movimientoCaja.create({
              data: {
                empresaId: usuario.empresaId, cuentaId: it.id, tipo: "EGRESO", concepto: "TRANSFERENCIA",
                monto: it.retiro!, saldoResultante: cajaTrasRetiro.saldoActual, detalle: `Retiro de caja a ${destino.nombre}`,
              },
            });
            const cuentaDestino = await tx.cuenta.update({
              where: { id: destino.id },
              data: { saldoActual: { increment: it.retiro! } },
            });
            await tx.movimientoCaja.create({
              data: {
                empresaId: usuario.empresaId, cuentaId: destino.id, tipo: "INGRESO", concepto: "TRANSFERENCIA",
                monto: it.retiro!, saldoResultante: cuentaDestino.saldoActual, detalle: `Retiro de caja de ${it.nombre}`,
              },
            });
          }
        }
        guardados.push({ ...it, destinoCuentaId, destinoNombre });
      }

      const cerradaFecha = ahora();
      await tx.cierreCaja.create({
        data: {
          empresaId: usuario.empresaId,
          sesionId: sesion.id,
          usuarioId: usuario.id,
          usuarioNombre,
          observacion: input.observacion?.trim() || null,
          ultimoMovimientoId: await ultimoMovimientoId(tx, usuario.empresaId),
          cuentas: {
            create: guardados.map((it) => ({
              cuentaId: it.id,
              saldoInicio: it.saldoInicio,
              ingresos: it.ingresos,
              egresos: it.egresos,
              esperado: it.esperado,
              contado: it.contado,
              diferencia: it.diferencia,
              ajustado: it.ajustar && it.diferencia != null && it.diferencia !== 0,
              queda: it.queda,
              retiro: it.retiro,
              destinoCuentaId: it.destinoCuentaId,
              destinoNombre: it.destinoNombre,
            })),
          },
        },
      });
      await tx.sesionCaja.update({ where: { id: sesion.id }, data: { cerradaFecha } });

      return guardados
        .filter((it) => it.diferencia != null && it.diferencia !== 0)
        .map((it) => ({ nombre: it.nombre, diferencia: it.diferencia! }));
    });

    revalidatePath("/finanzas/cierre-caja");
    revalidatePath("/finanzas");
    return { success: true, data: { diferencias: esAdmin ? diferencias : null } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo cerrar la caja." };
  }
}

export async function listarCierres(): Promise<CierreHistorial[]> {
  const admin = await requerirAdmin();
  const [cierres, abierta] = await Promise.all([
    prisma.cierreCaja.findMany({
      where: { empresaId: admin.empresaId },
      orderBy: { id: "desc" },
      take: 30,
      include: {
        sesion: { select: { abiertaFecha: true, abiertaPorNombre: true } },
        cuentas: { include: { cuenta: { select: { nombre: true, tipo: true } } } },
      },
    }),
    sesionAbierta(prisma as unknown as Db, admin.empresaId),
  ]);
  const ultimoVigenteId = cierres.find((c) => !c.anulado)?.id;

  return cierres.map((c) => ({
    id: c.id,
    fecha: c.fecha.toISOString(),
    abiertaFecha: c.sesion?.abiertaFecha.toISOString() ?? null,
    abiertaPorNombre: c.sesion?.abiertaPorNombre ?? null,
    usuarioNombre: c.usuarioNombre,
    observacion: c.observacion,
    anulado: c.anulado,
    anuladoFecha: c.anuladoFecha?.toISOString() ?? null,
    anuladoPorNombre: c.anuladoPorNombre,
    // Solo el último, y solo mientras no se haya abierto otro turno.
    puedeAnular: c.id === ultimoVigenteId && !abierta,
    cuentas: c.cuentas.map((it) => ({
      cuentaId: it.cuentaId,
      nombre: it.cuenta.nombre,
      tipo: it.cuenta.tipo as TipoCuenta,
      saldoInicio: it.saldoInicio,
      ingresos: it.ingresos,
      egresos: it.egresos,
      esperado: it.esperado,
      contado: it.contado,
      diferencia: it.diferencia,
      ajustado: it.ajustado,
      queda: it.queda,
      retiro: it.retiro,
      destinoNombre: it.destinoNombre,
    })),
  }));
}

/** Anula el último cierre: revierte ajustes y retiros y reabre el turno. */
export async function anularUltimoCierre(cierreId: number): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();
    const nombre = await nombreUsuario(admin.id);

    await prisma.$transaction(async (tx) => {
      const ultimo = await tx.cierreCaja.findFirst({ where: { empresaId: admin.empresaId, anulado: false }, orderBy: { id: "desc" } });
      if (!ultimo || ultimo.id !== cierreId) throw new Error("Solo se puede anular el último cierre.");
      if (await sesionAbierta(tx, admin.empresaId)) {
        throw new Error("Ya se abrió otro turno de caja: el cierre anterior no se puede anular.");
      }

      const items = await tx.cierreCajaCuenta.findMany({ where: { cierreId } });
      for (const it of items) {
        // Se revierte sobre el saldo de HOY (respeta lo que pasó después).
        const revertir = async (cuentaId: number, monto: number, detalle: string, concepto: "AJUSTE_SALDO" | "OTRO" | "TRANSFERENCIA") => {
          if (monto === 0) return;
          const cuenta = await tx.cuenta.update({ where: { id: cuentaId }, data: { saldoActual: { increment: monto } } });
          await tx.movimientoCaja.create({
            data: {
              empresaId: admin.empresaId, cuentaId, tipo: monto > 0 ? "INGRESO" : "EGRESO", concepto,
              monto: Math.abs(monto), saldoResultante: cuenta.saldoActual, detalle,
            },
          });
        };
        // Solo se revierte lo que se ajustó (una diferencia de banco solo registrada no tocó el saldo).
        if (it.diferencia && it.ajustado) await revertir(it.cuentaId, -it.diferencia, `Anulación del cierre de caja #${cierreId}`, "AJUSTE_SALDO");
        if (it.retiro) {
          if (it.destinoCuentaId == null) {
            await revertir(it.cuentaId, it.retiro, `Anulación del retiro del cierre #${cierreId}`, "OTRO");
          } else {
            await revertir(it.destinoCuentaId, -it.retiro, `Anulación del retiro del cierre #${cierreId}`, "TRANSFERENCIA");
            await revertir(it.cuentaId, it.retiro, `Anulación del retiro del cierre #${cierreId}`, "TRANSFERENCIA");
          }
        }
      }

      await tx.cierreCaja.update({
        where: { id: cierreId },
        data: { anulado: true, anuladoFecha: ahora(), anuladoPorNombre: nombre },
      });
      // Reabre el turno que había cerrado (los cierres viejos no tienen turno).
      if (ultimo.sesionId) {
        await tx.sesionCaja.update({ where: { id: ultimo.sesionId }, data: { cerradaFecha: null } });
      }
    });

    revalidatePath("/finanzas/cierre-caja");
    revalidatePath("/finanzas");
    revalidatePath("/ventas");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo anular el cierre." };
  }
}
