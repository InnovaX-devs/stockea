"use client";

import { useEffect, useMemo, useState } from "react";
import { esCuentaUSD } from "@/lib/currency";

type Cuenta = { id: number; nombre: string; tipo: string; activa: boolean; saldoActual?: number | null };
type Fila = { cuentaId: number; monto: string };

const fmt = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function PagarProveedorModal({
  proveedor,
  compra,
  onClose,
  onSuccess,
}: {
  proveedor: { id: string; nombre: string; deuda: number } | null;
  /** Si viene, se paga solo el saldo de esa compra (deuda = lo que le falta). */
  compra?: { id: number; numero: number } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [filas, setFilas] = useState<Fila[]>([{ cuentaId: 0, monto: "" }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!proveedor) return;
    setError("");
    fetch("/api/cuentas")
      .then((r) => r.json())
      .then((d) => {
        const activas: Cuenta[] = (d.items ?? []).filter((c: Cuenta) => c.activa);
        setCuentas(activas);
        setFilas([{ cuentaId: activas[0]?.id ?? 0, monto: "" }]);
      })
      .catch(() => setError("No se pudieron cargar las cuentas."));
  }, [proveedor]);

  const total = useMemo(() => filas.reduce((a, f) => a + (Number(f.monto) || 0), 0), [filas]);
  if (!proveedor) return null;

  const deuda = proveedor.deuda;
  const excede = total > deuda + 0.01;
  const puedeGuardar = total > 0 && !excede && filas.every((f) => f.cuentaId > 0) && !guardando;

  const actualizar = (i: number, cambios: Partial<Fila>) =>
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));

  async function pagar() {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/proveedores/${proveedor!.id}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(compra ? { compraId: compra.id } : {}),
          pagos: filas.filter((f) => Number(f.monto) > 0).map((f) => ({ cuentaId: f.cuentaId, monto: Number(f.monto) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo registrar el pago.");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <h2 className="min-w-0 truncate text-lg font-semibold text-text">
            {compra ? `Pagar compra #${compra.numero}` : `Pagar a ${proveedor.nombre}`}
          </h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text cursor-pointer">✕</button>
        </div>

        <p className="mt-4 text-sm text-text-dim">
          {compra ? `${proveedor.nombre} · Saldo de la compra: ` : "Deuda actual: "}
          <span className="font-semibold text-text">{fmt(deuda)}</span>
        </p>
        <p className="mt-1 text-xs text-text-dim">
          {compra
            ? "El pago se aplica solo a esta compra."
            : "El pago se aplica primero a la deuda inicial y después a las compras más viejas."}
        </p>

        {error && <div className="mt-4 rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</div>}

        <div className="mt-4 space-y-3">
          {filas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={f.cuentaId}
                onChange={(e) => actualizar(i, { cuentaId: Number(e.target.value) })}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.saldoActual != null && ` — ${esCuentaUSD(c.tipo) ? "US$" : "$"}${c.saldoActual.toLocaleString("es-AR")}`}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto $"
                value={f.monto}
                onChange={(e) => actualizar(i, { monto: e.target.value })}
                className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
              />
              {filas.length > 1 && (
                <button onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className="text-text-dim hover:text-danger cursor-pointer" title="Quitar">✕</button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            onClick={() => setFilas((fs) => [...fs, { cuentaId: cuentas.find((c) => !fs.some((f) => f.cuentaId === c.id))?.id ?? cuentas[0]?.id ?? 0, monto: "" }])}
            disabled={filas.length >= cuentas.length}
            className="text-primary hover:underline disabled:opacity-40 cursor-pointer"
          >
            + Pagar con otra cuenta
          </button>
          <button onClick={() => actualizar(0, { monto: String(deuda) })} className="text-primary hover:underline cursor-pointer">
            Pagar todo
          </button>
        </div>
        <p className="mt-1 text-xs text-text-dim">Los montos van en pesos. Si la cuenta es en dólares, se descuenta el equivalente.</p>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-text-dim">Total a pagar</span>
          <span className={`font-semibold ${excede ? "text-danger" : "text-text"}`}>{fmt(total)}</span>
        </div>
        {excede && <p className="mt-1 text-xs text-danger">El pago supera la deuda.</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm text-text-dim hover:text-text cursor-pointer">Cancelar</button>
          <button
            onClick={pagar}
            disabled={!puedeGuardar}
            className="bg-grad rounded-full px-4 py-2 text-sm font-semibold text-[#050507] disabled:opacity-50 cursor-pointer"
          >
            {guardando ? "Pagando…" : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
