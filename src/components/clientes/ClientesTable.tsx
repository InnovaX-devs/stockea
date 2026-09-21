"use client";

import { useState } from "react";
import { Clock, SlidersHorizontal, Pencil, Trash2 } from "lucide-react";
import { eliminarCliente } from "@/app/(dashboard)/clientes/actions";
import DeudaCell from "./DeudaCell";
import HistorialDeudaModal from "./HistorialDeudaModal";
import AjustarDeudaModal from "./AjustarDeudaModal";
import type { ClienteConDeuda } from "@/lib/clientes";
import type { CuentaOption } from "./CobrarDeudaModal";

export default function ClientesTable({
  clientes,
  cuentas,
  umbralAlDia,
  onEditar,
}: {
  clientes: ClienteConDeuda[];
  cuentas: CuentaOption[];
  umbralAlDia: number;
  onEditar: (cliente: ClienteConDeuda) => void;
}) {
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [clienteHistorial, setClienteHistorial] = useState<ClienteConDeuda | null>(null);
  const [clienteAjuste, setClienteAjuste] = useState<ClienteConDeuda | null>(null);

  async function handleEliminar(id: number, nombre: string) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(id);
    const res = await eliminarCliente(id);
    setEliminandoId(null);
    if (!res.success) alert(res.error);
  }

  function nombreCompleto(c: ClienteConDeuda) {
    return `${c.nombre} ${c.apellido ?? ""}`.trim();
  }

  function AccionesRow({ c }: { c: ClienteConDeuda }) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setClienteHistorial(c)}
          title="Historial de deuda"
          className="text-[#7c3aed] cursor-pointer hover:opacity-70"
        >
          <Clock size={18} />
        </button>
        <button
          onClick={() => setClienteAjuste(c)}
          title="Ajuste manual de deuda"
          className="text-text-dim cursor-pointer hover:text-primary"
        >
          <SlidersHorizontal size={18} />
        </button>
        <button
          onClick={() => onEditar(c)}
          title="Editar"
          className="text-text-dim cursor-pointer hover:text-primary"
        >
          <Pencil size={18} />
        </button>
        <button
          onClick={() => handleEliminar(c.id, nombreCompleto(c))}
          disabled={eliminandoId === c.id}
          title="Eliminar"
          className="text-text-dim hover:text-danger cursor-pointer disabled:opacity-50"
        >
          <Trash2 size={18} />
        </button>
      </div>
    );
  }

  if (clientes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border px-4 py-8 text-center text-text-dim text-sm">
        No se encontraron clientes con estos filtros.
      </div>
    );
  }

  return (
    <>
      {/* Desktop: tabla */}
      <div className="hidden md:block bg-white rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-topbar">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Deuda</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-4 font-medium text-text">{nombreCompleto(c)}</td>
                <td className="px-4 py-4 text-text-dim">{c.telefono ?? c.email ?? "—"}</td>
                <td className="px-4 py-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      c.esMayorista
                        ? "bg-warning/20 text-warning"
                        : "bg-surface-hover text-text-dim"
                    }`}
                  >
                    {c.esMayorista ? "Mayorista" : "Minorista"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <DeudaCell
                    cliente={{ id: c.id, nombre: nombreCompleto(c) }}
                    deuda={c.deuda}
                    umbralAlDia={umbralAlDia}
                    cuentas={cuentas}
                  />
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end">
                    <AccionesRow c={c} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: tarjetas */}
      <div className="md:hidden space-y-3">
        {clientes.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-2xl border border-border p-4 shadow-[0_4px_20px_rgba(26,43,86,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-text truncate">{nombreCompleto(c)}</p>
                <p className="text-sm text-text-dim truncate">{c.telefono ?? c.email ?? "—"}</p>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  c.esMayorista
                    ? "bg-warning/20 text-warning"
                    : "bg-surface-hover text-text-dim"
                }`}
              >
                {c.esMayorista ? "Mayorista" : "Minorista"}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <DeudaCell
                cliente={{ id: c.id, nombre: nombreCompleto(c) }}
                deuda={c.deuda}
                umbralAlDia={umbralAlDia}
                cuentas={cuentas}
              />
              <AccionesRow c={c} />
            </div>
          </div>
        ))}
      </div>

      {clienteHistorial && (
        <HistorialDeudaModal
          cliente={{ id: clienteHistorial.id, nombre: nombreCompleto(clienteHistorial) }}
          onClose={() => setClienteHistorial(null)}
        />
      )}

      {clienteAjuste && (
        <AjustarDeudaModal
          cliente={{ id: clienteAjuste.id, nombre: nombreCompleto(clienteAjuste) }}
          cuentas={cuentas}
          onClose={() => setClienteAjuste(null)}
        />
      )}
    </>
  );
}