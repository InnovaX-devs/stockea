"use client";

import type { MovimientoCajaDTO } from "@/types/movimiento-caja";
import { ETIQUETAS_CONCEPTO } from "@/types/movimiento-caja";
import { formatCurrency } from "@/lib/currency";
import { formatFechaHoraAR } from "@/lib/timezone";

export function TablaMovimientos({ movimientos }: { movimientos: MovimientoCajaDTO[] }) {
  if (movimientos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-dim">
        No hay movimientos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="max-h-[500px] overflow-y-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-topbar sticky top-0">
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-white">
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Concepto</th>
            <th className="px-4 py-3">Medio</th>
            <th className="px-4 py-3 text-right">Monto</th>
            <th className="px-4 py-3 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => {
            const moneda = m.cuenta.tipo.endsWith("USD") ? "USD" : "ARS";
            return (
              <tr key={m.id} className="border-b border-border bg-surface last:border-0">
                <td className="px-4 py-3 text-text-dim">
                  {formatFechaHoraAR(new Date(m.fecha))}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.tipo === "INGRESO" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                    }`}
                  >
                    {m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                  </span>
                </td>
                <td className="px-4 py-3 text-text">{ETIQUETAS_CONCEPTO[m.concepto]}</td>
                <td className="px-4 py-3 text-primary">{m.cuenta.nombre}</td>
                <td className={`px-4 py-3 text-right font-semibold ${m.tipo === "INGRESO" ? "text-success" : "text-danger"}`}>
                  {m.tipo === "INGRESO" ? "+" : "-"}
                  {formatCurrency(m.monto, moneda)}
                </td>
                <td className="px-4 py-3 text-right text-text-dim">{formatCurrency(m.saldoResultante, moneda)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}