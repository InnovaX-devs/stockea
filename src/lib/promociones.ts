import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { toArs } from "@/lib/currency";
import { contenidoVisible } from "@/lib/rubro";
import { conStockDeSucursal } from "@/lib/stock-sucursal";
import { inicioDiaAR } from "@/lib/timezone";
import { cuantasSePuedenArmar, estadoPromocion, type EstadoPromocion } from "@/lib/promociones-comun";

/**
 * Promociones (#114): alta, edición y listado. Una promo es un Producto con
 * esPromocion = true, sin stock propio (controlaStock = false) y con lo que
 * incluye en ComponentePromocion. Vender, anular, cancelar y sincronizar
 * descuentan o devuelven los componentes en src/lib/stock.ts.
 */

const MAX_COMPONENTES = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

export class PromocionError extends Error {}

export type ComponenteInput = { productoId: number; cantidad: number };

export type PromocionInput = {
  nombre: string;
  codigoBarras: string | null;
  /** Precio de la promo, en pesos. */
  precio: number;
  /** "AAAA-MM-DD" o null (sin fecha). La vigencia va de 00:00 del desde a 23:59 del hasta (hora Argentina). */
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  activo: boolean;
  componentes: ComponenteInput[];
};

export type ComponenteDTO = {
  productoId: number;
  nombre: string;
  cantidad: number;
  /** Stock del producto en la sucursal actual (o total). */
  stock: number;
  /** Precio de venta minorista en pesos (para "precio por separado"). */
  precioARS: number;
};

export type PromocionDTO = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  precio: number;
  /** Suma de los precios de lo que incluye, comprado por separado. */
  precioSeparado: number;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  activo: boolean;
  estado: EstadoPromocion;
  sePuedenArmar: number;
  componentes: ComponenteDTO[];
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerFecha(valor: unknown, campo: string): string | null {
  if (valor == null || valor === "") return null;
  if (typeof valor !== "string" || !FECHA.test(valor) || Number.isNaN(inicioDiaAR(valor).getTime())) {
    throw new PromocionError(`${campo}: fecha inválida.`);
  }
  return valor;
}

/** Valida y normaliza lo que llega del formulario. */
export function leerPromocionInput(body: unknown): PromocionInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
  if (!nombre) throw new PromocionError("Poné un nombre para la promoción.");
  if (nombre.length > 120) throw new PromocionError("El nombre es demasiado largo.");

  const codigo = typeof b.codigoBarras === "string" ? b.codigoBarras.trim() : "";
  if (codigo.length > 64) throw new PromocionError("El código de barras es demasiado largo.");

  const precio = Number(b.precio);
  if (!Number.isFinite(precio) || precio <= 0 || precio >= 1e12) throw new PromocionError("Poné el precio de la promoción.");

  const vigenciaDesde = leerFecha(b.vigenciaDesde, "Vigente desde");
  const vigenciaHasta = leerFecha(b.vigenciaHasta, "Vigente hasta");
  if (vigenciaDesde && vigenciaHasta && vigenciaHasta < vigenciaDesde) {
    throw new PromocionError("La fecha de fin no puede ser anterior a la de inicio.");
  }

  const lista = Array.isArray(b.componentes) ? b.componentes : [];
  const componentes: ComponenteInput[] = [];
  for (const c of lista) {
    const productoId = Number((c as Record<string, unknown>)?.productoId);
    const cantidad = Number((c as Record<string, unknown>)?.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) throw new PromocionError("Hay un producto inválido en la promoción.");
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) {
      throw new PromocionError("La cantidad de cada producto tiene que ser un número entero entre 1 y 999.");
    }
    if (componentes.some((x) => x.productoId === productoId)) {
      throw new PromocionError("Un producto está repetido: sumale la cantidad en una sola fila.");
    }
    componentes.push({ productoId, cantidad });
  }
  if (componentes.length === 0) throw new PromocionError("Agregá al menos un producto a la promoción.");
  if (componentes.length > MAX_COMPONENTES) throw new PromocionError(`Una promoción puede incluir hasta ${MAX_COMPONENTES} productos.`);
  // Una promo de un solo producto con cantidad 1 es un producto con otro precio: no tiene sentido.
  if (componentes.length === 1 && componentes[0].cantidad === 1) {
    throw new PromocionError("Una promoción tiene que incluir más de una unidad (por ejemplo, 2 del mismo producto o dos productos).");
  }

  return {
    nombre,
    codigoBarras: codigo || null,
    precio: Math.round(precio * 100) / 100,
    vigenciaDesde,
    vigenciaHasta,
    activo: b.activo !== false,
    componentes,
  };
}

/**
 * Revisa que lo que incluye sean productos comunes de la empresa: activos, que
 * no sean promos, ni de precio abierto, ni la misma promo. Devuelve el costo
 * en pesos de la promo (suma de costos × cantidad) con la cotización actual.
 */
async function validarComponentes(
  tx: Prisma.TransactionClient,
  empresaId: number,
  promocionId: number | null,
  componentes: ComponenteInput[],
  cotizacion: number
): Promise<number> {
  if (promocionId != null && componentes.some((c) => c.productoId === promocionId)) {
    throw new PromocionError("Una promoción no puede incluirse a sí misma.");
  }
  const productos = await tx.producto.findMany({
    where: { id: { in: componentes.map((c) => c.productoId) }, empresaId },
    select: { id: true, nombre: true, activo: true, esPromocion: true, precioAbierto: true, precioCosto: true, monedaPrecio: true },
  });
  if (productos.length !== componentes.length) throw new PromocionError("Uno o más productos de la promoción no son válidos.");
  for (const p of productos) {
    if (p.esPromocion) throw new PromocionError(`"${p.nombre}" es una promoción: una promo no puede incluir otra.`);
    if (p.precioAbierto) throw new PromocionError(`"${p.nombre}" es de precio abierto: no puede ir en una promoción.`);
    if (!p.activo) throw new PromocionError(`"${p.nombre}" está desactivado.`);
  }
  const porId = new Map(productos.map((p) => [p.id, p]));
  return componentes.reduce((acc, c) => {
    const p = porId.get(c.productoId)!;
    return acc + toArs(p.precioCosto, p.monedaPrecio, cotizacion) * c.cantidad;
  }, 0);
}

async function revisarCodigo(tx: Prisma.TransactionClient, empresaId: number, codigo: string | null, promocionId: number | null) {
  if (!codigo) return;
  const otro = await tx.producto.findFirst({
    where: { empresaId, codigoBarras: codigo, ...(promocionId != null ? { id: { not: promocionId } } : {}) },
    select: { nombre: true, esPromocion: true },
  });
  if (otro) {
    throw new PromocionError(`El código ${codigo} ya lo usa ${otro.esPromocion ? "la promoción" : "el producto"} "${otro.nombre}".`);
  }
}

function datosDePromo(input: PromocionInput, costo: number) {
  return {
    nombre: input.nombre,
    codigoBarras: input.codigoBarras,
    monedaPrecio: "ARS" as const,
    precioVenta: input.precio,
    // Informativo: los reportes calculan el costo con los componentes (src/lib/reportes.ts).
    precioCosto: Math.round(costo * 100) / 100,
    activo: input.activo,
    vigenciaDesde: input.vigenciaDesde ? inicioDiaAR(input.vigenciaDesde) : null,
    vigenciaHasta: input.vigenciaHasta ? new Date(inicioDiaAR(input.vigenciaHasta).getTime() + MS_DIA - 1) : null,
  };
}

async function cotizacionActual() {
  const config = await obtenerConfiguracion();
  return config.usaCotizacionUSD && config.cotizacionUSD > 0 ? config.cotizacionUSD : 1;
}

export async function crearPromocion(empresaId: number, input: PromocionInput): Promise<number> {
  const cotizacion = await cotizacionActual();
  return prisma.$transaction(async (tx) => {
    await revisarCodigo(tx, empresaId, input.codigoBarras, null);
    const costo = await validarComponentes(tx, empresaId, null, input.componentes, cotizacion);
    const promo = await tx.producto.create({
      data: {
        empresaId,
        ...datosDePromo(input, costo),
        esPromocion: true,
        controlaStock: false, // sin stock propio: se descuentan los componentes
        stockActual: 0,
        componentes: {
          create: input.componentes.map((c) => ({ empresaId, productoId: c.productoId, cantidad: c.cantidad })),
        },
      },
      select: { id: true },
    });
    return promo.id;
  });
}

export async function editarPromocion(empresaId: number, id: number, input: PromocionInput): Promise<void> {
  const cotizacion = await cotizacionActual();
  await prisma.$transaction(async (tx) => {
    const actual = await tx.producto.findFirst({ where: { id, empresaId, esPromocion: true }, select: { id: true } });
    if (!actual) throw new PromocionError("La promoción no existe.");
    await revisarCodigo(tx, empresaId, input.codigoBarras, id);
    const costo = await validarComponentes(tx, empresaId, id, input.componentes, cotizacion);
    await tx.componentePromocion.deleteMany({ where: { promocionId: id, empresaId } });
    // El update cambia updatedAt: así la copia sin conexión se entera del cambio.
    await tx.producto.update({
      where: { id },
      data: {
        ...datosDePromo(input, costo),
        componentes: {
          create: input.componentes.map((c) => ({ empresaId, productoId: c.productoId, cantidad: c.cantidad })),
        },
      },
    });
  });
}

/** Pausar / reactivar. */
export async function cambiarEstadoPromocion(empresaId: number, id: number, activo: boolean): Promise<void> {
  const r = await prisma.producto.updateMany({ where: { id, empresaId, esPromocion: true }, data: { activo } });
  if (r.count === 0) throw new PromocionError("La promoción no existe.");
}

/** Elimina la promo; si ya tiene ventas o pedidos, queda desactivada (pausada) para no perder el historial. */
export async function eliminarPromocion(empresaId: number, id: number): Promise<"eliminada" | "desactivada"> {
  return prisma.$transaction(async (tx) => {
    const promo = await tx.producto.findFirst({
      where: { id, empresaId, esPromocion: true },
      select: { _count: { select: { itemsVenta: true } } },
    });
    if (!promo) throw new PromocionError("La promoción no existe.");
    if (promo._count.itemsVenta > 0) {
      await tx.producto.update({ where: { id }, data: { activo: false } });
      return "desactivada";
    }
    // Presupuestos con la promo (raro: el buscador de presupuestos no las muestra) la frenan igual.
    await tx.producto.delete({ where: { id } });
    return "eliminada";
  });
}

const aISO = (d: Date | null) =>
  d ? new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10) : null; // fecha en hora Argentina

/** Listado de la sección Promociones, con el stock de la sucursal actual. */
export async function listarPromociones(empresaId: number): Promise<PromocionDTO[]> {
  const config = await obtenerConfiguracion();
  const cotizacion = config.usaCotizacionUSD && config.cotizacionUSD > 0 ? config.cotizacionUSD : 1;
  const promos = await prisma.producto.findMany({
    where: { empresaId, esPromocion: true },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      codigoBarras: true,
      precioVenta: true,
      activo: true,
      vigenciaDesde: true,
      vigenciaHasta: true,
      componentes: {
        orderBy: { id: "asc" },
        select: {
          cantidad: true,
          producto: {
            select: { id: true, nombre: true, stockActual: true, precioVenta: true, monedaPrecio: true, contenido: true, unidadContenido: true },
          },
        },
      },
    },
  });

  // Stock de la sucursal actual de todos los componentes, en una sola consulta.
  const componentes = [...new Map(promos.flatMap((p) => p.componentes.map((c) => [c.producto.id, c.producto]))).values()];
  const conStock = new Map((await conStockDeSucursal(componentes)).map((c) => [c.id, c.stockActual]));

  const ahora = new Date();
  return promos.map((p) => {
    const comps: ComponenteDTO[] = p.componentes.map((c) => ({
      productoId: c.producto.id,
      nombre: [c.producto.nombre, contenidoVisible(config.rubro, c.producto.contenido, c.producto.unidadContenido)]
        .filter(Boolean)
        .join(" "),
      cantidad: c.cantidad,
      stock: conStock.get(c.producto.id) ?? 0,
      precioARS: toArs(c.producto.precioVenta, c.producto.monedaPrecio, cotizacion),
    }));
    return {
      id: p.id,
      nombre: p.nombre,
      codigoBarras: p.codigoBarras,
      precio: p.precioVenta,
      precioSeparado: comps.reduce((a, c) => a + c.precioARS * c.cantidad, 0),
      vigenciaDesde: aISO(p.vigenciaDesde),
      vigenciaHasta: aISO(p.vigenciaHasta),
      activo: p.activo,
      estado: estadoPromocion(p, ahora),
      sePuedenArmar: cuantasSePuedenArmar(comps),
      componentes: comps,
    };
  });
}

/** Filtro de Prisma: promos que se pueden vender ahora (activas y dentro de la vigencia). */
export function filtroPromocionesVendibles(ahora: Date = new Date()): Prisma.ProductoWhereInput {
  return {
    esPromocion: true,
    activo: true,
    AND: [
      { OR: [{ vigenciaDesde: null }, { vigenciaDesde: { lte: ahora } }] },
      { OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: ahora } }] },
    ],
  };
}
