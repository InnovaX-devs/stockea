"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, toArs } from "@/lib/currency";
import { armarGrilla } from "@/lib/agrupar-variantes";
import type { ProductoBusquedaDTO } from "@/types/producto";

/**
 * Grilla talle × color de un modelo (RV-5, #64). En cada celda: stock de la
 * sucursal y, si los precios no son todos iguales, el precio.
 * - Con `onElegir` (venta): las celdas con stock son botones.
 * - Sin `onElegir` (consultar precio): solo muestra.
 */
export function GrillaVariantes({
  variantes,
  cotizacionUSD,
  onElegir,
}: {
  variantes: ProductoBusquedaDTO[];
  cotizacionUSD: number;
  onElegir?: (p: ProductoBusquedaDTO) => void;
}) {
  const { talles, colores, celda } = armarGrilla(variantes);
  const precio = (p: ProductoBusquedaDTO) => toArs(p.precioVenta, p.monedaPrecio, cotizacionUSD);
  const precios = new Set(variantes.map((v) => Math.round(precio(v))));
  const mismoPrecio = precios.size <= 1;

  return (
    <div className="space-y-2">
      {mismoPrecio && variantes[0] && (
        <p className="text-sm text-text-dim">
          Precio: <span className="font-semibold text-text">{formatCurrency(precio(variantes[0]), "ARS")}</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-text-dim">Talle</th>
              {colores.map((c) => (
                <th key={c ?? "-"} className="px-2 py-1 text-center text-xs font-semibold text-text">
                  {c ?? "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {talles.map((t) => (
              <tr key={t ?? "-"}>
                <th className="px-2 py-1 text-left text-sm font-semibold text-text">{t ?? "—"}</th>
                {colores.map((c) => {
                  const p = celda(t, c);
                  if (!p) {
                    return (
                      <td
                        key={c ?? "-"}
                        title="Esta combinación no existe en el modelo"
                        className="rounded-md border border-dashed border-border px-2 py-2 text-center text-[11px] text-text-dim/70"
                      >
                        No existe
                      </td>
                    );
                  }
                  const sinStock = p.stockActual <= 0;
                  const contenido = (
                    <>
                      {sinStock ? (
                        <span className="block text-xs font-semibold text-danger">Sin stock</span>
                      ) : (
                        <span className="block font-mono text-sm font-semibold text-text">{p.stockActual}</span>
                      )}
                      {!mismoPrecio && <span className="block text-[11px] text-text-dim">{formatCurrency(precio(p), "ARS")}</span>}
                    </>
                  );
                  return (
                    <td key={c ?? "-"} className="p-0">
                      {onElegir ? (
                        <button
                          type="button"
                          disabled={sinStock}
                          onClick={() => onElegir(p)}
                          title={sinStock ? "Sin stock en esta sucursal" : `Agregar ${p.nombre}`}
                          className={cn(
                            "w-full rounded-md border px-2 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
                            sinStock
                              ? "cursor-not-allowed border-border bg-surface-hover/40 opacity-60"
                              : "cursor-pointer border-border bg-white hover:border-primary hover:bg-primary/5"
                          )}
                        >
                          {contenido}
                        </button>
                      ) : (
                        <div className="rounded-md border border-border bg-white px-2 py-2 text-center">{contenido}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
