"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/currency";
import { formatFechaAR } from "@/lib/timezone";
import type { ProductoInventarioItem } from "@/app/(dashboard)/reportes/inventario/queries";

const OPCIONES_DIAS = [30, 60, 90, 120];

export function TablaInventario({
  titulo,
  items,
  columnaExtra,
  vacio,
  filtroDias,
}: {
  titulo: string;
  items: ProductoInventarioItem[];
  columnaExtra: "stock" | "ultimaVenta";
  vacio: string;
  filtroDias?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function cambiarDias(dias: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dias", String(dias));
    router.push(`/reportes/inventario?${params.toString()}`);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">{titulo}</h2>
        {filtroDias != null && (
          <div className="flex gap-1">
            {OPCIONES_DIAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => cambiarDias(d)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  d === filtroDias
                    ? "bg-primary text-white"
                    : "bg-surface text-text-dim hover:bg-surface-hover"
                }`}
              >
                {d} días
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-text-dim">{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase tracking-wide text-text-dim">
              <tr className="text-left">
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Marca</th>
                {columnaExtra === "stock" ? (
                  <>
                    <th className="px-4 py-2">Stock actual</th>
                    <th className="px-4 py-2">Stock mínimo</th>
                  </>
                ) : (
                  <th className="px-4 py-2">Última venta</th>
                )}
                <th className="px-4 py-2 text-right">Valor stock (costo)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-text">{item.nombre}</td>
                  <td className="px-4 py-2 text-text-dim">{item.marca ?? "-"}</td>
                  {columnaExtra === "stock" ? (
                    <>
                      <td className="px-4 py-2">
                        <span className={item.stockActual <= 0 ? "font-semibold text-danger" : "text-warning font-semibold"}>
                          {item.stockActual}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-text-dim">{item.stockMinimo}</td>
                    </>
                  ) : (
                    <td className="px-4 py-2 text-text-dim">
                      {item.ultimaVenta ? formatFechaAR(item.ultimaVenta) : "Nunca vendido"}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right font-medium text-text">
                    {formatCurrency(item.valorStockARS, "ARS")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
