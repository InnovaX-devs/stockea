"use client";

import { useEffect, useState } from "react";
import { formatFechaHoraAR } from "@/lib/timezone";
import type { EventoCuentaCorriente } from "@/lib/cuenta-corriente-proveedor";

const fmt = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function CuentaCorrienteProveedorModal({
  proveedor,
  onClose,
}: {
  proveedor: { id: string; nombre: string } | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ saldo: number; eventos: EventoCuentaCorriente[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!proveedor) return;
    setData(null);
    setError("");
    fetch(`/api/proveedores/${proveedor.id}/cuenta-corriente`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError("No se pudo cargar la cuenta corriente."));
  }, [proveedor]);

  if (!proveedor) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <h2 className="min-w-0 truncate text-lg font-semibold text-text">Cuenta corriente — {proveedor.nombre}</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text cursor-pointer">✕</button>
        </div>

        {error && <div className="mt-4 rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</div>}
        {!data && !error && <p className="mt-6 text-sm text-text-dim">Cargando…</p>}

        {data && (
          <>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-topbar px-4 py-3 text-white">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Saldo (se le debe)</p>
                <p className="text-2xl font-semibold">{fmt(data.saldo)}</p>
              </div>
              <a
                href={`/api/proveedores/${proveedor.id}/resumen`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
              >
                Descargar PDF
              </a>
            </div>

            {data.eventos.length === 0 ? (
              <p className="mt-6 text-center text-sm text-text-dim">Todavía no hay movimientos.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-text-dim">
                      <th className="py-2 pr-3">Fecha</th>
                      <th className="py-2 pr-3">Detalle</th>
                      <th className="py-2 pr-3 text-right">Cargo</th>
                      <th className="py-2 pr-3 text-right">Abono</th>
                      <th className="py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.eventos.map((e) => (
                      <tr key={e.id} className="border-t border-border align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-text-dim">{formatFechaHoraAR(new Date(e.fecha))}</td>
                        <td className="py-2 pr-3">
                          <p className="text-text">{e.label}</p>
                          {e.sublabel && <p className="text-xs text-text-dim">{e.sublabel}</p>}
                        </td>
                        <td className="py-2 pr-3 text-right text-danger">{e.tipo === "cargo" ? fmt(e.monto) : ""}</td>
                        <td className="py-2 pr-3 text-right text-primary">{e.tipo === "abono" ? fmt(e.monto) : ""}</td>
                        <td className="py-2 text-right font-medium text-text">{fmt(e.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
