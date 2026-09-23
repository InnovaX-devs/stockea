"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Download, Loader2, Package, Truck, CheckCircle2, User, Wallet, DollarSign, XCircle } from "lucide-react";
import { obtenerDetallePedido, cancelarPedido } from "@/app/(dashboard)/ventas/actions";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/cn";
import type { EstadoPago } from "@prisma/client";
import type { PedidoDetalle } from "@/types/venta";
import { ModalCobrarPedido } from "./modal-cobrar-pedido";

const ESTADO_STYLE: Record<EstadoPago, string> = {
  PAGADA: "bg-success/10 text-success",
  A_CUENTA: "bg-warning/10 text-warning",
  ANULADA: "bg-surface-hover text-text-dim",
  CANCELADA: "bg-danger/10 text-danger",
};

const ESTADO_LABEL: Record<EstadoPago, string> = {
  PAGADA: "Pagada",
  A_CUENTA: "A cuenta",
  ANULADA: "Anulada",
  CANCELADA: "Cancelada",
};

const TIPO_CUENTA_LABEL: Record<string, string> = {
  EFECTIVO_ARS: "Efectivo",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Banco",
  BANCO_USD: "Banco USD",
};

const formatoFechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

interface Props {
  pedidoId: number;
  onClose: () => void;
  onCambio?: () => void;
}

export function ModalDetallePedido({ pedidoId, onClose, onCambio }: Props) {
  const [pedido, setPedido] = useState<PedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsaCotizacionUSD(data?.usaCotizacionUSD ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true);
      const resultado = await obtenerDetallePedido(pedidoId);
      if (!activo) return;
      if (resultado.success) {
        setPedido(resultado.pedido);
      } else {
        setError(resultado.error);
      }
      setCargando(false);
    }
    cargar();
    return () => {
      activo = false;
    };
  }, [pedidoId]);

  async function recargar() {
    const resultado = await obtenerDetallePedido(pedidoId);
    if (resultado.success) setPedido(resultado.pedido);
  }

  async function descargarComprobante() {
    setDescargando(true);
    try {
      const res = await fetch(`/api/ventas/${pedidoId}/comprobante`);
      if (!res.ok) throw new Error("No se pudo generar el comprobante.");

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `comprobante-venta-${String(pedidoId).padStart(6, "0")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      console.error(err);
    } finally {
      setDescargando(false);
    }
  }

  async function handleCancelar() {
    setCancelando(true);
    const resultado = await cancelarPedido(pedidoId);
    setCancelando(false);
    if (!resultado.success) {
      toast.error(resultado.error);
      setConfirmandoCancelar(false);
      return;
    }
    toast.success(`Pedido #${pedidoId} cancelado`);
    onCambio?.();
    onClose();
  }

  const metodoPago = pedido?.pagos.length
    ? pedido.pagos
        .map((p) => TIPO_CUENTA_LABEL[p.tipoCuenta] ?? p.tipoCuenta)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(" + ")
    : "Sin registrar";

  const saldoPendiente = pedido ? Math.max(0, Math.round(pedido.totalARS - pedido.montoPagado)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text">Pedido #{pedidoId}</h2>
              {pedido && (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", ESTADO_STYLE[pedido.estadoPago])}>
                  {ESTADO_LABEL[pedido.estadoPago]}
                </span>
              )}
            </div>
            {pedido && (
              <>
                <p className="mt-1 text-sm text-text-dim">
                  Registrado: {formatoFechaHora.format(new Date(pedido.fecha))}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-text">
                  <User size={14} className="text-text-dim" />
                  {pedido.clienteNombre ?? "Sin cliente"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pedido.armado && (
                    <span className="flex items-center gap-1 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-primary">
                      <Package size={11} /> Armado
                    </span>
                  )}
                  {pedido.enviado && (
                    <span className="flex items-center gap-1 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-primary">
                      <Truck size={11} /> Enviado
                    </span>
                  )}
                  {pedido.retirado && (
                    <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                      <CheckCircle2 size={11} /> Retirado
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-dim hover:bg-surface-hover"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {cargando ? (
            <p className="py-10 text-center text-sm text-text-dim">Cargando...</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-danger">{error}</p>
          ) : pedido ? (
            <>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-dim">Productos</h3>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-topbar">
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-right">P. Unit.</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.items.map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-text">{item.productoNombre}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right text-text">{item.cantidad}</td>
                        <td className="px-3 py-2.5 text-right">
                          {usaCotizacionUSD && (
                            <p className="text-xs text-text-dim">US${item.precioUnitarioUSD.toFixed(2)}</p>
                          )}
                          <p className="text-text">{formatCurrency(item.precioUnitarioARS, "ARS")}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-text">
                          {formatCurrency(item.subtotalARS, "ARS")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resumen + Pago */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-text-dim">Resumen</p>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-text-dim">Total</span>
                    <span className="text-xl font-bold text-text">
                      {formatCurrency(pedido.totalARS, "ARS")}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-text-dim">Ganancia</span>
                    <span className="font-medium text-success">
                      {formatCurrency(pedido.gananciaARS, "ARS")} · {pedido.gananciaPorcentaje.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-text-dim">Pago</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-text-dim">
                      <Wallet size={13} /> Método
                    </span>
                    <span className="font-medium text-text">{metodoPago}</span>
                  </div>
                  {pedido.estadoPago === "A_CUENTA" ? (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-danger">Saldo pendiente</span>
                      <span className="font-semibold text-danger">
                        {formatCurrency(saldoPendiente, "ARS")}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-text-dim">Estado</span>
                      <span className="font-medium text-success">Pagado en su totalidad</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {pedido && (
          <div className="flex flex-col gap-2 border-t border-border p-4">
            {pedido.estadoPago !== "PAGADA" && (
              <button
                type="button"
                onClick={() => setModalCobroAbierto(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                <DollarSign className="h-4 w-4" />
                Cobrar pedido
              </button>
            )}
            {pedido.montoPagado === 0 && pedido.estadoPago !== "CANCELADA" && pedido.estadoPago !== "ANULADA" && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#fbe4e4] bg-[#fef7f7] px-3 py-2">
              {confirmandoCancelar ? (
                <>
                  <span className="text-sm text-danger">¿Seguro que querés cancelar este pedido?</span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmandoCancelar(false)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-dim hover:bg-surface-hover"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelar}
                      disabled={cancelando}
                      className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Sí, cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoCancelar(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-danger hover:underline"
                >
                  <XCircle className="h-4 w-4" />
                  Cancelar pedido
                </button>
              )}
            </div>
          )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={descargarComprobante}
                disabled={descargando}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:opacity-50"
              >
                {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Comprobante
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>

      {modalCobroAbierto && pedido && (
        <div onClick={(e) => e.stopPropagation()}>
          <ModalCobrarPedido
            pedido={{
              id: pedido.id,
              clienteNombre: pedido.clienteNombre,
              totalARS: pedido.totalARS,
              montoPagado: pedido.montoPagado,
              estadoPago: pedido.estadoPago,
              armado: pedido.armado,
              enviado: pedido.enviado,
              retirado: pedido.retirado,
              fecha: pedido.fecha,
            }}
            tieneCliente={pedido.clienteNombre != null}
            onClose={() => setModalCobroAbierto(false)}
            onCobrado={() => {
              setModalCobroAbierto(false);
              recargar();
              onCambio?.();
            }}
          />
        </div>
      )}
    </div>
  );
}