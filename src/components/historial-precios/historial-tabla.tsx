"use client";

import { CAMPO_LABELS, ORIGEN_LABELS } from "@/lib/historial-precio-labels";
import type { HistorialPrecioDTO } from "@/types/historial-precio";

type Props = {
  items: HistorialPrecioDTO[];
  isLoading: boolean;
};

function formatFecha(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function HistorialTabla({ items, isLoading }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-topbar">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Campo</th>
              <th className="px-4 py-3">Valor anterior</th>
              <th className="px-4 py-3">Valor nuevo</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full max-w-[100px] animate-pulse rounded bg-surface-hover" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-dim">
                  No hay registros que coincidan con los filtros.
                </td>
              </tr>
            )}

            {!isLoading &&
              items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs text-text-dim">{formatFecha(item.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-text">{item.producto.nombre}</td>
                  <td className="px-4 py-3 text-text">{CAMPO_LABELS[item.campo] ?? item.campo}</td>
                  <td className="px-4 py-3 text-text-dim">
                    {item.valorAnterior !== null ? item.valorAnterior.toLocaleString("es-AR") : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-text">
                    {item.valorNuevo.toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 text-text-dim">{ORIGEN_LABELS[item.origen] ?? item.origen}</td>
                  {/* TODO: reemplazar por el usuario real cuando se resuelva
                      autenticación y se agregue usuarioId a HistorialPrecio */}
                  <td className="px-4 py-3 text-text-dim">Sistema</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}