"use client";

import { useEffect, useState } from "react";
import { X, Download, Loader2, ChevronRight } from "lucide-react";
import { ModalDetallePedido } from "@/components/ventas/modal-detalle-pedido";
import { obtenerHistorialDeuda } from "@/app/(dashboard)/clientes/actions";
import { formatFechaHoraAR } from "@/lib/timezone";
import { etiquetaVenta, archivoComprobanteVenta } from "@/lib/numeracion";

type EventoHistorial = {
  id: string;
  tipo: "venta" | "pago";
  monto: number;
  fecha: string;
  label: string;
  sublabel: string;
  ventaId: number;
  ventaNumero: number | null;
  saldoAntes: number;
  saldoDespues: number;
  esAjuste: boolean;
  factura: { letra: string; numero: string } | null;
};

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
}


export default function HistorialDeudaModal({
  cliente,
  onClose,
}: {
  cliente: { id: number; nombre: string };
  onClose: () => void;
}) {
  const [eventos, setEventos] = useState<EventoHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detalle de una venta (se abre al tocarla) y descarga del comprobante.
  const [ventaAbierta, setVentaAbierta] = useState<number | null>(null);
  const [descargando, setDescargando] = useState<number | null>(null);
  async function descargar(ventaId: number, numero: number | null) {
    setDescargando(ventaId);
    try {
      const res = await fetch(`/api/ventas/${ventaId}/comprobante`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = archivoComprobanteVenta(numero, ventaId);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("No se pudo descargar el comprobante.");
    } finally {
      setDescargando(null);
    }
  }

  function cargar() {
    obtenerHistorialDeuda(cliente.id)
      .then(setEventos)
      .catch(() => setError("No se pudo cargar el historial."));
  }
  useEffect(cargar, [cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text">Historial de deuda</h2>
            <p className="text-sm text-text-dim">{cliente.nombre}</p>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          {!error && eventos === null && (
            <p className="text-sm text-text-dim text-center py-6">Cargando...</p>
          )}

          {eventos !== null && eventos.length === 0 && (
            <p className="text-sm text-text-dim text-center py-6">
              Este cliente no tiene movimientos de deuda.
            </p>
          )}

          {eventos?.map((e) => {
            const esVenta = e.tipo === "venta" && !e.esAjuste;
            return (
            <div
              key={e.id}
              onClick={esVenta ? () => setVentaAbierta(e.ventaId) : undefined}
              role={esVenta ? "button" : undefined}
              tabIndex={esVenta ? 0 : undefined}
              onKeyDown={esVenta ? (ev) => ev.key === "Enter" && setVentaAbierta(e.ventaId) : undefined}
              title={esVenta ? "Ver la venta" : undefined}
              className={`rounded-xl px-4 py-3 ${
                e.tipo === "pago" ? "bg-[#e8f7ef]" : "bg-danger/10"
              } ${esVenta ? "cursor-pointer transition hover:ring-1 hover:ring-danger/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                      e.tipo === "pago" ? "bg-[#0f9d58]" : "bg-danger"
                    }`}
                  />
                  <div>
                    <p className="font-semibold text-sm text-text">{e.label}</p>
                    <p className="text-xs text-text-dim">{e.sublabel}</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold shrink-0 ${
                    e.tipo === "pago" ? "text-[#0f9d58]" : "text-danger"
                  }`}
                >
                  {e.tipo === "pago" ? "−" : "+"}
                  {formatARS(Math.abs(e.monto))}
                </span>
              </div>
              <p className="text-xs text-text-dim mt-2">
                {formatFechaHoraAR(new Date(e.fecha))} · Saldo:{" "}
                  {formatARS(e.saldoAntes)} → {formatARS(e.saldoDespues)}
                {e.tipo === "venta" ? ` · Venta ${etiquetaVenta(e.ventaNumero)}` : ""}
              </p>
              {esVenta && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  {e.factura ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-success">
                      Factura {e.factura.letra} {e.factura.numero}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-text-dim">Sin factura</span>
                  )}
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        descargar(e.ventaId, e.ventaNumero);
                      }}
                      disabled={descargando === e.ventaId}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/70 text-text-dim hover:text-text disabled:opacity-50"
                      aria-label={`Descargar comprobante de la venta ${etiquetaVenta(e.ventaNumero)}`}
                      title={e.factura ? "Descargar factura" : "Descargar comprobante"}
                    >
                      {descargando === e.ventaId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </button>
                    <ChevronRight className="h-4 w-4 text-text-dim" />
                  </span>
                </div>
              )}
            </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full rounded-full border border-border py-2.5 text-sm font-medium hover:bg-surface-hover"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Detalle de la venta tocada (encima del historial). Si se cobra,
          factura o cancela desde ahí, el historial se actualiza. */}
      {ventaAbierta != null && (
        <ModalDetallePedido
          pedidoId={ventaAbierta}
          titulo="Venta"
          onClose={() => setVentaAbierta(null)}
          onCambio={cargar}
        />
      )}
    </div>
  );
}