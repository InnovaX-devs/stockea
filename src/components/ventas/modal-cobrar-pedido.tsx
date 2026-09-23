"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SelectorCobro } from "./selector-cobro";
import { registrarCobroPedido } from "@/app/(dashboard)/ventas/actions";
import { formatCurrency, redondearARS } from "@/lib/currency";
import type { ModoCobro, PagoLinea } from "@/types/pago";
import type { PedidoListItem } from "@/types/venta";

interface Props {
  pedido: PedidoListItem;
  tieneCliente: boolean;
  onClose: () => void;
  onCobrado: () => void;
}

export function ModalCobrarPedido({ pedido, tieneCliente, onClose, onCobrado }: Props) {
  // El totalARS puede venir con decimales por la conversión USD → ARS
  // (ej. 67.87 × 1560 = 105877.2). En pantalla y en el cobro se trabaja
  // siempre con pesos enteros, igual que en SelectorCobro y en el backend.
  const restante = redondearARS(pedido.totalARS - pedido.montoPagado);

  const [modo, setModo] = useState<ModoCobro>("UNICA");
  const [pagos, setPagos] = useState<PagoLinea[]>([{ id: "pago-unica", cuentaId: null, monto: restante }]);
  const [procesando, setProcesando] = useState(false);

  const sumaPagada = redondearARS(pagos.reduce((acc, p) => acc + p.monto, 0));
  const esValido =
    modo === "A_CUENTA"
      ? sumaPagada > 0 && sumaPagada <= restante && pagos.every((p) => p.cuentaId != null)
      : sumaPagada === restante && pagos.every((p) => p.cuentaId != null && p.monto > 0);

  async function handleConfirmar() {
    if (!esValido) return;
    setProcesando(true);
    const resultado = await registrarCobroPedido(
      pedido.id,
      pagos
        .filter((p) => p.cuentaId != null)
        .map((p) => ({
          cuentaId: p.cuentaId as number,
          monto: p.monto,
          montoUSD: p.esUSD ? p.montoUSD ?? null : null,
        }))
    );
    setProcesando(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }
    toast.success(`Pedido #${pedido.id} cobrado`);
    onCobrado();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-border pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text">Cobrar pedido</h2>
            {pedido.clienteNombre && (
              <p className="truncate text-sm text-text-dim">Cliente: {pedido.clienteNombre}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-dim">
            {pedido.montoPagado > 0 ? "Saldo pendiente" : "Total del pedido"}
          </span>
          <span className="text-xl font-bold text-text">{formatCurrency(restante, "ARS")}</span>
        </div>

        <div className="mt-4">
          <SelectorCobro
            total={restante}
            tieneCliente={tieneCliente}
            modo={modo}
            pagos={pagos}
            onCambiarModo={setModo}
            onCambiarPagos={setPagos}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!esValido || procesando}
            className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {procesando ? "Procesando..." : "Confirmar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
} 