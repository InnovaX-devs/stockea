"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/currency";
import type { CuentaDTO } from "@/types/cuenta";
import { CuentaFormModal } from "@/components/finanzas/cuenta-form-modal";
import { TotalesCuentas } from "@/components/finanzas/totales-cuentas";

export function CuentasTab() {
  const [cuentas, setCuentas] = useState<CuentaDTO[]>([]);
  const [cotizacionUSD, setCotizacionUSD] = useState(0);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [cuentaEditar, setCuentaEditar] = useState<CuentaDTO | null>(null);
  const [incluirInactivas, setIncluirInactivas] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      const [resCuentas, resConfig] = await Promise.all([
        fetch(`/api/cuentas?incluirInactivas=${incluirInactivas}`),
        fetch("/api/configuracion"),
      ]);
      if (resCuentas.ok) {
        const data = await resCuentas.json();
        setCuentas(data.items);
      }
      if (resConfig.ok) {
        const data = await resConfig.json();
        setCotizacionUSD(data.cotizacionUSD ?? 0);
        setUsaCotizacionUSD(data.usaCotizacionUSD ?? false);
      }
    } catch (error) {
      console.error("Error al cargar cuentas:", error);
    } finally {
      setCargando(false);
    }
  }, [incluirInactivas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggleActiva = async (cuenta: CuentaDTO) => {
    try {
      const res = await fetch(`/api/cuentas/${cuenta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !cuenta.activa }),
      });
      if (!res.ok) throw new Error("Error al cambiar el estado de la cuenta");
      cargar();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const eliminar = async (cuenta: CuentaDTO) => {
    if (!confirm(`¿Eliminar la cuenta "${cuenta.nombre}"?`)) return;
    try {
      const res = await fetch(`/api/cuentas/${cuenta.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar la cuenta");
      }
      cargar();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-text">Cuentas</h2>
          <p className="text-sm text-text-dim">Efectivo y cuentas bancarias</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCuentaEditar(null);
            setIsFormOpen(true);
          }}
          className="rounded-lg bg-primary cursor-pointer px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          + Nueva Cuenta
        </button>
      </div>

      <TotalesCuentas cuentas={cuentas} cotizacionUSD={cotizacionUSD} usaCotizacionUSD={usaCotizacionUSD} />

      <div className="rounded-xl border border-border bg-surface p-4">
        <label className="mb-4 flex items-center gap-2 text-sm text-text-dim">
          <input
            type="checkbox"
            checked={incluirInactivas}
            onChange={(e) => setIncluirInactivas(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Mostrar cuentas inactivas
        </label>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="pb-3 pr-4 font-medium">Cuenta</th>
                <th className="pb-3 pr-4 font-medium">Tipo</th>
                <th className="pb-3 pr-4 font-medium">Saldo</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-text-dim">
                    Cargando cuentas...
                  </td>
                </tr>
              ) : cuentas.length > 0 ? (
                cuentas.map((c) => (
                  <tr key={c.id} className={cn("border-b border-border last:border-0", !c.activa && "opacity-50")}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#999" }} />
                        <span className="font-medium text-text">{c.nombre}</span>
                        {c.favorita && <span className="text-xs text-text-dim">★</span>}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-text-dim">{c.tipo.replace("_", " ")}</td>
                    <td className="py-3 pr-4 text-text-dim">
                      {formatCurrency(c.saldoActual, c.tipo.includes("USD") ? "USD" : "ARS")}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setCuentaEditar(c);
                            setIsFormOpen(true);
                          }}
                          className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-dim hover:bg-surface-hover"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActiva(c)}
                          className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-dim hover:bg-surface-hover"
                        >
                          {c.activa ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          onClick={() => eliminar(c)}
                          className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-dim hover:bg-surface-hover"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-text-dim">
                    No hay cuentas cargadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CuentaFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        cuentaEditar={cuentaEditar}
        onSuccess={cargar}
        usaCotizacionUSD={usaCotizacionUSD}
      />
    </div>
  );
}