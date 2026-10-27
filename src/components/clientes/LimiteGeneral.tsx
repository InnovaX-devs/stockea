"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, X } from "lucide-react";
import { guardarLimiteGeneral } from "@/app/(dashboard)/clientes/actions";
import { useEsAdmin } from "@/components/layout/rol-context";
import { formatearPesosLimite } from "@/lib/limite-cuenta-corriente";

/**
 * Límite de cuenta corriente para todos los clientes: se muestra arriba del
 * listado y el administrador lo cambia desde acá. Los clientes con límite
 * propio usan el suyo (se cambia al editar el cliente).
 */
export default function LimiteGeneral({ limite }: { limite: number | null }) {
  const esAdmin = useEsAdmin();
  const [editando, setEditando] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm text-text">
              Límite de cuenta corriente:{" "}
              <span className="font-semibold">
                {limite == null ? "sin límite" : `${formatearPesosLimite(limite)} para todos los clientes`}
              </span>
            </p>
            <p className="text-xs text-text-dim">
              {limite == null
                ? "Se les puede dejar a cuenta sin tope, salvo a los que tengan un límite propio."
                : "Los clientes con límite propio usan el suyo."}
            </p>
          </div>
        </div>
        {esAdmin && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-surface-hover sm:self-auto"
          >
            Cambiar
          </button>
        )}
      </div>

      {editando && <ModalLimiteGeneral limite={limite} onClose={() => setEditando(false)} />}
    </>
  );
}

function ModalLimiteGeneral({ limite, onClose }: { limite: number | null; onClose: () => void }) {
  const router = useRouter();
  const [sinLimite, setSinLimite] = useState(limite == null);
  const [monto, setMonto] = useState(limite == null ? "" : String(limite));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError(null);
    let valor: number | null = null;
    if (!sinLimite) {
      valor = Number(monto);
      if (monto.trim() === "" || !Number.isFinite(valor) || valor < 0) {
        setError("Ingresá un monto de cero o más, o elegí “Sin límite”.");
        return;
      }
    }
    setGuardando(true);
    const res = await guardarLimiteGeneral(valor).catch((e: unknown) => ({
      success: false as const,
      error: e instanceof Error ? e.message : "No se pudo guardar.",
    }));
    setGuardando(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-limite" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="titulo-limite" className="text-lg font-semibold text-text">Límite de cuenta corriente</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-text-dim">
          Lo máximo que puede deber cada cliente. Si una venta lo supera, el empleado no puede registrarla y el
          administrador puede autorizarla.
        </p>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
            <input type="radio" name="limiteGeneral" checked={sinLimite} onChange={() => setSinLimite(true)} />
            Sin límite
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
            <input type="radio" name="limiteGeneral" checked={!sinLimite} onChange={() => setSinLimite(false)} />
            Hasta
          </label>
          {!sinLimite && (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              autoFocus
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              placeholder="Ej. 100000"
              aria-label="Límite en pesos"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <p className="text-xs text-text-dim">Con $0 no se le puede dejar nada a cuenta a ningún cliente.</p>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface-hover">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
