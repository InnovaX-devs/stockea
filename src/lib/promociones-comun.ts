/**
 * Promociones (#114): reglas que usan tanto el servidor como las pantallas
 * (sin Prisma ni nada de servidor). Lo que toca la base está en
 * src/lib/promociones.ts; el descuento de stock de los componentes, en
 * src/lib/stock.ts.
 */

export type EstadoPromocion = "ACTIVA" | "PAUSADA" | "VENCIDA" | "PROGRAMADA";

type ConVigencia = {
  activo: boolean;
  vigenciaDesde: Date | string | number | null | undefined;
  vigenciaHasta: Date | string | number | null | undefined;
};

const aFecha = (v: Date | string | number) => (v instanceof Date ? v : new Date(v));

export function estadoPromocion(p: ConVigencia, ahora: Date = new Date()): EstadoPromocion {
  if (!p.activo) return "PAUSADA";
  if (p.vigenciaHasta != null && aFecha(p.vigenciaHasta) < ahora) return "VENCIDA";
  if (p.vigenciaDesde != null && aFecha(p.vigenciaDesde) > ahora) return "PROGRAMADA";
  return "ACTIVA";
}

/** Se puede vender ahora: activa y dentro de la vigencia. */
export function promocionVendible(p: ConVigencia, ahora: Date = new Date()): boolean {
  return estadoPromocion(p, ahora) === "ACTIVA";
}

export const ETIQUETA_ESTADO_PROMOCION: Record<EstadoPromocion, string> = {
  ACTIVA: "Activa",
  PAUSADA: "Pausada",
  VENCIDA: "Vencida",
  PROGRAMADA: "Programada",
};

/** Cuántas promos se pueden armar con el stock: el mínimo de (stock del componente ÷ cantidad). */
export function cuantasSePuedenArmar(componentes: { cantidad: number; stock: number }[]): number {
  if (componentes.length === 0) return 0;
  return Math.max(0, Math.min(...componentes.map((c) => Math.floor(c.stock / c.cantidad))));
}

/** "1 × Fernet 750 ml · 2 × Coca-Cola 2,25 l" (ticket, comprobante, carrito). */
export function detallePromocion(componentes: { cantidad: number; nombre: string }[]): string {
  return componentes.map((c) => `${c.cantidad} × ${c.nombre}`).join(" · ");
}

/**
 * Unidades de cada producto que hacen falta para el carrito, contando los
 * productos sueltos y los incluidos en promos (para avisar si no alcanza el
 * stock antes de agregar).
 */
export function unidadesNecesarias(
  lineas: { productoId: number; cantidad: number; componentes?: { productoId: number; cantidad: number }[] | null }[]
): Map<number, number> {
  const total = new Map<number, number>();
  const sumar = (id: number, n: number) => total.set(id, (total.get(id) ?? 0) + n);
  for (const l of lineas) {
    if (l.componentes && l.componentes.length > 0) {
      for (const c of l.componentes) sumar(c.productoId, c.cantidad * l.cantidad);
    } else {
      sumar(l.productoId, l.cantidad);
    }
  }
  return total;
}
