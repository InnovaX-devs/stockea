/**
 * Ropa (RV-5, #64): en los buscadores de venta, las combinaciones talle × color
 * de un mismo modelo se muestran como UNA fila ("Remera básica · 12
 * combinaciones"); al elegirla se abre la grilla para elegir talle y color.
 *
 * Helpers puros (sin base de datos), usables desde cliente y servidor.
 */
import type { ProductoBusquedaDTO } from "@/types/producto";
import { SEPARADOR_VARIANTE, TALLES_POR_DEFECTO } from "@/lib/variantes";

export type FilaBusqueda =
  | { tipo: "producto"; producto: ProductoBusquedaDTO }
  | {
      tipo: "modelo";
      modeloId: number;
      nombre: string;
      marca: string | null;
      /** Combinaciones que coincidieron con la búsqueda (pueden no ser todas las del modelo). */
      variantes: ProductoBusquedaDTO[];
      /** Stock sumado de esas combinaciones (de la sucursal actual). */
      stock: number;
    };

/** Nombre del modelo de una combinación ("Remera básica · M · Negro" → "Remera básica"). */
export function nombreModelo(p: ProductoBusquedaDTO): string {
  return p.modeloNombre?.trim() || p.nombre.split(SEPARADOR_VARIANTE)[0];
}

/**
 * Agrupa por modelo respetando el orden de los resultados (cada modelo aparece
 * donde apareció su primera combinación) y corta en `limite` filas.
 */
export function agruparResultados(items: ProductoBusquedaDTO[], limite = 10): FilaBusqueda[] {
  const filas: FilaBusqueda[] = [];
  const porModelo = new Map<number, Extract<FilaBusqueda, { tipo: "modelo" }>>();
  for (const p of items) {
    if (p.modeloId == null) {
      filas.push({ tipo: "producto", producto: p });
      continue;
    }
    let fila = porModelo.get(p.modeloId);
    if (!fila) {
      fila = { tipo: "modelo", modeloId: p.modeloId, nombre: nombreModelo(p), marca: p.marca?.nombre ?? null, variantes: [], stock: 0 };
      porModelo.set(p.modeloId, fila);
      filas.push(fila);
    }
    fila.variantes.push(p);
    fila.stock += p.stockActual;
  }
  return filas.slice(0, limite);
}

/** Orden natural de talles: primero los sugeridos (XS…XXL, 36…46), después números y después el resto. */
export function ordenarTalles(talles: (string | null)[]): (string | null)[] {
  const pos = (t: string | null) => {
    if (t == null) return [3, 0, ""] as const;
    const i = TALLES_POR_DEFECTO.findIndex((x) => x.toLowerCase() === t.toLowerCase());
    if (i >= 0) return [0, i, t] as const;
    const n = Number(t.replace(",", "."));
    if (!Number.isNaN(n)) return [1, n, t] as const;
    return [2, 0, t.toLowerCase()] as const;
  };
  return [...talles].sort((a, b) => {
    const [ga, na, ta] = pos(a);
    const [gb, nb, tb] = pos(b);
    return ga - gb || na - nb || ta.localeCompare(tb);
  });
}

type ConTalleColor = { talle?: string | null; color?: string | null };

export type Grilla<T extends ConTalleColor = ProductoBusquedaDTO> = {
  /** Filas (null = sin talle). */
  talles: (string | null)[];
  /** Columnas (null = sin color). */
  colores: (string | null)[];
  celda: (talle: string | null, color: string | null) => T | undefined;
};

/** Arma la grilla talle × color de las combinaciones de un modelo. */
export function armarGrilla<T extends ConTalleColor>(variantes: T[]): Grilla<T> {
  const clave = (t: string | null | undefined, c: string | null | undefined) => `${t ?? ""}\u0000${c ?? ""}`;
  const mapa = new Map(variantes.map((v) => [clave(v.talle, v.color), v]));
  const talles = ordenarTalles([...new Set(variantes.map((v) => v.talle ?? null))]);
  const colores = [...new Set(variantes.map((v) => v.color ?? null))].sort((a, b) =>
    a == null ? 1 : b == null ? -1 : a.localeCompare(b, "es")
  );
  return { talles, colores, celda: (t, c) => mapa.get(clave(t, c)) };
}
