import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nombreVariante } from "@/lib/variantes";
import type { ErrorFila, FilaImportacion } from "@/lib/importar-productos-parseo";

/**
 * Importación de productos desde Excel (solo plan Pro) — PARTE QUE USA LA BASE.
 * La lectura y validación del archivo está en importar-productos-parseo.ts.
 *
 * Dos pasos, los dos sobre el MISMO archivo:
 *  1. analizarImportacion: compara las filas válidas con lo que ya hay en la
 *     base (no escribe nada) y arma el resumen para mostrar antes de confirmar.
 *  2. importarFilas: crea lo que el análisis marcó como nuevo.
 * Al confirmar se vuelve a analizar, así lo que se crea es siempre lo que la
 * base permite en ese momento (nunca se confía en lo que mostró la pantalla).
 *
 * Los productos que ya existen (mismo código de barras, mismo nombre, o misma
 * combinación talle × color de un modelo) NO se tocan: se omiten.
 */

type Db = Prisma.TransactionClient;

const TAMANO_LOTE = 400;

export type FilaNueva = FilaImportacion & {
  /** Nombre visible del producto ("Remera básica · M · Negro"). */
  nombreFinal: string;
  /** Es una combinación de un modelo (tiene talle o color). */
  esVariante: boolean;
};

export type ResumenImportacion = {
  /** Filas con datos del archivo. */
  total: number;
  nuevas: number;
  /** Ya existían: se omiten. */
  omitidas: number;
  conError: number;
  /** Modelos (ropa) que se van a crear, y a los que se les agregan combinaciones. */
  modelosNuevos: number;
  modelosExistentes: number;
  /** Marcas y categorías que no existen todavía y se van a crear (nombres tal cual vienen en el Excel). */
  marcasNuevas: string[];
  categoriasNuevas: string[];
  stockTotal: number;
  errores: ErrorFila[];
  /** Cuántos errores más hay que no se listan. */
  erroresOcultos: number;
  omitidasDetalle: { fila: number; nombre: string }[];
  omitidasOcultas: number;
  muestra: { fila: number; nombre: string; stock: number; precioVenta: number; moneda: "ARS" | "USD" }[];
};

const MAX_ERRORES_LISTADOS = 200;
const MAX_OMITIDAS_LISTADAS = 50;
const MAX_PRODUCTOS_LISTADOS = 100;

const claveNombre = (s: string) => s.trim().toLowerCase();

/** Nombres (sin repetir, sin distinguir mayúsculas) que vienen en el archivo y todavía no existen. */
function nombresQueFaltan(delArchivo: (string | null)[], existentes: string[]): string[] {
  const ya = new Set(existentes.map(claveNombre));
  const faltan = new Map<string, string>();
  for (const n of delArchivo) {
    if (n && !ya.has(claveNombre(n)) && !faltan.has(claveNombre(n))) faltan.set(claveNombre(n), n.trim());
  }
  return [...faltan.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export async function analizarImportacion(
  empresaId: number,
  validas: FilaImportacion[],
  erroresArchivo: ErrorFila[],
  total: number
): Promise<{ resumen: ResumenImportacion; aCrear: FilaNueva[] }> {
  const [productos, modelos, marcas, categorias] = await Promise.all([
    prisma.producto.findMany({ where: { empresaId }, select: { nombre: true, codigoBarras: true, modeloId: true, talle: true, color: true } }),
    prisma.productoModelo.findMany({ where: { empresaId }, select: { id: true, nombre: true } }),
    prisma.marca.findMany({ where: { empresaId }, select: { nombre: true } }),
    prisma.categoria.findMany({ where: { empresaId }, select: { nombre: true } }),
  ]);

  const nombres = new Map(productos.map((p) => [claveNombre(p.nombre), p]));
  const codigos = new Map(productos.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras as string, p]));
  const modeloPorNombre = new Map(modelos.map((m) => [claveNombre(m.nombre), m.id]));
  const combinaciones = new Set(
    productos.filter((p) => p.modeloId != null).map((p) => `${p.modeloId}|${(p.talle ?? "").toLowerCase()}|${(p.color ?? "").toLowerCase()}`)
  );

  const errores = [...erroresArchivo];
  const omitidas: { fila: number; nombre: string }[] = [];
  const aCrear: FilaNueva[] = [];
  const nombresNuevos = new Map<string, number>(); // nombre final → fila (un producto común puede llamarse igual que una combinación)

  for (const f of validas) {
    const esVariante = Boolean(f.talle || f.color);
    const nombreFinal = esVariante ? nombreVariante(f.nombre, f.talle, f.color) : f.nombre;

    // ¿Ya existe esa combinación o ese nombre? Entonces se omite.
    const modeloId = esVariante ? modeloPorNombre.get(claveNombre(f.nombre)) : undefined;
    const existeCombinacion = modeloId != null && combinaciones.has(`${modeloId}|${(f.talle ?? "").toLowerCase()}|${(f.color ?? "").toLowerCase()}`);
    if (existeCombinacion || nombres.has(claveNombre(nombreFinal))) {
      omitidas.push({ fila: f.fila, nombre: nombreFinal });
      continue;
    }

    // Código de barras de OTRO producto: no se puede crear.
    const choque = f.codigoBarras ? codigos.get(f.codigoBarras) : undefined;
    if (choque) {
      errores.push({ fila: f.fila, mensaje: `El código de barras ${f.codigoBarras} ya está asignado a "${choque.nombre}".` });
      continue;
    }

    const repetido = nombresNuevos.get(claveNombre(nombreFinal));
    if (repetido) {
      errores.push({ fila: f.fila, mensaje: `Se llama igual que el producto de la fila ${repetido} ("${nombreFinal}").` });
      continue;
    }
    nombresNuevos.set(claveNombre(nombreFinal), f.fila);

    aCrear.push({ ...f, nombreFinal, esVariante });
  }

  errores.sort((a, b) => a.fila - b.fila);
  omitidas.sort((a, b) => a.fila - b.fila);

  const nombresModelo = new Set(aCrear.filter((f) => f.esVariante).map((f) => claveNombre(f.nombre)));
  const modelosExistentes = [...nombresModelo].filter((n) => modeloPorNombre.has(n)).length;

  // Marcas y categorías que se crean: solo cuentan las filas que usan sus propios datos
  // (un modelo que ya existe conserva los suyos).
  const usanSusDatos = aCrear.filter((f) => !f.esVariante || !modeloPorNombre.has(claveNombre(f.nombre)));
  const marcasNuevas = nombresQueFaltan(usanSusDatos.map((f) => f.marca), marcas.map((m) => m.nombre));
  const categoriasNuevas = nombresQueFaltan(usanSusDatos.map((f) => f.categoria), categorias.map((c) => c.nombre));

  return {
    aCrear,
    resumen: {
      total,
      nuevas: aCrear.length,
      omitidas: omitidas.length,
      conError: errores.length,
      modelosNuevos: nombresModelo.size - modelosExistentes,
      modelosExistentes,
      marcasNuevas,
      categoriasNuevas,
      stockTotal: aCrear.reduce((s, f) => s + f.stock, 0),
      errores: errores.slice(0, MAX_ERRORES_LISTADOS),
      erroresOcultos: Math.max(0, errores.length - MAX_ERRORES_LISTADOS),
      omitidasDetalle: omitidas.slice(0, MAX_OMITIDAS_LISTADAS),
      omitidasOcultas: Math.max(0, omitidas.length - MAX_OMITIDAS_LISTADAS),
      muestra: aCrear.slice(0, 8).map((f) => ({ fila: f.fila, nombre: f.nombreFinal, stock: f.stock, precioVenta: f.precioVenta, moneda: f.moneda })),
    },
  };
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

export type ResultadoImportacion = {
  creados: number;
  /** Nombres de lo que se creó (se listan los primeros; el resto está en `productosOcultos`). */
  productosCreados: string[];
  productosOcultos: number;
  modelosCreados: string[];
  marcasCreadas: string[];
  categoriasCreadas: string[];
  /** Filas que no se pudieron crear (por ejemplo, alguien creó el mismo producto mientras tanto). */
  fallidas: ErrorFila[];
};

/** Busca por nombre (sin distinguir mayúsculas) y crea las marcas o categorías que faltan. */
async function resolverNombres(empresaId: number, tipo: "marca" | "categoria", nombres: string[]) {
  const unicos = new Map<string, string>(); // clave → primer nombre tal cual vino
  for (const n of nombres) if (!unicos.has(claveNombre(n))) unicos.set(claveNombre(n), n.trim());
  const ids = new Map<string, number>();
  const creadas: string[] = [];
  if (unicos.size === 0) return { ids, creadas };

  const delegado = (tipo === "marca" ? prisma.marca : prisma.categoria) as unknown as typeof prisma.marca;
  for (const existente of await delegado.findMany({ where: { empresaId }, select: { id: true, nombre: true } })) {
    if (unicos.has(claveNombre(existente.nombre))) ids.set(claveNombre(existente.nombre), existente.id);
  }

  for (const [clave, nombre] of unicos) {
    if (ids.has(clave)) continue;
    try {
      ids.set(clave, (await delegado.create({ data: { empresaId, nombre }, select: { id: true } })).id);
      creadas.push(nombre);
    } catch {
      // Alguien la creó justo ahora (índice único): se usa esa.
      const ya = await delegado.findFirst({ where: { empresaId, nombre: { equals: nombre, mode: "insensitive" } }, select: { id: true } });
      if (!ya) throw new Error(`No se pudo crear la ${tipo} "${nombre}".`);
      ids.set(clave, ya.id);
    }
  }
  return { ids, creadas };
}

type Contexto = {
  empresaId: number;
  sucursalId: number | null;
  marcas: Map<string, number>;
  categorias: Map<string, number>;
  /** Marca y categoría de cada modelo, tomadas de TODAS sus filas (un modelo puede quedar partido en dos lotes). */
  datosModelo: Map<string, { marca: string | null; categoria: string | null }>;
};

/**
 * Crea un lote de productos en UNA transacción: modelos que falten, productos
 * (en una sola consulta) y su stock en la sucursal. Si algo falla, no queda nada
 * a medias; el que llama reintenta fila por fila para saber cuál fue.
 */
async function crearLote(ctx: Contexto, filas: FilaNueva[]) {
  return prisma.$transaction(
    async (tx: Db) => {
      const { empresaId, sucursalId } = ctx;

      // Modelos: se usan los que ya existen y se crean los que faltan.
      const modeloIds = new Map((await tx.productoModelo.findMany({ where: { empresaId }, select: { id: true, nombre: true, marcaId: true, categoriaId: true } })).map((m) => [claveNombre(m.nombre), m]));
      const modelosCreados: string[] = [];
      for (const f of filas) {
        const clave = claveNombre(f.nombre);
        if (!f.esVariante || modeloIds.has(clave)) continue;
        const marca = ctx.datosModelo.get(clave)?.marca;
        const categoria = ctx.datosModelo.get(clave)?.categoria;
        const creado = await tx.productoModelo.create({
          data: {
            empresaId,
            nombre: f.nombre.trim(),
            marcaId: marca ? (ctx.marcas.get(claveNombre(marca)) ?? null) : null,
            categoriaId: categoria ? (ctx.categorias.get(claveNombre(categoria)) ?? null) : null,
          },
          select: { id: true, nombre: true, marcaId: true, categoriaId: true },
        });
        modeloIds.set(clave, creado);
        modelosCreados.push(creado.nombre);
      }

      const datos: Prisma.ProductoCreateManyInput[] = filas.map((f) => {
        const modelo = f.esVariante ? modeloIds.get(claveNombre(f.nombre)) : undefined;
        return {
          empresaId,
          nombre: f.nombreFinal,
          codigoBarras: f.codigoBarras,
          ...(modelo ? { modeloId: modelo.id, talle: f.talle, color: f.color, marcaId: modelo.marcaId, categoriaId: modelo.categoriaId } : {}),
          ...(!modelo
            ? {
                marcaId: f.marca ? (ctx.marcas.get(claveNombre(f.marca)) ?? null) : null,
                categoriaId: f.categoria ? (ctx.categorias.get(claveNombre(f.categoria)) ?? null) : null,
              }
            : {}),
          stockActual: f.stock,
          stockMinimo: f.stockMinimo,
          monedaPrecio: f.moneda,
          precioCosto: f.precioCosto,
          precioVenta: f.precioVenta,
          precioMayorista: f.precioMayorista,
          alicuotaIva: f.alicuotaIva,
          activo: true,
        };
      });
      await tx.producto.createMany({ data: datos });

      // Stock por sucursal: igual que el alta manual, una fila por producto en la sucursal actual.
      if (sucursalId != null) {
        const creados = await tx.producto.findMany({
          where: { empresaId, nombre: { in: filas.map((f) => f.nombreFinal) } },
          select: { id: true, nombre: true },
        });
        const idPorNombre = new Map(creados.map((p) => [claveNombre(p.nombre), p.id]));
        await tx.stockSucursal.createMany({
          data: filas.map((f) => ({
            productoId: idPorNombre.get(claveNombre(f.nombreFinal)) as number,
            sucursalId,
            cantidad: f.stock,
            stockMinimo: f.stockMinimo,
          })),
        });
      }
      return { modelosCreados };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

/**
 * Crea las filas que `analizarImportacion` marcó como nuevas. `sucursalId` es
 * la sucursal actual (null = "Todas": solo se puede importar sin stock).
 */
export async function importarFilas(empresaId: number, sucursalId: number | null, filas: FilaNueva[]): Promise<ResultadoImportacion> {
  if (sucursalId == null && filas.some((f) => f.stock > 0)) {
    throw new Error("Elegí una sucursal en la barra superior para cargar el stock.");
  }

  // Un modelo que ya existe conserva su marca y categoría: las de sus filas nuevas no se usan
  // (y por lo tanto no se crean marcas ni categorías de más).
  const modelosYa = new Set((await prisma.productoModelo.findMany({ where: { empresaId }, select: { nombre: true } })).map((m) => claveNombre(m.nombre)));
  const usanSusDatos = filas.filter((f) => !f.esVariante || !modelosYa.has(claveNombre(f.nombre)));
  const [marcas, categorias] = await Promise.all([
    resolverNombres(empresaId, "marca", usanSusDatos.map((f) => f.marca).filter((x): x is string => !!x)),
    resolverNombres(empresaId, "categoria", usanSusDatos.map((f) => f.categoria).filter((x): x is string => !!x)),
  ]);
  // Marca y categoría de cada modelo: la primera que venga cargada en cualquiera de sus filas.
  const datosModelo = new Map<string, { marca: string | null; categoria: string | null }>();
  for (const f of filas) {
    if (!f.esVariante) continue;
    const actual = datosModelo.get(claveNombre(f.nombre)) ?? { marca: null, categoria: null };
    datosModelo.set(claveNombre(f.nombre), { marca: actual.marca ?? f.marca, categoria: actual.categoria ?? f.categoria });
  }
  const ctx: Contexto = { empresaId, sucursalId, marcas: marcas.ids, categorias: categorias.ids, datosModelo };

  // Las combinaciones de un mismo modelo van juntas (el modelo se crea una sola vez por lote).
  const ordenadas = [...filas].sort((a, b) => Number(b.esVariante) - Number(a.esVariante) || claveNombre(a.nombre).localeCompare(claveNombre(b.nombre)) || a.fila - b.fila);

  const resultado: ResultadoImportacion = {
    creados: 0,
    productosCreados: [],
    productosOcultos: 0,
    modelosCreados: [],
    marcasCreadas: marcas.creadas,
    categoriasCreadas: categorias.creadas,
    fallidas: [],
  };
  const creados: string[] = [];

  for (let i = 0; i < ordenadas.length; i += TAMANO_LOTE) {
    const lote = ordenadas.slice(i, i + TAMANO_LOTE);
    try {
      resultado.modelosCreados.push(...(await crearLote(ctx, lote)).modelosCreados);
      resultado.creados += lote.length;
      creados.push(...lote.map((f) => f.nombreFinal));
    } catch {
      // Algo del lote chocó (típico: alguien creó el mismo producto mientras tanto).
      // Se reintenta de a uno para saber cuáles entraron y cuáles no.
      for (const fila of lote) {
        try {
          resultado.modelosCreados.push(...(await crearLote(ctx, [fila])).modelosCreados);
          resultado.creados++;
          creados.push(fila.nombreFinal);
        } catch (e) {
          const duplicado = typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";
          resultado.fallidas.push({
            fila: fila.fila,
            mensaje: duplicado ? "Ya existe un producto con ese nombre o código de barras." : "No se pudo crear este producto.",
          });
        }
      }
    }
  }

  resultado.fallidas.sort((a, b) => a.fila - b.fila);
  creados.sort((a, b) => a.localeCompare(b, "es"));
  resultado.productosCreados = creados.slice(0, MAX_PRODUCTOS_LISTADOS);
  resultado.productosOcultos = Math.max(0, creados.length - MAX_PRODUCTOS_LISTADOS);
  return resultado;
}
