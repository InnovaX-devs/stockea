"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatFechaHoraAR } from "@/lib/timezone";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { recibirTransferencia } from "@/app/(dashboard)/transferencias/actions";
import type { TransferenciaDTO } from "@/types/transferencia";

/**
 * Lista de transferencias (bandeja "Por recibir" e historial). La sucursal
 * destino confirma la recepción desde acá: recién ahí el stock entra.
 */
export function ListaTransferencias({
  transferencias,
  sucursalActualId,
}: {
  transferencias: TransferenciaDTO[];
  sucursalActualId: number | null;
}) {
  const router = useRouter();
  const [aConfirmar, setAConfirmar] = useState<TransferenciaDTO | null>(null);
  const [pendiente, startTransition] = useTransition();

  function confirmar() {
    if (!aConfirmar) return;
    const t = aConfirmar;
    startTransition(async () => {
      const r = await recibirTransferencia(t.id);
      if (!r.success) {
        toast.error(r.error);
        // Si ya la recibió otra persona, la lista se actualiza igual.
        router.refresh();
      } else {
        toast.success(`Transferencia #${t.numero} recibida: el stock ya está en ${t.destino.nombre}.`);
        router.refresh();
      }
      setAConfirmar(null);
    });
  }

  return (
    <>
      <ConfirmDialog
        isOpen={aConfirmar != null}
        onClose={() => !pendiente && setAConfirmar(null)}
        onConfirm={confirmar}
        loading={pendiente}
        title={aConfirmar ? `¿Confirmar la recepción de la transferencia #${aConfirmar.numero}?` : ""}
        description={
          aConfirmar
            ? `Se suman ${aConfirmar.items.reduce((n, i) => n + i.cantidad, 0)} unidades (${aConfirmar.items.length} ${aConfirmar.items.length === 1 ? "producto" : "productos"}) al stock de ${aConfirmar.destino.nombre}. Revisá que la mercadería haya llegado completa.`
            : undefined
        }
        confirmLabel="Confirmar recepción"
      />

      <ul className="space-y-3">
        {transferencias.map((t) => {
          const unidades = t.items.reduce((n, i) => n + i.cantidad, 0);
          const recibida = t.estado === "RECIBIDA";
          return (
            <li key={t.id} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-text-dim">#{t.numero}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        recibida ? "bg-surface-hover text-primary" : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {recibida ? "Recibida" : "En camino"}
                    </span>
                  </div>
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-text">
                    <span>{t.origen.nombre}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-text-dim" aria-label="hacia" />
                    <span>{t.destino.nombre}</span>
                  </p>
                  <p className="text-xs text-text-dim">
                    Enviada el {formatFechaHoraAR(new Date(t.fechaEnvio))} por {t.usuarioEnvio}
                    {recibida && t.fechaRecepcion && (
                      <>
                        {" · "}Recibida el {formatFechaHoraAR(new Date(t.fechaRecepcion))}
                        {t.usuarioRecepcion ? ` por ${t.usuarioRecepcion}` : ""}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <p className="text-sm text-text-dim">
                    <span className="font-mono font-semibold text-text">{unidades}</span> {unidades === 1 ? "unidad" : "unidades"}
                  </p>
                  {t.puedeRecibir && (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => setAConfirmar(t)}
                      className="bg-grad flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendiente && aConfirmar?.id === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Confirmar recepción
                    </button>
                  )}
                  {t.estado === "ENVIADA" && !t.puedeRecibir && (
                    <p className="max-w-[16rem] text-right text-xs text-text-dim">
                      {sucursalActualId == null
                        ? `La confirma ${t.destino.nombre}. Elegí esa sucursal en la barra superior para recibirla.`
                        : `Pendiente de recepción en ${t.destino.nombre}.`}
                    </p>
                  )}
                </div>
              </div>

              {t.observaciones && <p className="mt-2 rounded-lg bg-surface-hover px-3 py-2 text-sm text-text">{t.observaciones}</p>}

              <details className="group mt-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-primary">
                  Ver {t.items.length} {t.items.length === 1 ? "producto" : "productos"}
                </summary>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {t.items.map((i) => (
                      <tr key={i.id} className="border-t border-border">
                        <td className="py-2 pr-3 text-text">
                          {i.nombre}
                          {i.marca && <span className="ml-1.5 text-xs text-text-dim">{i.marca}</span>}
                        </td>
                        <td className="py-2 text-right font-mono font-medium text-text">× {i.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}