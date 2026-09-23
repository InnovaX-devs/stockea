import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { montoARSDePago } from "@/lib/currency";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

export type ClienteConDeuda = {
  id: number;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  localidad: string | null;
  esMayorista: boolean;
  deuda: number;
};

export type OrdenClientes = "nombre-asc" | "nombre-desc" | "deuda-desc" | "deuda-asc";

export type ClientesFiltros = {
  busqueda?: string;
  tipo?: "mayorista" | "minorista";
  deuda?: "con-deuda" | "al-dia";
  orden?: OrdenClientes;
  pagina?: number;
};

export type Paginacion = {
  pagina: number;
  totalPaginas: number;
  totalItems: number;
  pageSize: number;
};

const UMBRAL_AL_DIA = 0.5;
const PAGE_SIZE = 25;

const SELECT_BASE = {
  id: true,
  nombre: true,
  apellido: true,
  telefono: true,
  email: true,
  direccion: true,
  localidad: true,
  esMayorista: true,
} satisfies Prisma.ClienteSelect;

const ORDEN_NOMBRE_MAP: Record<string, Prisma.ClienteOrderByWithRelationInput> = {
  "nombre-asc": { nombre: "asc" },
  "nombre-desc": { nombre: "desc" },
};

export async function getClientesData(filtros: ClientesFiltros = {}) {
  const empresaId = await obtenerEmpresaIdActual();
  const orden = filtros.orden ?? "nombre-asc";
  const paginaSolicitada = filtros.pagina ?? 1;

  // 1) Deuda agregada por cliente: UNA fila por cliente con ventas A_CUENTA,
  //    en vez de traer cada venta pendiente individual con `include`.
  const deudaPorCliente = await getDeudaPorCliente(empresaId);

  // 2) Resumen global (independiente de los filtros aplicados).
  const [totalClientes, totalMayoristas] = await Promise.all([
    prisma.cliente.count({ where: { empresaId } }),
    prisma.cliente.count({ where: { empresaId, esMayorista: true } }),
  ]);
  const deudaTotal = Array.from(deudaPorCliente.values()).reduce((sum, d) => sum + d, 0);
  const resumen = {
    totalClientes,
    totalMayoristas,
    deudaTotal: redondear(deudaTotal),
  };

  // 3) Where clause de Prisma para lo que SÍ vive en columnas reales.
  const where: Prisma.ClienteWhereInput = { empresaId };
  if (filtros.busqueda) {
    where.OR = [
      { nombre: { contains: filtros.busqueda, mode: "insensitive" } },
      { apellido: { contains: filtros.busqueda, mode: "insensitive" } },
    ];
  }
  if (filtros.tipo) {
    where.esMayorista = filtros.tipo === "mayorista";
  }

  const ordenaPorDeuda = orden === "deuda-asc" || orden === "deuda-desc";
  const filtraPorDeuda = filtros.deuda === "con-deuda" || filtros.deuda === "al-dia";

  let clientesPagina: ClienteConDeuda[];
  let pagina: number;
  let totalItems: number;
  let totalPaginas: number;

  if (!ordenaPorDeuda && !filtraPorDeuda) {
    // Caso común: búsqueda, tipo, orden por nombre y paginación, todo en la DB.
    totalItems = await prisma.cliente.count({ where });
    totalPaginas = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    pagina = Math.min(Math.max(1, paginaSolicitada), totalPaginas);

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: ORDEN_NOMBRE_MAP[orden] ?? { nombre: "asc" },
      skip: (pagina - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: SELECT_BASE,
    });

    clientesPagina = clientes.map((c) => ({
      ...c,
      deuda: deudaPorCliente.get(c.id) ?? 0,
    }));
  } else {
    // Filtrar/ordenar por deuda no se puede resolver con where/orderBy de Prisma
    // porque no es una columna. Acotamos el universo con búsqueda/tipo en la DB
    // (sin include de ventas) y sólo ahí resolvemos deuda + paginación en memoria.
    const candidatos = await prisma.cliente.findMany({
      where,
      select: SELECT_BASE,
    });

    let conDeuda: ClienteConDeuda[] = candidatos.map((c) => ({
      ...c,
      deuda: deudaPorCliente.get(c.id) ?? 0,
    }));

    if (filtros.deuda === "con-deuda") {
      conDeuda = conDeuda.filter((c) => c.deuda > UMBRAL_AL_DIA);
    } else if (filtros.deuda === "al-dia") {
      conDeuda = conDeuda.filter((c) => c.deuda <= UMBRAL_AL_DIA);
    }

    conDeuda.sort((a, b) => {
      const nombreA = `${a.nombre} ${a.apellido ?? ""}`.trim();
      const nombreB = `${b.nombre} ${b.apellido ?? ""}`.trim();
      switch (orden) {
        case "nombre-desc":
          return nombreB.localeCompare(nombreA);
        case "deuda-desc":
          return b.deuda - a.deuda;
        case "deuda-asc":
          return a.deuda - b.deuda;
        case "nombre-asc":
        default:
          return nombreA.localeCompare(nombreB);
      }
    });

    totalItems = conDeuda.length;
    totalPaginas = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    pagina = Math.min(Math.max(1, paginaSolicitada), totalPaginas);

    const inicio = (pagina - 1) * PAGE_SIZE;
    clientesPagina = conDeuda.slice(inicio, inicio + PAGE_SIZE);
  }

  const paginacion: Paginacion = { pagina, totalPaginas, totalItems, pageSize: PAGE_SIZE };

  return { clientes: clientesPagina, resumen, umbralAlDia: UMBRAL_AL_DIA, paginacion };
}

async function getDeudaPorCliente(empresaId: number): Promise<Map<number, number>> {
  // Traemos sólo columnas escalares de Venta (sin include de Cliente ni de
  // arrays anidados) para clampear la deuda POR VENTA antes de sumar, igual
  // que hacía el código original. Un groupBy con _sum no sirve acá: sumaría
  // totalARS y montoPagado por separado y clampearía recién al final, lo que
  // deja que un sobrepago en una venta compense deuda de otra — no es lo
  // mismo matemáticamente y con montos de plata de por medio no vale la pena
  // el atajo.
  const ventasPendientes = await prisma.venta.findMany({
    where: { empresaId, estadoPago: "A_CUENTA", clienteId: { not: null } },
    select: { clienteId: true, totalARS: true, montoPagado: true },
  });

  const mapa = new Map<number, number>();
  for (const v of ventasPendientes) {
    if (v.clienteId == null) continue;
    // Pesos enteros: el totalARS puede tener decimales (conversión USD,
    // descuentos) que nunca se cobran.
    const deudaVenta = Math.max(0, Math.round(v.totalARS) - v.montoPagado);
    mapa.set(v.clienteId, redondear((mapa.get(v.clienteId) ?? 0) + deudaVenta));
  }
  return mapa;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getCuentasActivas() {
  const empresaId = await obtenerEmpresaIdActual();
  return prisma.cuenta.findMany({
    where: { activa: true, empresaId },
    orderBy: [{ favorita: "desc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, tipo: true, saldoActual: true },
  });
}

// --- Historial de deuda ---

export type EventoHistorialDeuda = {
  id: string;
  tipo: "venta" | "pago";
  monto: number;
  fecha: Date;
  label: string;
  sublabel: string;
  ventaId: number;
  saldoAntes: number;
  saldoDespues: number;
};

function labelMedioPago(tipoCuenta: string) {
  return tipoCuenta === "BANCO_ARS" || tipoCuenta === "BANCO_USD"
    ? "Pago vía transferencia"
    : "Pago en efectivo";
}

export async function getHistorialDeuda(clienteId: number): Promise<EventoHistorialDeuda[]> {
  const empresaId = await obtenerEmpresaIdActual();
  const ventas = await prisma.venta.findMany({
    where: {
      clienteId,
      empresaId,
      OR: [{ estadoPago: "A_CUENTA" }, { pagos: { some: {} } }],
    },
    include: {
      items: { select: { descripcionLibre: true } },
      pagos: { include: { cuenta: { select: { tipo: true } } } },
    },
    orderBy: { fecha: "asc" },
  });

  type EventoRaw = Omit<EventoHistorialDeuda, "id" | "saldoAntes" | "saldoDespues">;
  const eventos: EventoRaw[] = [];

  for (const venta of ventas) {
    const esAjuste =
      venta.items.length === 1 && venta.items[0].descripcionLibre === "Ajuste manual de deuda";

    eventos.push({
      fecha: venta.fecha,
      monto: Math.round(venta.totalARS),
      tipo: "venta",
      label: esAjuste ? "Ajuste manual" : "Venta a cuenta",
      sublabel: esAjuste ? "Aumento de deuda" : `Venta #${venta.id}`,
      ventaId: venta.id,
    });

    for (const pago of venta.pagos) {
      eventos.push({
        fecha: pago.fecha,
        // En cuentas USD `pago.monto` son dólares: se muestra lo que bajó la deuda en pesos.
        monto: -montoARSDePago(pago, pago.cuenta.tipo, venta.cotizacionUsada),
        tipo: "pago",
        label: "Pago recibido",
        sublabel: labelMedioPago(pago.cuenta.tipo),
        ventaId: venta.id,
      });
    }
  }

  eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  let saldo = 0;
  const historial: EventoHistorialDeuda[] = eventos.map((e, i) => {
    const saldoAntes = Math.round(saldo * 100) / 100;
    saldo += e.monto;
    return {
      ...e,
      id: `${e.tipo}-${e.ventaId}-${i}`,
      saldoAntes,
      saldoDespues: Math.round(saldo * 100) / 100,
    };
  });

  return historial.reverse(); // más reciente primero
}