import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limpiarLista, nombreVariante, normalizarValor } from "@/lib/variantes";

/**
 * Modelos de ropa (ProductoModelo) y sus combinaciones talle × color (RV-2).
 * Todo filtra SIEMPRE por empresaId, como el resto del sistema.
 */

type Db = Prisma.TransactionClient;

/**
 * ¿Ya existe esa combinación en el modelo? El índice único de la base
 * (empresaId, modeloId, talle, color) NO alcanza cuando talle o color son NULL
 * (Postgres no compara NULL con NULL), así que se chequea acá antes de crear o
 * cambiar una variante. `excluirProductoId` sirve al editar la propia.
 */
export async function existeCombinacion(
  db: Db,
  datos: { empresaId: number; modeloId: number; talle?: string | null; color?: string | null; excluirProductoId?: number }
): Promise<boolean> {
  const existente = await db.producto.findFirst({
    where: {
      empresaId: datos.empresaId,
      modeloId: datos.modeloId,
      talle: normalizarValor(datos.talle),
      color: normalizarValor(datos.color),
      ...(datos.excluirProductoId ? { id: { not: datos.excluirProductoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

/**
 * Copia el nombre, la marca y la categoría del modelo a TODAS sus
 * combinaciones. Va dentro de la misma transacción que cambia el modelo.
 * Los nombres se reconstruyen con el talle y color de cada producto.
 */
export async function sincronizarVariantesDeModelo(db: Db, empresaId: number, modeloId: number): Promise<number> {
  const modelo = await db.productoModelo.findFirst({ where: { id: modeloId, empresaId } });
  if (!modelo) throw new Error("El modelo no existe.");

  const variantes = await db.producto.findMany({
    where: { empresaId, modeloId },
    select: { id: true, nombre: true, talle: true, color: true },
  });

  for (const v of variantes) {
    const nombre = nombreVariante(modelo.nombre, v.talle, v.color);
    await db.producto.update({
      where: { id: v.id },
      data: { marcaId: modelo.marcaId, categoriaId: modelo.categoriaId, ...(nombre !== v.nombre ? { nombre } : {}) },
    });
  }
  return variantes.length;
}

export type DatosModelo = { nombre: string; marcaId?: number | null; categoriaId?: number | null };

async function validarMarcaYCategoria(db: Db, empresaId: number, d: DatosModelo) {
  if (d.marcaId && !(await db.marca.findFirst({ where: { id: d.marcaId, empresaId }, select: { id: true } }))) {
    throw new Error("La marca no existe.");
  }
  if (d.categoriaId && !(await db.categoria.findFirst({ where: { id: d.categoriaId, empresaId }, select: { id: true } }))) {
    throw new Error("La categoría no existe.");
  }
}

export async function crearModelo(empresaId: number, datos: DatosModelo) {
  const nombre = normalizarValor(datos.nombre);
  if (!nombre) throw new Error("Ingresá el nombre del modelo.");
  await validarMarcaYCategoria(prisma, empresaId, datos);
  return prisma.productoModelo.create({
    data: { empresaId, nombre, marcaId: datos.marcaId ?? null, categoriaId: datos.categoriaId ?? null },
  });
}

/**
 * Cambia nombre, marca o categoría del modelo y actualiza todas sus
 * combinaciones en la misma transacción (si algo falla, no queda nada a medias).
 */
export async function actualizarModelo(empresaId: number, modeloId: number, datos: DatosModelo) {
  const nombre = normalizarValor(datos.nombre);
  if (!nombre) throw new Error("Ingresá el nombre del modelo.");
  return prisma.$transaction(async (tx) => {
    await validarMarcaYCategoria(tx, empresaId, datos);
    const actualizado = await tx.productoModelo.updateMany({
      where: { id: modeloId, empresaId },
      data: { nombre, marcaId: datos.marcaId ?? null, categoriaId: datos.categoriaId ?? null },
    });
    if (actualizado.count === 0) throw new Error("El modelo no existe.");
    const variantes = await sincronizarVariantesDeModelo(tx, empresaId, modeloId);
    return { variantes };
  });
}

// ---------------------------------------------------------------------------
// RV-3: alta de un modelo con todas sus combinaciones, agregar talles/colores y
// cambio de precios. Todo corre en UNA transacción: si algo falla (un código de
// barras repetido, un nombre ya usado) no queda nada a medias.
// ---------------------------------------------------------------------------

const MAX_COMBINACIONES = 200;
const ALICUOTAS_IVA = [0, 2.5, 5, 10.5, 21, 27];

export type PreciosModelo = {
  monedaPrecio: "ARS" | "USD";
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
  alicuotaIva?: number;
};

export type CombinacionNueva = {
  talle: string | null;
  color: string | null;
  /** Stock inicial en la sucursal actual. */
  stock: number;
  codigoBarras?: string | null;
};

export type NuevoModelo = DatosModelo & {
  precios: PreciosModelo;
  combinaciones: CombinacionNueva[];
};

function numeroValido(valor: unknown, campo: string, { entero = false, minimo = 0 } = {}): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n < minimo) throw new Error(`${campo} inválido.`);
  if (entero && !Number.isInteger(n)) throw new Error(`${campo} tiene que ser un número entero.`);
  return n;
}

function validarPrecios(p: PreciosModelo): Required<PreciosModelo> {
  return {
    monedaPrecio: p.monedaPrecio === "ARS" ? "ARS" : "USD",
    precioCosto: numeroValido(p.precioCosto, "El precio de costo"),
    precioVenta: numeroValido(p.precioVenta, "El precio de venta"),
    precioMayorista:
      p.precioMayorista === null || p.precioMayorista === undefined || (p.precioMayorista as unknown) === ""
        ? null
        : numeroValido(p.precioMayorista, "El precio mayorista"),
    alicuotaIva: ALICUOTAS_IVA.includes(Number(p.alicuotaIva)) ? Number(p.alicuotaIva) : 21,
  };
}

const clave = (talle: string | null, color: string | null) => `${(talle ?? "").toLowerCase()}|${(color ?? "").toLowerCase()}`;

/** Rechaza si algún nombre generado ya lo usa otro producto de la empresa. */
async function validarNombresLibres(db: Db, empresaId: number, nombres: string[]) {
  const choque = await db.producto.findFirst({
    where: { empresaId, OR: nombres.map((n) => ({ nombre: { equals: n, mode: "insensitive" as const } })) },
    select: { nombre: true },
  });
  if (choque) throw new Error(`Ya existe un producto llamado "${choque.nombre}".`);
}

async function validarCodigosLibres(db: Db, empresaId: number, codigos: string[]) {
  if (codigos.length === 0) return;
  if (new Set(codigos).size !== codigos.length) throw new Error("Hay códigos de barras repetidos en las combinaciones.");
  const choque = await db.producto.findFirst({
    where: { empresaId, codigoBarras: { in: codigos } },
    select: { nombre: true, codigoBarras: true },
  });
  if (choque) throw new Error(`El código de barras "${choque.codigoBarras}" ya está asignado a "${choque.nombre}".`);
}

/**
 * Crea el modelo y una combinación (Producto común) por cada talle × color
 * pedido. `sucursalId` es donde se carga el stock inicial: si es null, solo se
 * puede crear sin stock (igual que el alta de un producto común).
 */
export async function crearModeloConCombinaciones(empresaId: number, sucursalId: number | null, entrada: NuevoModelo) {
  const nombre = normalizarValor(entrada.nombre);
  if (!nombre) throw new Error("Ingresá el nombre del modelo.");
  const precios = validarPrecios(entrada.precios);

  if (!Array.isArray(entrada.combinaciones) || entrada.combinaciones.length === 0) {
    throw new Error("Elegí al menos un talle o un color.");
  }
  if (entrada.combinaciones.length > MAX_COMBINACIONES) {
    throw new Error(`Un modelo puede tener hasta ${MAX_COMBINACIONES} combinaciones.`);
  }

  const vistas = new Set<string>();
  const combinaciones = entrada.combinaciones.map((c) => {
    const talle = normalizarValor(c.talle);
    const color = normalizarValor(c.color);
    if (!talle && !color) throw new Error("Cada combinación necesita talle o color.");
    if (vistas.has(clave(talle, color))) throw new Error(`La combinación ${[talle, color].filter(Boolean).join(" · ")} está repetida.`);
    vistas.add(clave(talle, color));
    return {
      talle,
      color,
      stock: numeroValido(c.stock ?? 0, "El stock", { entero: true }),
      codigoBarras: normalizarValor(c.codigoBarras),
    };
  });

  if (sucursalId == null && combinaciones.some((c) => c.stock > 0)) {
    throw new Error("Elegí una sucursal en la barra superior para cargar el stock.");
  }

  return prisma.$transaction(
    async (tx) => {
      await validarMarcaYCategoria(tx, empresaId, entrada);
      await validarNombresLibres(tx, empresaId, combinaciones.map((c) => nombreVariante(nombre, c.talle, c.color)));
      await validarCodigosLibres(tx, empresaId, combinaciones.map((c) => c.codigoBarras).filter((c): c is string => !!c));

      const modelo = await tx.productoModelo.create({
        data: { empresaId, nombre, marcaId: entrada.marcaId ?? null, categoriaId: entrada.categoriaId ?? null },
      });

      for (const c of combinaciones) {
        await tx.producto.create({
          data: {
            empresaId,
            modeloId: modelo.id,
            talle: c.talle,
            color: c.color,
            nombre: nombreVariante(nombre, c.talle, c.color),
            codigoBarras: c.codigoBarras,
            marcaId: modelo.marcaId,
            categoriaId: modelo.categoriaId,
            stockActual: c.stock,
            stockMinimo: 0,
            monedaPrecio: precios.monedaPrecio,
            precioCosto: precios.precioCosto,
            precioVenta: precios.precioVenta,
            precioMayorista: precios.precioMayorista,
            alicuotaIva: precios.alicuotaIva,
            activo: true,
            // Igual que el alta de un producto común: el stock inicial va a la sucursal actual.
            ...(sucursalId != null ? { stocks: { create: { sucursalId, cantidad: c.stock, stockMinimo: 0 } } } : {}),
          },
        });
      }

      return { modeloId: modelo.id, combinaciones: combinaciones.length };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

export type VarianteDetalle = {
  id: number;
  nombre: string;
  talle: string | null;
  color: string | null;
  codigoBarras: string | null;
  activo: boolean;
  stockActual: number;
  monedaPrecio: "ARS" | "USD";
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
};

export type ModeloDetalle = {
  id: number;
  nombre: string;
  marcaId: number | null;
  categoriaId: number | null;
  variantes: VarianteDetalle[];
};

export async function obtenerModeloDetalle(empresaId: number, modeloId: number): Promise<ModeloDetalle | null> {
  const modelo = await prisma.productoModelo.findFirst({
    where: { id: modeloId, empresaId },
    select: {
      id: true,
      nombre: true,
      marcaId: true,
      categoriaId: true,
      productos: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          nombre: true,
          talle: true,
          color: true,
          codigoBarras: true,
          activo: true,
          stockActual: true,
          monedaPrecio: true,
          precioCosto: true,
          precioVenta: true,
          precioMayorista: true,
        },
      },
    },
  });
  if (!modelo) return null;
  const { productos, ...datos } = modelo;
  return { ...datos, variantes: productos };
}

/**
 * Agrega al modelo las combinaciones elegidas (la pantalla muestra una vista
 * previa y la persona saca las que no existen). Cada una nace con su stock
 * inicial en la sucursal actual y con los precios de la primera combinación.
 */
export async function agregarCombinaciones(
  empresaId: number,
  sucursalId: number | null,
  modeloId: number,
  nuevas: CombinacionNueva[]
) {
  if (!Array.isArray(nuevas) || nuevas.length === 0) throw new Error("Elegí al menos una combinación para agregar.");

  const vistas = new Set<string>();
  const combinaciones = nuevas.map((c) => {
    const talle = normalizarValor(c.talle);
    const color = normalizarValor(c.color);
    if (!talle && !color) throw new Error("Cada combinación necesita talle o color.");
    if (vistas.has(clave(talle, color))) throw new Error(`La combinación ${[talle, color].filter(Boolean).join(" · ")} está repetida.`);
    vistas.add(clave(talle, color));
    return {
      talle,
      color,
      stock: numeroValido(c.stock ?? 0, "El stock", { entero: true }),
      codigoBarras: normalizarValor(c.codigoBarras),
    };
  });
  if (sucursalId == null && combinaciones.some((c) => c.stock > 0)) {
    throw new Error("Elegí una sucursal en la barra superior para cargar el stock.");
  }

  return prisma.$transaction(
    async (tx) => {
      const modelo = await tx.productoModelo.findFirst({ where: { id: modeloId, empresaId } });
      if (!modelo) throw new Error("El modelo no existe.");

      const variantes = await tx.producto.findMany({ where: { empresaId, modeloId }, orderBy: { id: "asc" } });
      const referencia = variantes[0];
      if (!referencia) throw new Error("El modelo no tiene combinaciones de las cuales copiar los precios.");

      const existentes = new Set(variantes.map((v) => clave(v.talle, v.color)));
      const repetida = combinaciones.find((c) => existentes.has(clave(c.talle, c.color)));
      if (repetida) throw new Error(`La combinación ${[repetida.talle, repetida.color].filter(Boolean).join(" · ")} ya existe.`);
      if (variantes.length + combinaciones.length > MAX_COMBINACIONES) {
        throw new Error(`Un modelo puede tener hasta ${MAX_COMBINACIONES} combinaciones.`);
      }

      await validarNombresLibres(tx, empresaId, combinaciones.map((c) => nombreVariante(modelo.nombre, c.talle, c.color)));
      await validarCodigosLibres(tx, empresaId, combinaciones.map((c) => c.codigoBarras).filter((c): c is string => !!c));

      for (const c of combinaciones) {
        await tx.producto.create({
          data: {
            empresaId,
            modeloId,
            talle: c.talle,
            color: c.color,
            nombre: nombreVariante(modelo.nombre, c.talle, c.color),
            codigoBarras: c.codigoBarras,
            marcaId: modelo.marcaId,
            categoriaId: modelo.categoriaId,
            stockActual: c.stock,
            stockMinimo: 0,
            monedaPrecio: referencia.monedaPrecio,
            precioCosto: referencia.precioCosto,
            precioVenta: referencia.precioVenta,
            precioMayorista: referencia.precioMayorista,
            alicuotaIva: referencia.alicuotaIva,
            activo: true,
            ...(sucursalId != null ? { stocks: { create: { sucursalId, cantidad: c.stock, stockMinimo: 0 } } } : {}),
          },
        });
      }
      return { creadas: combinaciones.length };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

/**
 * Borra una combinación del modelo, solo si nunca se usó: sin stock y sin
 * ventas, compras, transferencias ni presupuestos. Si ya tuvo movimientos hay
 * que desactivarla (desde Productos) para no perder su historial.
 */
export async function eliminarCombinacion(empresaId: number, modeloId: number, productoId: number) {
  return prisma.$transaction(async (tx) => {
    const variantes = await tx.producto.findMany({ where: { empresaId, modeloId }, select: { id: true, nombre: true, stockActual: true } });
    const variante = variantes.find((v) => v.id === productoId);
    if (!variante) throw new Error("La combinación no existe.");
    if (variantes.length === 1) throw new Error("Un modelo necesita al menos una combinación.");
    if (variante.stockActual !== 0) throw new Error(`"${variante.nombre}" tiene stock. Ajustalo a 0 antes de borrarla, o desactivala.`);

    const [ventas, compras, transferencias, presupuestos] = await Promise.all([
      tx.itemVenta.count({ where: { productoId } }),
      tx.itemCompra.count({ where: { productoId } }),
      tx.itemTransferencia.count({ where: { productoId } }),
      tx.presupuestoItem.count({ where: { productoId } }),
    ]);
    if (ventas + compras + transferencias + presupuestos > 0) {
      throw new Error(`"${variante.nombre}" ya tiene ventas, compras o movimientos. No se puede borrar: desactivala desde Productos.`);
    }

    // Lo único que queda son sus registros de precios y su fila de stock por sucursal (esta se borra en cascada).
    await tx.historialPrecio.deleteMany({ where: { productoId, empresaId } });
    await tx.producto.delete({ where: { id: productoId } });
    return { nombre: variante.nombre };
  });
}

/**
 * Cambia el precio de todas las combinaciones del modelo, o solo de las que se
 * indiquen en `productoIds` (por ejemplo, una). Cada cambio queda en el
 * historial de precios igual que al editar un producto común.
 * Los campos que no vengan (undefined) no se tocan.
 */
export async function actualizarPreciosDeModelo(
  empresaId: number,
  modeloId: number,
  precios: { precioCosto?: number; precioVenta?: number; precioMayorista?: number },
  productoIds?: number[]
) {
  const nuevos = {
    precioCosto: precios.precioCosto === undefined ? undefined : numeroValido(precios.precioCosto, "El precio de costo"),
    precioVenta: precios.precioVenta === undefined ? undefined : numeroValido(precios.precioVenta, "El precio de venta"),
    precioMayorista: precios.precioMayorista === undefined ? undefined : numeroValido(precios.precioMayorista, "El precio mayorista"),
  };
  if (nuevos.precioCosto === undefined && nuevos.precioVenta === undefined && nuevos.precioMayorista === undefined) {
    throw new Error("No hay precios para cambiar.");
  }

  return prisma.$transaction(async (tx) => {
    const modelo = await tx.productoModelo.findFirst({ where: { id: modeloId, empresaId }, select: { nombre: true } });
    if (!modelo) throw new Error("El modelo no existe.");

    const variantes = await tx.producto.findMany({
      where: { empresaId, modeloId, ...(productoIds ? { id: { in: productoIds } } : {}) },
    });
    if (variantes.length === 0) throw new Error("No se encontraron combinaciones para actualizar.");

    const historial: Prisma.HistorialPrecioCreateManyInput[] = [];
    let actualizadas = 0;

    for (const v of variantes) {
      const data: Prisma.ProductoUpdateInput = {};
      const registrar = (campo: "COSTO" | "MINORISTA" | "MAYORISTA", anterior: number | null, nuevo: number) => {
        historial.push({
          productoId: v.id,
          empresaId,
          campo,
          valorAnterior: anterior,
          valorNuevo: nuevo,
          origen: "MANUAL",
          detalle: `Modelo "${modelo.nombre}"`,
        });
      };

      if (nuevos.precioCosto !== undefined && Number(v.precioCosto) !== nuevos.precioCosto) {
        registrar("COSTO", Number(v.precioCosto), nuevos.precioCosto);
        data.precioCosto = nuevos.precioCosto;
      }
      if (nuevos.precioVenta !== undefined && Number(v.precioVenta) !== nuevos.precioVenta) {
        registrar("MINORISTA", Number(v.precioVenta), nuevos.precioVenta);
        data.precioVenta = nuevos.precioVenta;
      }
      if (nuevos.precioMayorista !== undefined && (v.precioMayorista === null ? null : Number(v.precioMayorista)) !== nuevos.precioMayorista) {
        registrar("MAYORISTA", v.precioMayorista === null ? null : Number(v.precioMayorista), nuevos.precioMayorista);
        data.precioMayorista = nuevos.precioMayorista;
      }

      if (Object.keys(data).length > 0) {
        await tx.producto.update({ where: { id: v.id }, data });
        actualizadas++;
      }
    }

    if (historial.length > 0) await tx.historialPrecio.createMany({ data: historial });
    return { actualizadas };
  });
}
