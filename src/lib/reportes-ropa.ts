import type { ReporteRopaData, RankingModeloItem, RankingVarianteItem } from "@/types/reporte-ropa";

/** Venta mínima que necesita el reporte de ropa (la arma queries.ts). */
export type VentaRopa = {
  totalARS: number;
  montoPagado: number;
  cotizacionUsada: number;
  items: {
    cantidad: number;
    precioUnitarioUSD: number;
    modeloId: number | null;
    modeloNombre: string | null;
    talle: string | null;
    color: string | null;
  }[];
};

const SIN_DATO = "Sin especificar";

/**
 * Ranking por modelo, talle y color. Usa el mismo prorrateo que
 * calcularTopProductos (descuento global × proporción cobrada) para que los
 * montos coincidan con el resto de Reportes. Los ítems libres ("Varios") y los
 * productos sin modelo ni talle ni color quedan afuera.
 */
export function calcularReporteRopa(ventas: VentaRopa[], limite = 10): ReporteRopaData {
  const modelos = new Map<string, RankingModeloItem>();
  const talles = new Map<string, RankingVarianteItem>();
  const colores = new Map<string, RankingVarianteItem>();
  let totalUnidades = 0;

  const sumar = (mapa: Map<string, RankingVarianteItem>, valor: string | null, cantidad: number, monto: number) => {
    const clave = valor ?? SIN_DATO;
    const actual = mapa.get(clave) ?? { valor: clave, cantidad: 0, montoARS: 0 };
    actual.cantidad += cantidad;
    actual.montoARS += monto;
    mapa.set(clave, actual);
  };

  for (const venta of ventas) {
    const proporcionCobrada = venta.totalARS > 0 ? Math.min(venta.montoPagado / venta.totalARS, 1) : 0;
    const montoLista = venta.items.reduce((a, i) => a + i.cantidad * i.precioUnitarioUSD * venta.cotizacionUsada, 0);
    const factorDescuento = montoLista > 0 ? venta.totalARS / montoLista : 1;

    for (const item of venta.items) {
      const esRopa = item.modeloId != null || item.talle != null || item.color != null;
      if (!esRopa) continue;

      const monto = item.cantidad * item.precioUnitarioUSD * venta.cotizacionUsada * factorDescuento * proporcionCobrada;
      totalUnidades += item.cantidad;

      const clave = String(item.modeloId ?? "sin-modelo");
      const m = modelos.get(clave) ?? {
        modeloId: item.modeloId,
        nombre: item.modeloNombre ?? "(sin modelo)",
        cantidad: 0,
        montoARS: 0,
      };
      m.cantidad += item.cantidad;
      m.montoARS += monto;
      modelos.set(clave, m);

      sumar(talles, item.talle, item.cantidad, monto);
      sumar(colores, item.color, item.cantidad, monto);
    }
  }

  const ordenar = <T extends { cantidad: number }>(m: Map<string, T>, max?: number) => {
    const lista = Array.from(m.values()).sort((a, b) => b.cantidad - a.cantidad);
    return max ? lista.slice(0, max) : lista;
  };

  return {
    porModelo: ordenar(modelos, limite),
    porTalle: ordenar(talles),
    porColor: ordenar(colores),
    totalUnidades,
  };
}