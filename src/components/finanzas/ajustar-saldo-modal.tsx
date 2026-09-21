"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CuentaDTO } from "@/types/cuenta";
import { formatCurrency } from "@/lib/currency";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  cuenta: CuentaDTO | null;
  onSuccess: () => void;
};

export function AjustarSaldoModal({ isOpen, onClose, cuenta, onSuccess }: Props) {
  const [nuevoSaldo, setNuevoSaldo] = useState("");
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (isOpen && cuenta) {
      setNuevoSaldo(String(cuenta.saldoActual));
      setConcepto("");
    }
  }, [isOpen, cuenta]);

  if (!isOpen || !cuenta) return null;

  const moneda = cuenta.tipo.endsWith("USD") ? "USD" : "ARS";

  async function confirmar() {
    const valor = Number(nuevoSaldo.replace(",", "."));
    if (Number.isNaN(valor)) {
      toast.error("Ingresá un saldo válido");
      return;
    }
    if (valor === cuenta!.saldoActual) {
      toast.error("El nuevo saldo es igual al actual");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/cuentas/${cuenta!.id}/ajustar-saldo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nuevoSaldo: valor, concepto: concepto.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo ajustar el saldo");
        return;
      }
      toast.success("Saldo ajustado correctamente");
      onSuccess();
      onClose();
    } catch {
      toast.error("No se pudo ajustar el saldo");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text">Ajustar saldo</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-text-dim">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: cuenta.color ?? "#94a3b8" }}
          />
          {cuenta.nombre}
        </p>

        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Saldo actual</p>
          <p className="text-xl font-bold text-text">{formatCurrency(cuenta.saldoActual, moneda)}</p>
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Nuevo saldo</label>
          <input
            type="text"
            inputMode="decimal"
            value={nuevoSaldo}
            onChange={(e) => setNuevoSaldo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            autoFocus
          />
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Concepto</label>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Arqueo de caja, corrección..."
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={confirmar}
            disabled={guardando}
            className="flex-1 rounded-lg bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Confirmar ajuste"}
          </button>
          <button
            onClick={onClose}
            disabled={guardando}
            className="rounded-lg bg-surface-hover px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}