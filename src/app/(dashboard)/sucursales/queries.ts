import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { listarSucursalesHabilitadas } from "@/lib/sucursal";
import { ahora, aperturaDeHoy, correspondeAperturaAutomatica } from "@/lib/caja";
import { fechaISOAR, inicioDiaAR, inicioFinHoyAR, siguienteDiaAR } from "@/lib/timezone";

/**
 * Panel de sucursales (solo admin).
 *
 * Una foto de todos los locales a la vez, sin importar qué sucursal esté
 * elegida en la barra superior:
 * - Ventas de hoy.
 * - Caja: abierta / cerrada y el último cierre con su diferencia.
 * - Productos con stock bajo (en el mínimo o por debajo) y cuántos en negativo.
 * - Gastos del período elegido.
 *
 * Es solo lectura: a diferencia de obtenerEstadoCaja(), NO abre turnos
 * automáticos al consultar (usa correspondeAperturaAutomatica()).
 */

const ESTADOS_EXCLUIDOS = ["ANULADA", "CANCELADA"] as const;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ---------------------------------------------------------------------------
// Período de gastos
// ---------------------------------------------------------------------------

export type ClavePeriodo = "hoy" | "mes" | "mes-pasado" | "rango";

export type Periodo = {
  clave: ClavePeriodo;
  desde: string;
  hasta: string;
  /** "Gastos del mes", "Gastos de hoy"… */
  tituloGastos: string;
  /** "Octubre 2026", "Hoy", "01/10 al 14/10"… */
  etiqueta: string;
};

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nombreMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/**
 * Lee el período de la URL: ?periodo=hoy | mes | mes-pasado, o ?desde=&hasta=
 * (YYYY-MM-DD) para un rango a elección. Por defecto, el mes en curso.
 */
export function resolverPeriodo(params: { periodo?: string; desde?: string; hasta?: string }): Periodo {
  const hoy = fechaISOAR();
  const inicioMes = `${hoy.slice(0, 7)}-01`;

  if (params.desde && FECHA_RE.test(params.desde)) {
    let desde = params.desde;
    let hasta = params.hasta && FECHA_RE.test(params.hasta) ? params.hasta : hoy;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    const etiqueta = desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
    return { clave: "rango", desde, hasta, tituloGastos: "Gastos del período", etiqueta };
  }

  if (params.periodo === "hoy") {
    return { clave: "hoy", desde: hoy, hasta: hoy, tituloGastos: "Gastos de hoy", etiqueta: "Hoy" };
  }

  if (params.periodo === "mes-pasado") {
    const [y, m] = hoy.split("-").map(Number);
    const anio = m === 1 ? y - 1 : y;
    const mes = m === 1 ? 12 : m - 1;
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
    // Último día del mes pasado = el día anterior al 1° de este mes.
    const ultimo = new Date(`${inicioMes}T00:00:00Z`);
    ultimo.setUTCDate(0);
    const hasta = ultimo.toISOString().slice(0, 10);
    return { clave: "mes-pasado", desde, hasta, tituloGastos: "Gastos del mes pasado", etiqueta: nombreMes(desde) };
  }

  return { clave: "mes", desde: inicioMes, hasta: hoy, tituloGastos: "Gastos del mes", etiqueta: nombreMes(hoy) };
}

// ---------------------------------------------------------------------------
// Tipos del panel
// ---------------------------------------------------------------------------

export type EstadoCajaPanel =
  | { tipo: "ABIERTA"; desde: string; porNombre: string; desdeAyerOAntes: boolean }
  | { tipo: "POR_ABRIR"; horaApertura: string }
  | { tipo: "CERRADA"; proximaApertura: string };

export type DiferenciasPorMoneda = { ARS: number; USD: number };

export type SucursalPanel = {
  id: number;
  nombre: string;
  ventasHoy: { cantidad: number; totalARS: number; ticketPromedioARS: number };
  caja: {
    estado: EstadoCajaPanel;
    ultimoCierre: {
      fecha: string;
      /** Suma de contado - esperado de las cuentas revisadas. Negativo = faltante. */
      diferencias: DiferenciasPorMoneda;
    } | null;
  };
  /** Productos activos en el mínimo o por debajo; `negativos` es parte de `total`. */
  stockBajo: { total: number; negativos: number };
  gastos: {
    totalARS: number;
    /** Parte del total de gastos de las sucursales (0 a 1), para la barrita. */
    proporcion: number;
  };
};

export type PanelSucursales = {
  hoy: string;
  sucursales: SucursalPanel[];
  /** Gastos cargados en "Todas" (de la empresa, sin sucursal). */
  gastosSinSucursalARS: number;
  totales: {
    ventasHoyARS: number;
    ventasHoyCantidad: number;
    cajasAbiertas: number;
    stockBajo: number;
    stockNegativo: number;
    gastosARS: number;
  };
};

const sumarDiferencias = (cuentas: { diferencia: number | null; cuenta: { tipo: string } }[]) => {
  const acc: DiferenciasPorMoneda = { ARS: 0, USD: 0 };
  for (const c of cuentas) {
    if (c.diferencia == null) continue;
    const moneda = c.cuenta.tipo.endsWith("USD") ? "USD" : "ARS";
    acc[moneda] = Math.round((acc[moneda] + c.diferencia) * 100) / 100;
  }
  return acc;
};

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export async function obtenerPanelSucursales(periodo: Periodo): Promise<PanelSucursales> {
  const { empresaId } = await requerirAdmin();
  const desde = inicioDiaAR(periodo.desde);
  const hasta = inicioDiaAR(siguienteDiaAR(periodo.hasta));
  const { inicio: inicioHoy, fin: finHoy } = inicioFinHoyAR();

  const sucursales = await listarSucursalesHabilitadas(empresaId);
  const ids = sucursales.map((s) => s.id);
  const principalId = ids[0];

  const [config, ventasHoy, sesionesAbiertas, ultimasSesiones, cierres, stockBajo, negativos, gastos] =
    await Promise.all([
      prisma.configuracion.findUnique({
        where: { empresaId },
        select: { horaAperturaCaja: true, cajaTurnoContinuo: true },
      }),
      // Ventas de hoy. Sin número = ajuste manual de deuda: no es una venta.
      prisma.venta.groupBy({
        by: ["sucursalId"],
        where: {
          empresaId,
          numero: { not: null },
          fecha: { gte: inicioHoy, lt: finHoy },
          estadoPago: { notIn: [...ESTADOS_EXCLUIDOS] },
        },
        _sum: { totalARS: true },
        _count: { _all: true },
      }),
      prisma.sesionCaja.findMany({
        where: { empresaId, sucursalId: { in: ids }, cerradaFecha: null },
        orderBy: { id: "asc" },
      }),
      // Último turno de cada sucursal (para saber si ya corresponde que abra sola).
      prisma.sesionCaja.findMany({
        where: { empresaId, sucursalId: { in: ids } },
        orderBy: { id: "desc" },
        distinct: ["sucursalId"],
        select: { sucursalId: true, cerradaFecha: true },
      }),
      // Último cierre vigente de cada sucursal.
      prisma.cierreCaja.findMany({
        where: { empresaId, sucursalId: { in: ids }, anulado: false },
        orderBy: { id: "desc" },
        distinct: ["sucursalId"],
        select: {
          sucursalId: true,
          fecha: true,
          cuentas: { select: { diferencia: true, cuenta: { select: { tipo: true } } } },
        },
      }),
      // Stock en el mínimo o por debajo, de productos activos.
      prisma.stockSucursal.groupBy({
        by: ["sucursalId"],
        where: {
          sucursalId: { in: ids },
          producto: { empresaId, activo: true },
          cantidad: { lte: prisma.stockSucursal.fields.stockMinimo },
        },
        _count: { _all: true },
      }),
      // Cuántos de esos están en negativo.
      prisma.stockSucursal.groupBy({
        by: ["sucursalId"],
        where: { sucursalId: { in: ids }, producto: { empresaId, activo: true }, cantidad: { lt: 0 } },
        _count: { _all: true },
      }),
      prisma.gasto.groupBy({
        by: ["sucursalId"],
        where: { empresaId, fecha: { gte: desde, lt: hasta } },
        _sum: { monto: true },
      }),
    ]);

  const horaApertura = config?.horaAperturaCaja ?? "07:00";
  const momento = ahora();
  const inicioDeHoy = inicioDiaAR(fechaISOAR(momento));

  // Ventas sin sucursal (de antes de la migración) cuentan en la principal.
  const ventasPorSucursal = new Map<number, { cantidad: number; totalARS: number }>();
  for (const v of ventasHoy) {
    const id = v.sucursalId ?? principalId;
    const prev = ventasPorSucursal.get(id) ?? { cantidad: 0, totalARS: 0 };
    ventasPorSucursal.set(id, {
      cantidad: prev.cantidad + v._count._all,
      totalARS: prev.totalARS + (v._sum.totalARS ?? 0),
    });
  }

  const gastoDe = (id: number | null) => gastos.find((g) => g.sucursalId === id)?._sum.monto ?? 0;
  const gastosSucursales = sucursales.reduce((a, s) => a + gastoDe(s.id), 0);

  const resultado: SucursalPanel[] = sucursales.map((s) => {
    const sesion = sesionesAbiertas.find((x) => x.sucursalId === s.id);
    let estado: EstadoCajaPanel;
    if (sesion) {
      estado = {
        tipo: "ABIERTA",
        desde: sesion.abiertaFecha.toISOString(),
        porNombre: sesion.abiertaPorNombre,
        desdeAyerOAntes: !config?.cajaTurnoContinuo && sesion.abiertaFecha < inicioDeHoy,
      };
    } else {
      const ultima = ultimasSesiones.find((x) => x.sucursalId === s.id) ?? null;
      if (correspondeAperturaAutomatica(ultima, horaApertura, momento)) {
        estado = { tipo: "POR_ABRIR", horaApertura };
      } else {
        const aperturaHoy = aperturaDeHoy(horaApertura, momento);
        const aperturaManana = aperturaDeHoy(horaApertura, new Date(aperturaHoy.getTime() + 24 * 60 * 60 * 1000));
        estado = {
          tipo: "CERRADA",
          proximaApertura: (momento < aperturaHoy ? aperturaHoy : aperturaManana).toISOString(),
        };
      }
    }

    const cierre = cierres.find((c) => c.sucursalId === s.id);
    const ventas = ventasPorSucursal.get(s.id) ?? { cantidad: 0, totalARS: 0 };
    const gastosARS = gastoDe(s.id);

    return {
      id: s.id,
      nombre: s.nombre,
      ventasHoy: {
        cantidad: ventas.cantidad,
        totalARS: ventas.totalARS,
        ticketPromedioARS: ventas.cantidad ? ventas.totalARS / ventas.cantidad : 0,
      },
      caja: {
        estado,
        ultimoCierre: cierre
          ? { fecha: cierre.fecha.toISOString(), diferencias: sumarDiferencias(cierre.cuentas) }
          : null,
      },
      stockBajo: {
        total: stockBajo.find((x) => x.sucursalId === s.id)?._count._all ?? 0,
        negativos: negativos.find((x) => x.sucursalId === s.id)?._count._all ?? 0,
      },
      gastos: { totalARS: gastosARS, proporcion: gastosSucursales > 0 ? gastosARS / gastosSucursales : 0 },
    };
  });

  const gastosSinSucursalARS = gastoDe(null);

  return {
    hoy: fechaISOAR(momento),
    sucursales: resultado,
    gastosSinSucursalARS,
    totales: {
      ventasHoyARS: resultado.reduce((a, s) => a + s.ventasHoy.totalARS, 0),
      ventasHoyCantidad: resultado.reduce((a, s) => a + s.ventasHoy.cantidad, 0),
      cajasAbiertas: resultado.filter((s) => s.caja.estado.tipo === "ABIERTA").length,
      stockBajo: resultado.reduce((a, s) => a + s.stockBajo.total, 0),
      stockNegativo: resultado.reduce((a, s) => a + s.stockBajo.negativos, 0),
      gastosARS: gastosSucursales + gastosSinSucursalARS,
    },
  };
}