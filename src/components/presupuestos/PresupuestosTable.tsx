"use client";

import { useState } from "react";
import Link from "next/link";
import type { PresupuestoListado } from "../../app/(dashboard)/presupuestos/queries";
import DetallePresupuestoModal from "@/components/presupuestos/DetallePresupuestoModal";
import { formatFechaAR } from "@/lib/timezone";

const ESTADO_STYLES: Record<string, string> = {
  BORRADOR: "bg-surface-hover text-text-dim",
  VENCIDO: "bg-[#ffdad6] text-[#93000a]",
  CONVERTIDO: "bg-warning/20 text-warning",
};

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  VENCIDO: "Vencido",
  CONVERTIDO: "Convertido",
};

export default function PresupuestosTable({ presupuestos }: { presupuestos: PresupuestoListado[] }) {
  const [idSeleccionado, setIdSeleccionado] = useState<number | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {presupuestos.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-dim">
            No hay presupuestos que coincidan con los filtros.
          </p>
        ) : (
          <>
            {/* Desktop / tablet: tabla */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-topbar">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {presupuestos.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs text-text-dim">#{p.id}</td>
                      <td className="px-4 py-3 font-medium text-text">{p.clienteNombre ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-text">
                        ${p.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-text-dim">
                        {formatFechaAR(p.fecha)}
                      </td>
                      <td className="px-4 py-3 text-text-dim">
                        {formatFechaAR(p.fechaVencimiento)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_STYLES[p.estado]}`}
                        >
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setIdSeleccionado(p.id)}
                            className="text-sm text-primary hover:underline"
                          >
                            Ver
                          </button>
                          {p.estado === "BORRADOR" && (
                            <Link
                              href={`/presupuestos/${p.id}/editar`}
                              className="text-sm text-primary hover:underline"
                            >
                              Editar
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: tarjetas */}
            <div className="divide-y divide-border md:hidden">
              {presupuestos.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-text-dim">#{p.id}</p>
                      <p className="truncate font-medium text-text">{p.clienteNombre ?? "—"}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_STYLES[p.estado]}`}
                    >
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono font-semibold text-text">${p.total.toFixed(2)}</p>
                    <p className="text-xs text-text-dim">
                      {formatFechaAR(p.fecha)} · Vence{" "}
                      {formatFechaAR(p.fechaVencimiento)}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setIdSeleccionado(p.id)}
                      className="text-sm font-medium text-primary"
                    >
                      Ver
                    </button>
                    {p.estado === "BORRADOR" && (
                      <Link href={`/presupuestos/${p.id}/editar`} className="text-sm font-medium text-primary">
                        Editar
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {idSeleccionado != null && (
        <DetallePresupuestoModal presupuestoId={idSeleccionado} onClose={() => setIdSeleccionado(null)} />
      )}
    </>
  );
}