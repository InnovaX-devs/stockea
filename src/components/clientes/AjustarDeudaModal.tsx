"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { ajustarDeudaManual } from "@/app/(dashboard)/clientes/actions";
import type { CuentaOption } from "./CobrarDeudaModal";
import Select from "@/components/ui/select";
import { esCuentaUSD } from "@/lib/currency";
import { useCotizacionUSD } from "@/lib/hooks/use-cotizacion";


export default function AjustarDeudaModal({
  cliente,
  cuentas,
  onClose,
}: {
  cliente: { id: number; nombre: string };
  cuentas: CuentaOption[];
  onClose: () => void;
}) {
  const router = useRouter();

  const [tipo, setTipo] = useState<"aumentar" | "reducir">("aumentar");
  const [monto, setMonto] = useState("");
  const [cuentaId, setCuentaId] = useState<number | "">(cuentas[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cotizacion = useCotizacionUSD();

  // Al reducir deuda con una cuenta en dólares, se escriben los dólares que
  // pagó el cliente; la deuda baja por su equivalente en pesos.
  const enDolares =
    tipo === "reducir" && esCuentaUSD(cuentas.find((c) => c.id === cuentaId)?.tipo);
  const valorIngresado = Number(monto) || 0;
  const montoARS = enDolares ? Math.round(valorIngresado * cotizacion) : valorIngresado;

  async function handleSubmit() {
    const montoNum = montoARS;

    if (enDolares && cotizacion <= 0) {
      setError("Todavía no cargó la cotización, probá de nuevo en un segundo.");
      return;
    }

    if (!montoNum || montoNum <= 0) {
      setError("Ingresá un monto mayor a $0.");
      return;
    }

    if (tipo === "reducir" && !cuentaId) {
      setError("Elegí una cuenta.");
      return;
    }

    setGuardando(true);
    setError(null);

    const res = await ajustarDeudaManual({
      clienteId: cliente.id,
      tipo,
      monto: montoNum,
      cuentaId:
        tipo === "reducir" ? (cuentaId as number) : undefined,
      montoUSD: enDolares ? valorIngresado : null,
    });

    setGuardando(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    if (res.aplicado !== undefined && res.aplicado < montoNum) {
      alert(
        `El cliente solo tenía ${res.aplicado.toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
        })} de deuda pendiente. Se aplicó ese monto.`
      );
    }

    router.refresh();
    onClose();
  }

  const cuentaOptions = cuentas.map((cuenta) => ({
    value: String(cuenta.id),
    label: cuenta.nombre,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text">
              Ajuste manual de deuda
            </h2>

            <p className="text-sm text-text-dim">
              {cliente.nombre}
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-text-dim hover:text-text"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTipo("aumentar")}
              className={`py-2 rounded-lg text-sm font-medium border ${
                tipo === "aumentar"
                  ? "bg-danger text-white border-[#ba1a1a]"
                  : "border-border text-text-dim"
              }`}
            >
              Aumentar deuda
            </button>

            <button
              onClick={() => setTipo("reducir")}
              className={`py-2 rounded-lg text-sm font-medium border ${
                tipo === "reducir"
                  ? "bg-[#0f9d58] text-white border-[#0f9d58]"
                  : "border-border text-text-dim"
              }`}
            >
              Reducir deuda
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-dim mb-1">
              {enDolares ? "Monto (US$)" : "Monto"}
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={enDolares ? "US$0,00" : "$0,00"}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {enDolares && valorIngresado > 0 && (
              <p className="mt-1 text-xs text-text-dim">
                {cotizacion > 0
                  ? `Baja la deuda ${montoARS.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })} (cotización ${cotizacion.toLocaleString("es-AR")})`
                  : "Cargando cotización..."}
              </p>
            )}
          </div>

          {tipo === "reducir" && (
            <div>
              <label className="block text-xs font-semibold text-text-dim mb-1">
                Cuenta que recibe el pago
              </label>

              <Select
                value={cuentaId === "" ? "" : String(cuentaId)}
                onChange={(value) => setCuentaId(Number(value))}
                options={cuentaOptions}
              />
            </div>
          )}

          {tipo === "aumentar" && (
            <p className="text-xs text-text-dim">
              Se registra como una venta a cuenta ("Ajuste manual de deuda")
              sin movimiento de caja.
            </p>
          )}

          {error && (
            <p className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-surface-hover"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            disabled={guardando}
            className="flex-1 rounded-full bg-primary text-white py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Registrar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}