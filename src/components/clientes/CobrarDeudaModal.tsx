"use client";

import { useMemo, useState, useTransition } from "react";
// src/components/clientes/CobrarDeudaModal.tsx — línea 4
import { cobrarDeuda } from "@/app/(dashboard)/clientes/actions";

export interface CuentaOption {
  id: number;
  nombre: string;
  tipo: string;
  saldoActual: number;
}

interface Fila {
  cuentaId: number;
  monto: string; // string para que el input sea controlable libremente
}

interface CobrarDeudaModalProps {
  cliente: { id: number; nombre: string };
  deudaTotal: number;
  cuentas: CuentaOption[];
  onClose: () => void;
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CobrarDeudaModal({
  cliente,
  deudaTotal,
  cuentas,
  onClose,
}: CobrarDeudaModalProps) {
  const [mixto, setMixto] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([
    { cuentaId: cuentas[0]?.id ?? 0, monto: "0" },
  ]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => filas.reduce((sum, f) => sum + (parseFloat(f.monto) || 0), 0),
    [filas]
  );

  function actualizarFila(index: number, cambio: Partial<Fila>) {
    setFilas((prev) => prev.map((f, i) => (i === index ? { ...f, ...cambio } : f)));
  }

  function agregarFila() {
    const usados = new Set(filas.map((f) => f.cuentaId));
    const siguiente = cuentas.find((c) => !usados.has(c.id)) ?? cuentas[0];
    setFilas((prev) => [...prev, { cuentaId: siguiente?.id ?? 0, monto: "0" }]);
  }

  function quitarFila(index: number) {
    setFilas((prev) => prev.filter((_, i) => i !== index));
  }

  function ponerTodo() {
    if (mixto) {
      // Completa lo que falta en la última fila para llegar a la deuda total
      const restoActual = filas
        .slice(0, -1)
        .reduce((sum, f) => sum + (parseFloat(f.monto) || 0), 0);
      const faltante = Math.max(0, deudaTotal - restoActual);
      setFilas((prev) =>
        prev.map((f, i) => (i === prev.length - 1 ? { ...f, monto: faltante.toFixed(2) } : f))
      );
    } else {
      setFilas([{ ...filas[0], monto: deudaTotal.toFixed(2) }]);
    }
  }

  function toggleMixto() {
    setMixto((m) => !m);
  }

  function handleSubmit() {
    setError(null);
    if (total <= 0) {
      setError("Ingresá un monto mayor a $0.");
      return;
    }
    if (total > deudaTotal + 0.01) {
      setError(`El total ($${fmt(total)}) no puede superar la deuda ($${fmt(deudaTotal)}).`);
      return;
    }

    const pagos = filas
      .filter((f) => (parseFloat(f.monto) || 0) > 0)
      .map((f) => ({ cuentaId: f.cuentaId, monto: parseFloat(f.monto) }));

    startTransition(async () => {
      const result = await cobrarDeuda(cliente.id, pagos);
      if (!result.success) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-4 sm:px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Cobrar deuda</h2>
            <p className="text-sm text-slate-500 truncate">{cliente.nombre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 pl-2">
            ✕
          </button>
        </div>

        <div className="space-y-5 px-4 sm:px-6 py-5">
          {/* Deuda total */}
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-500">Deuda total</span>
            <span className="text-xl font-bold text-red-600">${fmt(deudaTotal)}</span>
          </div>

          {/* Forma de pago */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Forma de pago
              </p>
              <button
                onClick={toggleMixto}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {mixto ? "Simple" : "Mixto"}
              </button>
            </div>

            {filas.map((fila, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg border border-slate-200 p-2 sm:border-0 sm:p-0"
              >
                <select
                  value={fila.cuentaId}
                  onChange={(e) => actualizarFila(i, { cuentaId: Number(e.target.value) })}
                  className="w-full sm:flex-1 appearance-none rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white"
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id} className="text-slate-900">
                      {c.nombre} — ${fmt(c.saldoActual)}
                    </option>
                  ))}
                </select>

                {mixto && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={fila.monto}
                      onChange={(e) => actualizarFila(i, { monto: e.target.value })}
                      className="flex-1 sm:w-32 rounded-lg border border-slate-300 px-3 py-3 text-sm"
                      placeholder="0"
                    />
                    {filas.length > 1 && (
                      <button
                        onClick={() => quitarFila(i)}
                        className="shrink-0 px-2 text-slate-400 hover:text-red-500"
                        aria-label="Quitar cuenta"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {mixto && (
              <button
                onClick={agregarFila}
                disabled={filas.length >= cuentas.length}
                className="text-sm text-primary hover:underline disabled:opacity-40"
              >
                + Agregar cuenta
              </button>
            )}
          </div>

          {/* Monto (modo simple) */}
          {!mixto && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={filas[0]?.monto ?? "0"}
                onChange={(e) => actualizarFila(0, { monto: e.target.value })}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-lg font-medium min-w-0"
                placeholder="0"
              />
              <button
                onClick={ponerTodo}
                className="shrink-0 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white"
              >
                Todo
              </button>
            </div>
          )}

          {mixto && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
              <span className="text-slate-500">
                Total cargado: <span className="font-medium text-slate-900">${fmt(total)}</span>{" "}
                / ${fmt(deudaTotal)}
              </span>
              <button onClick={ponerTodo} className="text-left font-medium text-primary hover:underline">
                Completar con la última cuenta
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Acciones */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={total <= 0 || isPending}
              className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:bg-primary/40"
            >
              {isPending ? "Cobrando..." : `Cobrar $${fmt(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}