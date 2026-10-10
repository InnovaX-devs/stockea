"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerUsuarioActual, requerirAdmin } from "@/lib/empresa";
import {
  ahora,
  aperturaDeHoy,
  asegurarAperturaAutomatica,
  NOMBRE_TURNO_SIGUIENTE,
  sesionAbierta,
  ultimoMovimientoId,
} from "@/lib/caja";
import { fechaISOAR, inicioDiaAR } from "@/lib/timezone";
import { obtenerContextoSucursal, requerirSucursalId } from "@/lib/sucursal";
import { filtroCuentasDeSucursal } from "@/lib/cuenta-sucursal";

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
 * - Turno continuo (Configuracion.cajaTurnoContinuo, negocios 24 h): al cerrar
 *   se abre el turno siguiente en el momento. El cierre se puede anular
 *   mientras ese turno nuevo no tenga movimientos.
 * - Por sucursal (issue #34): cada sucursal abre y cierra su caja. Se cuentan
 *   sus cuentas y las compartidas; de las compartidas, solo los movimientos
 *   de esa sucursal. Con una sola sucursal todo funciona igual que antes.
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
  /** La empresa tiene más de una sucursal. */
  multisucursal: boolean;
  /** Sucursal de esta caja; null si el admin eligió "Todas" (no hay caja que mostrar). */
  sucursal: { id: number; nombre: string } | null;
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
  sucursalNombre: string | null;
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

/** Caja de una sucursal: cuál es y si la empresa tiene varias. */
type CajaSucursal = { sucursalId: number; multisucursal: boolean };

/** Caja de la sucursal en la que se está trabajando (lanza en "Todas"). */
async function cajaActual(): Promise<CajaSucursal> {
  const sucursalId = await requerirSucursalId();
  const { multisucursal } = await obtenerContextoSucursal();
  return { sucursalId, multisucursal };
}

/** Cuentas que se cuentan en la caja de la sucursal (propias y compartidas). */
function filtroCuentas(caja: CajaSucursal): Prisma.CuentaWhereInput {
  return caja.multisucursal ? filtroCuentasDeSucursal(caja.sucursalId) : {};
}

/**
 * Movimientos del turno de la sucursal: todos los de sus cuentas, y de las
 * compartidas solo los hechos en esta sucursal. Con una sola sucursal, todos.
 */
function filtroMovimientos(caja: CajaSucursal): Prisma.MovimientoCajaWhereInput {
  if (!caja.multisucursal) return {};
  return { OR: [{ cuenta: { sucursalId: caja.sucursalId } }, { sucursalId: caja.sucursalId }] };
}

/**
 * ¿El turno abierto es el que se abrió solo al cerrar el anterior y todavía
 * no tiene movimientos? En ese caso no impide anular el cierre anterior.
 */
async function esTurnoSiguienteVacio(
  db: Db,
  empresaId: number,
  sesion: { aperturaAutomatica: boolean; abiertaPorNombre: string; aperturaMovimientoId: number },
  caja: CajaSucursal
) {
  if (!sesion.aperturaAutomatica || sesion.abiertaPorNombre !== NOMBRE_TURNO_SIGUIENTE) return false;
  const movimientos = await db.movimientoCaja.count({
    where: { empresaId, id: { gt: sesion.aperturaMovimientoId }, ...filtroMovimientos(caja) },
  });
  return movimientos === 0;
}

type Error_ = { success: false; error: string };
type Resultado = { success: true } | Error_;
type ResultadoCierre =
  | { success: true; data: { diferencias: { nombre: string; diferencia: number }[] | null; abrioSiguienteTurno: boolean } }
  | Error_;

async function nombreUsuario(id: number) {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: { nombre: true } });
  return u.nombre;
}

/** Movimientos por cuenta del turno (id > desdeMovimientoId). */
async function calcularPeriodo(db: Db, empresaId: number, caja: CajaSucursal, desdeMovimientoId: number) {
  const cuentas = await db.cuenta.findMany({
    where: { empresaId, activa: true, ...filtroCuentas(caja) },
    orderBy: [{ favorita: "desc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, tipo: true, saldoActual: true },
  });
  const movimientos = await db.movimientoCaja.groupBy({
    by: ["cuentaId", "tipo"],
    where: { empresaId, id: { gt: desdeMovimientoId }, ...filtroMovimientos(caja) },
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
async function ajustarSaldo(db: Db, empresaId: number, sucursalId: number, cuentaId: number, saldoActual: number, nuevoSaldo: number, detalle: string) {
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
      sucursalId,
    },
  });
  return diferencia;
}

/** Aplica los conteos de apertura (solo efectivo). */
async function aplicarConteosApertura(db: Db, empresaId: number, caja: CajaSucursal, conteos: { cuentaId: number; contado: number }[], quien: string) {
  const cuentas = await db.cuenta.findMany({
    where: { empresaId, activa: true, ...filtroCuentas(caja) },
    select: { id: true, tipo: true, saldoActual: true, nombre: true },
  });
  for (const conteo of conteos) {
    const cuenta = cuentas.find((c) => c.id === conteo.cuentaId);
    if (!cuenta || !esEfectivo(cuenta.tipo)) continue;
    const contado = redondear(Number(conteo.contado));
    if (!Number.isFinite(contado) || contado < 0) throw new Error(`El monto de "${cuenta.nombre}" no es válido.`);
    await ajustarSaldo(db, empresaId, caja.sucursalId, cuenta.id, cuenta.saldoActual, contado, `Apertura de caja: cambio contado (${quien})`);
  }
}

export async function obtenerEstadoCaja(): Promise<EstadoCaja> {
  const usuario = await obtenerUsuarioActual();
  const esAdmin = usuario.rol === "ADMIN";
  const contexto = await obtenerContextoSucursal();
  const config = await prisma.configuracion.findUnique({
    where: { empresaId: usuario.empresaId },
    select: { horaAperturaCaja: true, cajaTurnoContinuo: true },
  });
  const horaApertura = config?.horaAperturaCaja ?? "07:00";

  // "Todas las sucursales": no hay una caja que mostrar, solo el historial.
  if (!contexto.actual) {
    return {
      esAdmin, multisucursal: contexto.multisucursal, sucursal: null, horaApertura,
      abierta: null, proximaApertura: null, ultimoCierre: null, efectivo: [], bancos: [], destinos: [],
    };
  }
  const caja: CajaSucursal = { sucursalId: contexto.actual.id, multisucursal: contexto.multisucursal };
  const sesion = await asegurarAperturaAutomatica(usuario.empresaId, caja.sucursalId);
  const ultimo = await prisma.cierreCaja.findFirst({
    where: { empresaId: usuario.empresaId, sucursalId: caja.sucursalId, anulado: false },
    orderBy: { id: "desc" },
  });

  const desde = sesion?.aperturaMovimientoId ?? (await ultimoMovimientoId(prisma as unknown as Db, usuario.empresaId));
  const periodo = await calcularPeriodo(prisma as unknown as Db, usuario.empresaId, caja, desde);
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
    multisucursal: contexto.multisucursal,
    sucursal: { id: contexto.actual.id, nombre: contexto.actual.nombre },
    horaApertura,
    abierta: sesion
      ? {
          desde: sesion.abiertaFecha.toISOString(),
          porNombre: sesion.abiertaPorNombre,
          automatica: sesion.aperturaAutomatica,
          // En un negocio de turno continuo es normal pasar la medianoche abierta.
          desdeAyerOAntes: !config?.cajaTurnoContinuo && sesion.abiertaFecha < inicioDiaAR(fechaISOAR(ahora())),
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
  const { actual } = await obtenerContextoSucursal();
  // En "Todas" no se vende (lo frena la venta misma): no hay aviso de caja.
  if (!actual) return { abierta: true, horaApertura: "07:00" };
  const sesion = await asegurarAperturaAutomatica(usuario.empresaId, actual.id);
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
    const caja = await cajaActual();
    await prisma.$transaction(async (tx) => {
      if (await sesionAbierta(tx, usuario.empresaId, caja.sucursalId)) throw new Error("La caja ya está abierta.");
      if (usuario.rol === "ADMIN" && input.conteos?.length) {
        await aplicarConteosApertura(tx, usuario.empresaId, caja, input.conteos, nombre);
      }
      await tx.sesionCaja.create({
        data: {
          empresaId: usuario.empresaId,
          sucursalId: caja.sucursalId,
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
    const caja = await cajaActual();
    await prisma.$transaction(async (tx) => {
      const sesion = await sesionAbierta(tx, admin.empresaId, caja.sucursalId);
      if (!sesion) throw new Error("La caja está cerrada.");
      const hayMovimientos = await tx.movimientoCaja.count({
        where: { empresaId: admin.empresaId, id: { gt: sesion.aperturaMovimientoId }, ...filtroMovimientos(caja) },
      });
      if (hayMovimientos > 0) throw new Error("Ya hubo movimientos en este turno: corregí la diferencia al cerrar.");
      await aplicarConteosApertura(tx, admin.empresaId, caja, conteos, nombre);
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
    const caja = await cajaActual();
    const config = await prisma.configuracion.findUnique({
      where: { empresaId: usuario.empresaId },
      select: { cajaTurnoContinuo: true },
    });
    const abrirSiguiente = config?.cajaTurnoContinuo === true;

    const diferencias = await prisma.$transaction(async (tx) => {
      const sesion = await sesionAbierta(tx, usuario.empresaId, caja.sucursalId);
      if (!sesion) throw new Error("La caja ya está cerrada.");

      // Solo cuentas activas de ESTA empresa y sucursal: otros ids se ignoran.
      const periodo = await calcularPeriodo(tx, usuario.empresaId, caja, sesion.aperturaMovimientoId);
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
            tx, usuario.empresaId, caja.sucursalId, it.id, it.esperado, it.contado,
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
                sucursalId: caja.sucursalId,
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
                sucursalId: caja.sucursalId,
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
                sucursalId: caja.sucursalId,
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
          sucursalId: caja.sucursalId,
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

      // Turno continuo: el siguiente queda abierto ya (después de los ajustes y
      // retiros del cierre, que no son parte del turno nuevo).
      if (abrirSiguiente) {
        await tx.sesionCaja.create({
          data: {
            empresaId: usuario.empresaId,
            sucursalId: caja.sucursalId,
            abiertaPorNombre: NOMBRE_TURNO_SIGUIENTE,
            aperturaAutomatica: true,
            aperturaMovimientoId: await ultimoMovimientoId(tx, usuario.empresaId),
          },
        });
      }

      return guardados
        .filter((it) => it.diferencia != null && it.diferencia !== 0)
        .map((it) => ({ nombre: it.nombre, diferencia: it.diferencia! }));
    });

    revalidatePath("/finanzas/cierre-caja");
    revalidatePath("/finanzas");
    return { success: true, data: { diferencias: esAdmin ? diferencias : null, abrioSiguienteTurno: abrirSiguiente } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo cerrar la caja." };
  }
}

export async function listarCierres(): Promise<CierreHistorial[]> {
  const admin = await requerirAdmin();
  // Los de la sucursal elegida; en "Todas", los de todas (con su nombre).
  const { actual } = await obtenerContextoSucursal();
  const [cierres, abiertas] = await Promise.all([
    prisma.cierreCaja.findMany({
      where: { empresaId: admin.empresaId, ...(actual ? { sucursalId: actual.id } : {}) },
      orderBy: { id: "desc" },
      take: 30,
      include: {
        sucursal: { select: { nombre: true } },
        sesion: { select: { abiertaFecha: true, abiertaPorNombre: true } },
        cuentas: { include: { cuenta: { select: { nombre: true, tipo: true } } } },
      },
    }),
    prisma.sesionCaja.findMany({
      where: { empresaId: admin.empresaId, cerradaFecha: null },
      select: { sucursalId: true, aperturaAutomatica: true, abiertaPorNombre: true, aperturaMovimientoId: true },
    }),
  ]);
  // Último cierre vigente de cada sucursal, y qué sucursales tienen la caja abierta.
  const ultimoVigentePorSucursal = new Map<number | null, number>();
  for (const c of cierres) {
    if (!c.anulado && !ultimoVigentePorSucursal.has(c.sucursalId)) ultimoVigentePorSucursal.set(c.sucursalId, c.id);
  }
  // Un turno abierto impide anular el cierre anterior, salvo que sea el turno
  // siguiente automático y siga vacío.
  const { multisucursal } = await obtenerContextoSucursal();
  const conCajaAbierta = new Set<number | null>();
  for (const a of abiertas) {
    const vacio =
      a.sucursalId != null &&
      (await esTurnoSiguienteVacio(prisma as unknown as Db, admin.empresaId, a, { sucursalId: a.sucursalId, multisucursal }));
    if (!vacio) conCajaAbierta.add(a.sucursalId);
  }

  return cierres.map((c) => ({
    id: c.id,
    sucursalNombre: c.sucursal?.nombre ?? null,
    fecha: c.fecha.toISOString(),
    abiertaFecha: c.sesion?.abiertaFecha.toISOString() ?? null,
    abiertaPorNombre: c.sesion?.abiertaPorNombre ?? null,
    usuarioNombre: c.usuarioNombre,
    observacion: c.observacion,
    anulado: c.anulado,
    anuladoFecha: c.anuladoFecha?.toISOString() ?? null,
    anuladoPorNombre: c.anuladoPorNombre,
    // Solo el último, y solo mientras no se haya abierto otro turno.
    puedeAnular: ultimoVigentePorSucursal.get(c.sucursalId) === c.id && !conCajaAbierta.has(c.sucursalId),
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

    // Se lee antes de la transacción (usa su propia conexión).
    const { multisucursal } = await obtenerContextoSucursal();

    await prisma.$transaction(async (tx) => {
      // Se trabaja sobre la sucursal del cierre (se puede anular desde cualquier sucursal o desde "Todas").
      const cierre = await tx.cierreCaja.findFirst({ where: { id: cierreId, empresaId: admin.empresaId }, select: { sucursalId: true } });
      if (!cierre || cierre.sucursalId == null) throw new Error("No se encontró el cierre.");
      const sucursalId = cierre.sucursalId;
      const ultimo = await tx.cierreCaja.findFirst({ where: { empresaId: admin.empresaId, sucursalId, anulado: false }, orderBy: { id: "desc" } });
      if (!ultimo || ultimo.id !== cierreId) throw new Error("Solo se puede anular el último cierre.");
      const abierta = await sesionAbierta(tx, admin.empresaId, sucursalId);
      if (abierta) {
        if (!(await esTurnoSiguienteVacio(tx, admin.empresaId, abierta, { sucursalId, multisucursal }))) {
          throw new Error("Ya se abrió otro turno de caja: el cierre anterior no se puede anular.");
        }
        // Era el turno que se abrió solo al cerrar y no tiene movimientos: se descarta.
        await tx.sesionCaja.delete({ where: { id: abierta.id } });
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
              monto: Math.abs(monto), saldoResultante: cuenta.saldoActual, detalle, sucursalId,
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
      // Se abre como un turno nuevo con los mismos datos: el turno original
      // queda unido al cierre anulado (sesionId es único) y así se puede
      // volver a cerrar sin chocar con él.
      if (ultimo.sesionId) {
        const original = await tx.sesionCaja.findUnique({ where: { id: ultimo.sesionId } });
        if (original) {
          await tx.sesionCaja.create({
            data: {
              empresaId: original.empresaId,
              sucursalId: original.sucursalId,
              abiertaFecha: original.abiertaFecha,
              abiertaPorNombre: original.abiertaPorNombre,
              aperturaAutomatica: original.aperturaAutomatica,
              aperturaMovimientoId: original.aperturaMovimientoId,
            },
          });
        }
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
