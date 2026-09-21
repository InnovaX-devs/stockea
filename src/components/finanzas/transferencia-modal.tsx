"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CuentaDTO } from "@/types/cuenta";
import { formatCurrency } from "@/lib/currency";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  cuentas: CuentaDTO[];
  onSuccess: () => void;
};

export function TransferenciaModal({ isOpen, onClose, cuentas, onSuccess }: Props) {
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cuentasActivas = cuentas.filter((c) => c.activa);
  const origen = cuentasActivas.find((c) => c.id === Number(origenId)) ?? null;
  const destino = cuentasActivas.find((c) => c.id === Number(destinoId)) ?? null;

  useEffect(() => {
    if (isOpen) {
      setOrigenId("");
      setDestinoId("");
      setMonto("");
      setConcepto("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const monedaOrigen = origen ? (origen.tipo.endsWith("USD") ? "USD" : "ARS") : null;
  const monedaDestino = destino ? (destino.tipo.endsWith("USD") ? "USD" : "ARS") : null;
  const monedasIncompatibles = Boolean(monedaOrigen && monedaDestino && monedaOrigen !== monedaDestino);

  async function confirmar() {
    if (!origen || !destino) {
      toast.error("Elegí cuenta de origen y destino");
      return;
    }
    if (monedasIncompatibles) {
      toast.error("Solo se puede transferir entre cuentas de la misma moneda");
      return;
    }
    const valor = Number(monto.replace(",", "."));
    if (!valor || valor <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/cuentas/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuentaOrigenId: origen.id,
          cuentaDestinoId: destino.id,
          monto: valor,
          concepto: concepto.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo realizar la transferencia");
        return;
      }
      toast.success("Transferencia realizada correctamente");
      onSuccess();
      onClose();
    } catch {
      toast.error("No se pudo realizar la transferencia");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text">Transferir entre cuentas</h2>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Cuenta origen</label>
          <select
            value={origenId}
            onChange={(e) => setOrigenId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Seleccionar...</option>
            {cuentasActivas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} — {formatCurrency(c.saldoActual, c.tipo.endsWith("USD") ? "USD" : "ARS")}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Cuenta destino</label>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Seleccionar...</option>
            {cuentasActivas
              .filter((c) => String(c.id) !== origenId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {formatCurrency(c.saldoActual, c.tipo.endsWith("USD") ? "USD" : "ARS")}
                </option>
              ))}
          </select>
          {monedasIncompatibles && (
            <p className="mt-1 text-xs text-danger">Las cuentas deben ser de la misma moneda.</p>
          )}
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
            Monto {monedaOrigen ? `(${monedaOrigen})` : ""}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Concepto</label>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Refuerzo de caja..."
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={confirmar}
            disabled={guardando}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? "Transfiriendo..." : "Confirmar transferencia"}
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