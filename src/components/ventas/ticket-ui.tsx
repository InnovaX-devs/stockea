"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Printer, Loader2, Settings2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { datosTicketVenta } from "@/app/(dashboard)/ventas/ticket-actions";
import {
  imprimirTicket,
  leerConfigTicket,
  guardarConfigTicket,
  leerNegocioTicket,
  ticketDePrueba,
  CONFIG_TICKET_POR_DEFECTO,
  type ConfigTicket,
  type DatosTicket,
} from "@/lib/ticket";

/** Ticket para la comandera (issue #86): botones y configuración. */

/** Reimprime el ticket de una venta guardada (historial y detalle). */
export function BotonTicketVenta({
  ventaId,
  variante = "icono",
  className,
}: {
  ventaId: number;
  variante?: "icono" | "boton";
  className?: string;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  async function imprimir() {
    setImprimiendo(true);
    try {
      const r = await datosTicketVenta(ventaId);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      await imprimirTicket(r.data);
    } catch {
      toast.error("No se pudo armar el ticket. Revisá la conexión.");
    } finally {
      setImprimiendo(false);
    }
  }
  const icono = imprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />;
  if (variante === "icono") {
    return (
      <button
        type="button"
        onClick={imprimir}
        disabled={imprimiendo}
        title="Imprimir ticket"
        aria-label="Imprimir ticket"
        className={cn(
          "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-text-dim hover:bg-surface-hover disabled:opacity-50",
          className
        )}
      >
        {icono}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={imprimir}
      disabled={imprimiendo}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:opacity-50",
        className
      )}
    >
      {icono}
      Ticket
    </button>
  );
}

/** Botones de la pantalla de venta: reimprimir el último ticket y configurar la impresora. */
export function BarraTicket({ ultimoTicket }: { ultimoTicket: DatosTicket | null }) {
  const [configAbierta, setConfigAbierta] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ultimoTicket && imprimirTicket(ultimoTicket)}
        disabled={!ultimoTicket}
        title={ultimoTicket ? "Volver a imprimir el ticket de la última venta" : "Todavía no hay ventas en esta sesión"}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Printer size={14} />
        <span className="hidden sm:inline">Último ticket</span>
      </button>
      <button
        type="button"
        onClick={() => setConfigAbierta(true)}
        title="Configurar la impresora de tickets de esta computadora"
        aria-label="Configurar impresora de tickets"
        className="flex items-center justify-center rounded-lg border border-border bg-white px-2.5 py-2 text-text-dim hover:bg-surface-hover"
      >
        <Settings2 size={16} />
      </button>
      {configAbierta && <ModalConfigTicket onClose={() => setConfigAbierta(false)} />}
    </div>
  );
}

export function ModalConfigTicket({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<ConfigTicket>(() => leerConfigTicket());

  function guardarYCerrar() {
    guardarConfigTicket(config);
    toast.success("Configuración del ticket guardada en esta computadora");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-5 pb-4 pt-5">
          <div>
            <h2 className="text-lg font-bold text-text">Ticket de venta</h2>
            <p className="text-sm text-text-dim">Impresora térmica de esta computadora</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <span className="text-sm font-medium text-text">Ancho del papel</span>
            <div role="radiogroup" aria-label="Ancho del papel" className="mt-1.5 grid grid-cols-2 gap-2">
              {([80, 58] as const).map((ancho) => (
                <button
                  key={ancho}
                  type="button"
                  role="radio"
                  aria-checked={config.ancho === ancho}
                  onClick={() => setConfig({ ...config, ancho })}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition",
                    config.ancho === ancho ? "border-primary bg-primary/5 text-text" : "border-border text-text-dim hover:bg-surface-hover"
                  )}
                >
                  <span className="block font-semibold">{ancho} mm</span>
                  <span className="text-xs">{ancho === 80 ? "Comandera común" : "Impresora chica / portátil"}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5">
            <input
              type="checkbox"
              checked={config.imprimirAlConfirmar}
              onChange={(e) => setConfig({ ...config, imprimirAlConfirmar: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block text-sm font-medium text-text">Imprimir al confirmar la venta</span>
              <span className="text-xs text-text-dim">
                Si no, aparece el botón &quot;Ticket&quot; en el aviso de la venta y en &quot;Último ticket&quot;.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="pie-ticket" className="text-sm font-medium text-text">
              Texto al pie
            </label>
            <textarea
              id="pie-ticket"
              rows={2}
              maxLength={300}
              value={config.pie}
              placeholder={CONFIG_TICKET_POR_DEFECTO.pie}
              onChange={(e) => setConfig({ ...config, pie: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1 rounded-lg bg-surface-hover px-3 py-2 text-xs text-text-dim">
            <p>
              <span className="font-medium text-text">Imprimir directo, sin el cuadro de impresión:</span> se configura una sola
              vez en la computadora de la caja (la térmica como impresora predeterminada y Chrome abierto en modo
              &quot;kiosco&quot;). Lo dejamos hecho al instalar la impresora.
            </p>
            <p>
              Mientras tanto, la primera vez elegí la térmica, en <span className="font-medium">Más ajustes</span> poné márgenes
              &quot;Ninguno&quot; y destildá &quot;Encabezados y pies de página&quot;. Chrome lo recuerda.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => imprimirTicket(ticketDePrueba(leerNegocioTicket()), config)}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            <Printer size={14} /> Imprimir prueba
          </button>
          <button
            type="button"
            onClick={guardarYCerrar}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
