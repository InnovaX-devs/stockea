"use client";

import { useMemo, useState, useTransition } from "react";
// src/components/clientes/CobrarDeudaModal.tsx — línea 4
import { cobrarDeuda } from "@/app/(dashboard)/clientes/actions";
import { esCuentaUSD } from "@/lib/currency";
import { useCotizacionUSD } from "@/lib/hooks/use-cotizacion";

export interface CuentaOption {
  id: number;
  nombre: string;
  tipo: string;
  saldoActual: number | null; // null para el empleado (no ve saldos)
}

interface Fila {
  cuentaId: number;
  monto: string; // en la moneda de la cuenta (US$ si es USD). String para que el input sea controlable libremente
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
  const cotizacion = useCotizacionUSD();

  const esUSD = (cuentaId: number | undefined) => esCuentaUSD(cuentas.find((c) => c.id === cuentaId)?.tipo);

  // Equivalente en ARS de una fila: es lo que se descuenta de la deuda.
  function aARS(fila: Fila) {
    const valor = parseFloat(fila.monto) || 0;
    return esUSD(fila.cuentaId) ? Math.round(valor * cotizacion) : valor;
  }

  // Pasa un monto en ARS a la moneda de la cuenta, como texto para el input.
  function desdeARS(ars: number, cuentaId: number) {
    if (esUSD(cuentaId)) return cotizacion > 0 ? (ars / cotizacion).toFixed(2) : "0";
    return ars.toFixed(2);
  }

  const total = useMemo(
    () => filas.reduce((sum, f) => sum + aARS(f), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, cotizacion]
  );
  const hayUSD = filas.some((f) => esUSD(f.cuentaId));
  const esperandoCotizacion = hayUSD && cotizacion <= 0;

  function actualizarFila(index: number, cambio: Partial<Fila>) {
    setFilas((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        // Si cambia de una cuenta en pesos a una en dólares (o al revés),
        // convertimos el monto para que siga valiendo lo mismo.
        if (cambio.cuentaId != null && cambio.monto == null && esUSD(cambio.cuentaId) !== esUSD(f.cuentaId)) {
          const ars = aARS(f);
          return { ...f, ...cambio, monto: ars > 0 ? desdeARS(ars, cambio.cuentaId) : f.monto };
        }
        return { ...f, ...cambio };
      })
    );
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
      const restoActual = filas.slice(0, -1).reduce((sum, f) => sum + aARS(f), 0);
      const faltante = Math.max(0, deudaTotal - restoActual);
      setFilas((prev) =>
        prev.map((f, i) => (i === prev.length - 1 ? { ...f, monto: desdeARS(faltante, f.cuentaId) } : f))
      );
    } else {
      setFilas([{ ...filas[0], monto: desdeARS(deudaTotal, filas[0].cuentaId) }]);
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
    // Tolerancia de medio peso: al pasar dólares a pesos pueden quedar centavos.
    if (Math.round(total) > Math.round(deudaTotal)) {
      setError(`El total ($${fmt(total)}) no puede superar la deuda ($${fmt(deudaTotal)}).`);
      return;
    }

    const pagos = filas
      .filter((f) => (parseFloat(f.monto) || 0) > 0)
      .map((f) => ({
        cuentaId: f.cuentaId,
        monto: aARS(f),
        montoUSD: esUSD(f.cuentaId) ? parseFloat(f.monto) : null,
      }));

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
                      {c.nombre}
                      {c.saldoActual != null && ` — ${esCuentaUSD(c.tipo) ? "US$" : "$"}${fmt(c.saldoActual)}`}
                    </option>
                  ))}
                </select>

                {mixto && (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-slate-500">
                      {esUSD(fila.cuentaId) ? "US$" : "$"}
                    </span>
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
                {mixto && esUSD(fila.cuentaId) && (parseFloat(fila.monto) || 0) > 0 && (
                  <span className="text-xs text-slate-500 sm:w-full sm:text-right">≈ ${fmt(aARS(fila))}</span>
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
            <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-slate-500">
                {esUSD(filas[0]?.cuentaId) ? "US$" : "$"}
              </span>
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
            {esUSD(filas[0]?.cuentaId) && (
              <p className="text-right text-xs text-slate-500">
                {cotizacion > 0
                  ? `≈ $${fmt(total)} de deuda (cotización ${cotizacion.toLocaleString("es-AR")})`
                  : "Cargando cotización..."}
              </p>
            )}
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
              disabled={total <= 0 || isPending || esperandoCotizacion}
              className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:bg-primary/40"
            >
              {isPending
                ? "Cobrando..."
                : !mixto && esUSD(filas[0]?.cuentaId)
                  ? `Cobrar US$${fmt(parseFloat(filas[0]?.monto) || 0)}`
                  : `Cobrar $${fmt(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}