import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conStockDeSucursal, sucursalParaMostrarStock } from "@/lib/stock-sucursal";
import { ENCABEZADOS_ACTUALIZACION } from "@/lib/actualizar-productos-formato";
import {
  ErrorArchivo,
  type ErrorFila,
  type ProductoPlantilla,
  type ResultadoParseoActualizacion,
} from "@/lib/actualizar-productos-parseo";
import {
  planificarActualizacion,
  type ContextoActualizacion,
  type DatosActuales,
  type ProductoQueCambia,
} from "@/lib/actualizar-productos-plan";

/**
 * Actualizar productos en lote desde un CSV (issue #109) — PARTE QUE USA LA BASE.
 * La lectura del archivo está en actualizar-productos-parseo.ts y la comparación
 * con lo que hay hoy en actualizar-productos-plan.ts.
 *
 * Dos pasos sobre el MISMO archivo:
 *  1. previsualizarActualizacion: compara y arma el resumen. No escribe nada.
 *  2. aplicarActualizacion: vuelve a leer lo que hay en la base DENTRO de la transacción,
 *     recalcula los cambios y los escribe. Todo o nada. Nunca se confía en lo que
 *     mostró la pantalla: así el "valor anterior" del historial es el real.
 */

type Db = Prisma.TransactionClient;

const MAX_ERRORES_LISTADOS = 200;
const MAX_PRODUCTOS_LISTADOS = 500;
const DETALLE_HISTORIAL = "Actualización desde CSV";

async function cargarDatosActuales(db: Db, ctx: ContextoActualizacion): Promise<DatosActuales> {
  const { empresaId } = ctx;
  const [productos, marcas, categorias, minimos] = await Promise.all([
    db.producto.findMany({
      where: { empresaId },
      select: {
        id: true,
        nombre: true,
        codigoBarras: true,
        modeloId: true,
        marcaId: true,
        categoriaId: true,
        monedaPrecio: true,
        precioCosto: true,
        precioVenta: true,
        precioMayorista: true,
        precioAbierto: true,
        esPromocion: true,
        stockMinimo: true,
      },
    }),
    db.marca.findMany({ where: { empresaId }, select: { id: true, nombre: true } }),
    db.categoria.findMany({ where: { empresaId }, select: { id: true, nombre: true } }),
    // Con varias sucursales, el stock mínimo del archivo es el de la sucursal actual.
    ctx.multisucursal && ctx.sucursalId != null
      ? db.stockSucursal.findMany({ where: { sucursalId: ctx.sucursalId, producto: { empresaId } }, select: { productoId: true, stockMinimo: true } })
      : Promise.resolve(null),
  ]);
  return {
    productos,
    marcas,
    categorias,
    minimoSucursal: minimos ? new Map(minimos.map((m) => [m.productoId, m.stockMinimo])) : null,
  };
}

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

export type ResumenActualizacion = {
  /** Filas con datos del archivo. */
  total: number;
  /** Productos que cambian. */
  cambian: number;
  sinCambios: number;
  conError: number;
  /** Cuántos precios (costo, minorista, mayorista) cambian: son los que entran al historial de precios. */
  cambiosDePrecio: number;
  productos: ProductoQueCambia[];
  productosOcultos: number;
  errores: ErrorFila[];
  erroresOcultos: number;
  /** Columnas del archivo que se van a leer. */
  columnas: string[];
  /** Columnas del archivo que NO se importan (el stock). */
  ignoradas: { titulo: string; motivo: string }[];
  /** Algo impide aplicar (por ejemplo, falta elegir sucursal). */
  bloqueo: string | null;
};

export async function previsualizarActualizacion(ctx: ContextoActualizacion, parseo: ResultadoParseoActualizacion): Promise<ResumenActualizacion> {
  const plan = planificarActualizacion(parseo.filas, parseo.errores, await cargarDatosActuales(prisma, ctx), ctx);
  return {
    total: parseo.total,
    cambian: plan.cambios.length,
    sinCambios: plan.sinCambios,
    conError: plan.errores.length,
    cambiosDePrecio: plan.cambios.reduce((s, c) => s + c.historial.length, 0),
    productos: plan.cambios.slice(0, MAX_PRODUCTOS_LISTADOS).map(({ fila, productoId, nombre, cambios }) => ({ fila, productoId, nombre, cambios })),
    productosOcultos: Math.max(0, plan.cambios.length - MAX_PRODUCTOS_LISTADOS),
    errores: plan.errores.slice(0, MAX_ERRORES_LISTADOS),
    erroresOcultos: Math.max(0, plan.errores.length - MAX_ERRORES_LISTADOS),
    columnas: parseo.columnas.map((c) => ENCABEZADOS_ACTUALIZACION[c].titulo),
    ignoradas: parseo.ignoradas,
    bloqueo: plan.bloqueo,
  };
}

// ---------------------------------------------------------------------------
// Aplicar
// ---------------------------------------------------------------------------

export type ResultadoActualizacion = {
  /** Productos que se actualizaron. */
  actualizados: number;
  /** Precios que quedaron registrados en el historial de precios. */
  cambiosDePrecio: number;
  /** Filas que no se aplicaron por tener errores. */
  conError: number;
};

/**
 * Aplica los cambios en UNA transacción: si algo falla, no queda nada a medias.
 * Las filas con error no se aplican; el resto sí.
 */
export async function aplicarActualizacion(
  ctx: ContextoActualizacion,
  parseo: ResultadoParseoActualizacion,
  /** Solo para las pruebas: la base contra la que se escribe. */
  cliente: Pick<typeof prisma, "$transaction"> = prisma
): Promise<ResultadoActualizacion> {
  return cliente.$transaction(
    async (tx: Db) => {
      const plan = planificarActualizacion(parseo.filas, parseo.errores, await cargarDatosActuales(tx, ctx), ctx);
      if (plan.bloqueo) throw new ErrorArchivo(plan.bloqueo);
      if (plan.cambios.length === 0) throw new ErrorArchivo("No hay cambios para aplicar.");

      // Stock mínimo por sucursal: primero StockSucursal y después Producto (orden de bloqueo de src/lib/stock.ts).
      const conMinimo = plan.cambios.filter((c) => c.minimo !== undefined);
      const totalMinimo = new Map<number, number>();
      if (conMinimo.length > 0 && ctx.sucursalId != null) {
        for (const c of conMinimo) {
          await tx.stockSucursal.upsert({
            where: { productoId_sucursalId: { productoId: c.productoId, sucursalId: ctx.sucursalId } },
            create: { productoId: c.productoId, sucursalId: ctx.sucursalId, stockMinimo: c.minimo as number },
            update: { stockMinimo: c.minimo as number },
          });
        }
        // En "Producto" queda la suma de todas las sucursales.
        const sumas = await tx.stockSucursal.groupBy({
          by: ["productoId"],
          where: { productoId: { in: conMinimo.map((c) => c.productoId) } },
          _sum: { stockMinimo: true },
        });
        for (const s of sumas) totalMinimo.set(s.productoId, s._sum.stockMinimo ?? 0);
      }

      const historial: Prisma.HistorialPrecioCreateManyInput[] = [];
      for (const c of plan.cambios) {
        const datos: Prisma.ProductoUncheckedUpdateManyInput = { ...c.datos };
        if (c.minimo !== undefined) datos.stockMinimo = totalMinimo.get(c.productoId) ?? c.minimo;

        // updateMany con empresaId: nunca se toca un producto de otra empresa.
        const { count } = await tx.producto.updateMany({ where: { id: c.productoId, empresaId: ctx.empresaId }, data: datos });
        if (count !== 1) {
          throw new ErrorArchivo(`El producto "${c.nombre}" (fila ${c.fila}) ya no existe. No se aplicó ningún cambio.`);
        }
        for (const h of c.historial) {
          historial.push({
            productoId: c.productoId,
            empresaId: ctx.empresaId,
            campo: h.campo,
            valorAnterior: h.anterior,
            valorNuevo: h.nuevo,
            origen: "ACTUALIZACION_MASIVA",
            detalle: DETALLE_HISTORIAL,
          });
        }
      }
      if (historial.length > 0) await tx.historialPrecio.createMany({ data: historial });

      return { actualizados: plan.cambios.length, cambiosDePrecio: historial.length, conError: plan.errores.length };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
}

// ---------------------------------------------------------------------------
// Plantilla: los productos actuales
// ---------------------------------------------------------------------------

/**
 * Productos de la empresa con las columnas editables. El stock mínimo es el de la
 * sucursal actual (o el total si se ven "Todas"), el mismo valor que muestra la lista de productos.
 */
export async function productosParaPlantilla(empresaId: number): Promise<ProductoPlantilla[]> {
  const productos = await prisma.producto.findMany({
    where: { empresaId, esPromocion: false }, // las promociones tienen su sección (#114)
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    select: {
      id: true,
      codigoBarras: true,
      nombre: true,
      stockActual: true,
      stockMinimo: true,
      monedaPrecio: true,
      precioCosto: true,
      precioVenta: true,
      precioMayorista: true,
      categoria: { select: { nombre: true } },
      marca: { select: { nombre: true } },
    },
  });
  const conMinimo = await conStockDeSucursal(productos, await sucursalParaMostrarStock());
  return conMinimo.map((p) => ({
    codigoBarras: p.codigoBarras,
    nombre: p.nombre,
    precioCosto: p.precioCosto,
    moneda: p.monedaPrecio,
    precioVenta: p.precioVenta,
    precioMayorista: p.precioMayorista,
    stockMinimo: p.stockMinimo,
    categoria: p.categoria?.nombre ?? null,
    marca: p.marca?.nombre ?? null,
  }));
}
