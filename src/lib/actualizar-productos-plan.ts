import type { Prisma } from "@prisma/client";
import type { ErrorFila, FilaActualizacion } from "@/lib/actualizar-productos-parseo";

/**
 * Actualizar productos en lote desde un CSV (issue #109) — PLAN DE CAMBIOS, sin base de datos.
 *
 * Compara las filas del archivo con los productos que hay HOY y arma, para cada una:
 * qué cambia (valor anterior → nuevo), o por qué no se puede. Es una función pura
 * (los datos actuales entran por parámetro) para poder probarla sin base y para que
 * la vista previa y la confirmación usen exactamente la misma lógica.
 *
 * Reglas:
 *  - Se encuentra el producto por código de barras o, si la fila no lo trae, por nombre exacto
 *    (tiene que haber un solo producto con ese nombre). Código y nombre son la clave: no se cambian.
 *  - Un valor igual al actual no es un cambio. Una celda vacía o una columna ausente tampoco.
 *  - Una fila con algún error no se aplica NI EN PARTE: o entra completa o no entra.
 *  - Marca y categoría tienen que existir (no se crean desde acá).
 *  - Las combinaciones de un modelo (ropa) no cambian marca ni categoría desde acá:
 *    esos datos viven en el modelo.
 */

export type ContextoActualizacion = {
  empresaId: number;
  /** Sucursal actual; null = el admin está viendo "Todas". */
  sucursalId: number | null;
  /** Hay más de una sucursal: el stock mínimo del archivo es el de la sucursal actual. */
  multisucursal: boolean;
  /** La empresa vende en dólares. */
  permiteUSD: boolean;
};

export type ProductoActual = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  modeloId: number | null;
  marcaId: number | null;
  categoriaId: number | null;
  monedaPrecio: "ARS" | "USD";
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
  precioAbierto: boolean;
  /** Es una promoción (#114): tiene su propia sección y no se edita desde acá. */
  esPromocion: boolean;
  /** Total de todas las sucursales (lo que guarda "Producto"). */
  stockMinimo: number;
};

export type DatosActuales = {
  productos: ProductoActual[];
  marcas: { id: number; nombre: string }[];
  categorias: { id: number; nombre: string }[];
  /** Stock mínimo por producto en la sucursal actual; null cuando se compara contra el total. */
  minimoSucursal: Map<number, number> | null;
};

export type CampoCambio = "precioCosto" | "moneda" | "precioVenta" | "precioMayorista" | "stockMinimo" | "categoria" | "marca";

/** Un valor que cambia, ya formateado para mostrar. */
export type CambioCampo = { campo: CampoCambio; etiqueta: string; anterior: string; nuevo: string };

export type ProductoQueCambia = { fila: number; productoId: number; nombre: string; cambios: CambioCampo[] };

export type CampoHistorial = "COSTO" | "MINORISTA" | "MAYORISTA";

/** Lo mismo que ProductoQueCambia más lo que hace falta para escribir en la base. */
export type CambioAplicable = ProductoQueCambia & {
  datos: Prisma.ProductoUncheckedUpdateManyInput;
  /** Nuevo stock mínimo de la sucursal actual (si cambia). */
  minimo?: number;
  historial: { campo: CampoHistorial; anterior: number | null; nuevo: number }[];
};

export type PlanActualizacion = {
  cambios: CambioAplicable[];
  sinCambios: number;
  errores: ErrorFila[];
  /** Algo impide aplicar (por ejemplo, falta elegir sucursal). La vista previa se muestra igual. */
  bloqueo: string | null;
};

const clave = (s: string) => s.trim().toLowerCase();
const claveNombre = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const centavos = (n: number | null) => (n == null ? null : Math.round(n * 100));

const dinero = (n: number | null, moneda: "ARS" | "USD") =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);

export function planificarActualizacion(
  filas: FilaActualizacion[],
  erroresArchivo: ErrorFila[],
  datos: DatosActuales,
  ctx: ContextoActualizacion
): PlanActualizacion {
    const porCodigo = new Map(datos.productos.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras as string, p]));
  // Nombres normalizados (minúsculas, espacios colapsados). Incluye las promociones para detectarlas.
  const porNombre = new Map<string, ProductoActual[]>();
  for (const p of datos.productos) {
    const k = claveNombre(p.nombre);
    (porNombre.get(k) ?? porNombre.set(k, []).get(k)!).push(p);
  }
  const marcas = new Map(datos.marcas.map((m) => [clave(m.nombre), m]));
  const categorias = new Map(datos.categorias.map((c) => [clave(c.nombre), c]));
  const nombreMarca = new Map(datos.marcas.map((m) => [m.id, m.nombre]));
  const nombreCategoria = new Map(datos.categorias.map((c) => [c.id, c.nombre]));

  const errores = [...erroresArchivo];
  const cambios: CambioAplicable[] = [];
  let sinCambios = 0;
  let bloqueo: string | null = null;

  const filaDeProducto = new Map<number, number>();
  const puedeCambiarMinimo = !ctx.multisucursal || ctx.sucursalId != null;

  for (const f of filas) {
    // 1. ¿Qué producto es?
    let producto: ProductoActual | undefined;
    if (f.codigoBarras) {
      producto = porCodigo.get(f.codigoBarras);
      if (!producto) {
        errores.push({ fila: f.fila, mensaje: `No existe ningún producto con el código de barras ${f.codigoBarras}.` });
        continue;
      }
    } else {
      const candidatos = porNombre.get(claveNombre(f.nombre ?? "")) ?? [];
      if (candidatos.length === 0) {
        errores.push({ fila: f.fila, mensaje: `No existe ningún producto que se llame "${f.nombre}".` });
        continue;
      }
      if (candidatos.length > 1) {
        errores.push({ fila: f.fila, mensaje: `Hay ${candidatos.length} productos que se llaman "${f.nombre}": agregá el código de barras para saber cuál es.` });
        continue;
      }
      producto = candidatos[0];
    }
    if (producto.esPromocion) {
      errores.push({ fila: f.fila, mensaje: `"${producto.nombre}" es una promoción: se edita desde Promociones.` });
      continue;
    }
    const repetida = filaDeProducto.get(producto.id);
    if (repetida) {
      errores.push({ fila: f.fila, mensaje: `Repetido: es el mismo producto que la fila ${repetida}.` });
      continue;
    }
    filaDeProducto.set(producto.id, f.fila);

    // 2. ¿Qué cambia?
    const problemas: string[] = [];
    const campos: CambioCampo[] = [];
    const datosNuevos: Prisma.ProductoUncheckedUpdateManyInput = {};
    const historial: CambioAplicable["historial"] = [];
    let minimo: number | undefined;
    const monedaAntes = producto.monedaPrecio;
    const monedaFinal = f.moneda ?? monedaAntes;
    const esModelo = producto.modeloId != null;
    let avisoModelo = false;
    const deModelo = (campo: string) => {
      if (!avisoModelo) problemas.push(`Es una combinación de un modelo: ${campo} se cambia desde el modelo.`);
      avisoModelo = true;
    };

    // Marca y categoría: tienen que existir.
    for (const tipo of ["marca", "categoria"] as const) {
      const pedido = f[tipo];
      if (pedido === undefined) continue;
      const lista = tipo === "marca" ? marcas : categorias;
      const actualId = tipo === "marca" ? producto.marcaId : producto.categoriaId;
      const nombres = tipo === "marca" ? nombreMarca : nombreCategoria;
      const encontrada = lista.get(clave(pedido));
      if (!encontrada) {
        problemas.push(`La ${tipo === "marca" ? "marca" : "categoría"} "${pedido}" no existe.`);
      } else if (encontrada.id !== actualId) {
        if (esModelo) deModelo("la marca y la categoría");
        else {
          if (tipo === "marca") datosNuevos.marcaId = encontrada.id;
          else datosNuevos.categoriaId = encontrada.id;
          campos.push({
            campo: tipo,
            etiqueta: tipo === "marca" ? "Marca" : "Categoría",
            anterior: actualId == null ? "—" : (nombres.get(actualId) ?? "—"),
            nuevo: encontrada.nombre,
          });
        }
      }
    }

    // Moneda
    if (f.moneda !== undefined && f.moneda !== monedaAntes) {
      if (f.moneda === "USD" && !ctx.permiteUSD) problemas.push("Tu negocio no vende en dólares: usá ARS.");
      else {
        datosNuevos.monedaPrecio = f.moneda;
        campos.push({ campo: "moneda", etiqueta: "Moneda", anterior: monedaAntes, nuevo: f.moneda });
      }
    }

    // Precios: cada uno que cambia queda en el historial de precios.
    const precios = [
      { campo: "precioCosto", etiqueta: "Costo", historial: "COSTO", anterior: producto.precioCosto, nuevo: f.precioCosto },
      { campo: "precioVenta", etiqueta: "Precio minorista", historial: "MINORISTA", anterior: producto.precioVenta, nuevo: f.precioVenta },
      { campo: "precioMayorista", etiqueta: "Precio mayorista", historial: "MAYORISTA", anterior: producto.precioMayorista, nuevo: f.precioMayorista },
    ] as const;
    for (const p of precios) {
      if (p.nuevo === undefined || centavos(p.nuevo) === centavos(p.anterior)) continue;
      if (p.campo === "precioVenta" && p.nuevo === 0 && !producto.precioAbierto) {
        problemas.push("El precio minorista no puede ser 0.");
        continue;
      }
      datosNuevos[p.campo] = p.nuevo;
      historial.push({ campo: p.historial, anterior: p.anterior, nuevo: p.nuevo });
      campos.push({ campo: p.campo, etiqueta: p.etiqueta, anterior: dinero(p.anterior, monedaAntes), nuevo: dinero(p.nuevo, monedaFinal) });
    }

    // Stock mínimo (por sucursal)
    if (f.stockMinimo !== undefined) {
      const actual = datos.minimoSucursal ? (datos.minimoSucursal.get(producto.id) ?? 0) : producto.stockMinimo;
      if (f.stockMinimo !== actual) {
        if (!puedeCambiarMinimo) {
          bloqueo = 'Elegí una sucursal en la barra superior para cambiar el stock mínimo (hoy estás viendo "Todas").';
        }
        minimo = f.stockMinimo;
        campos.push({ campo: "stockMinimo", etiqueta: "Stock mínimo", anterior: String(actual), nuevo: String(f.stockMinimo) });
      }
    }

    // 3. Resultado de la fila: entra completa o no entra.
    if (problemas.length > 0) {
      errores.push({ fila: f.fila, mensaje: problemas.join(" ") });
      continue;
    }
    if (campos.length === 0) {
      sinCambios++;
      continue;
    }
    cambios.push({
      fila: f.fila,
      productoId: producto.id,
      nombre: producto.nombre,
      cambios: campos,
      datos: datosNuevos,
      ...(minimo !== undefined ? { minimo } : {}),
      historial,
    });
  }

  errores.sort((a, b) => a.fila - b.fila);
  return { cambios, sinCambios, errores, bloqueo };
}
