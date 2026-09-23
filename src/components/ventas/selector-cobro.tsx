"use client";

import { useEffect, useState } from "react";
import { CreditCard, Plus, X } from "lucide-react";
import { SelectorCuentaModal } from "./selector-cuenta-modal";
import { formatCurrency, esCuentaUSD, redondearUSD } from "@/lib/currency";
import { useCotizacionUSD } from "@/lib/hooks/use-cotizacion";
import type { ModoCobro, PagoLinea, CuentaOption } from "@/types/pago";

interface Props {
  total: number;
  tieneCliente: boolean;
  modo: ModoCobro;
  pagos: PagoLinea[];
  onCambiarModo: (modo: ModoCobro) => void;
  onCambiarPagos: (pagos: PagoLinea[]) => void;
  /** Cotización a usar para las cuentas en USD. Si no se pasa, se trae de la configuración. */
  cotizacionUSD?: number;
}

export function SelectorCobro({
  total,
  tieneCliente,
  modo,
  pagos,
  onCambiarModo,
  onCambiarPagos,
  cotizacionUSD,
}: Props) {
  const [cuentasCache, setCuentasCache] = useState<Record<number, CuentaOption>>({});
  const [filaSeleccionandoCuenta, setFilaSeleccionandoCuenta] = useState<string | null>(null);
  const cotizacionConfig = useCotizacionUSD();
  const cotizacion = cotizacionUSD && cotizacionUSD > 0 ? cotizacionUSD : cotizacionConfig;

  // `monto` siempre es ARS (con eso se valida contra el total). En cuentas USD
  // el usuario escribe dólares (`montoUSD`) y el ARS se calcula con la cotización.
  function conMontoARS(pago: PagoLinea, montoARS: number): PagoLinea {
    return {
      ...pago,
      monto: montoARS,
      montoUSD: pago.esUSD && cotizacion > 0 ? redondearUSD(montoARS / cotizacion) : null,
    };
  }

  function conMontoUSD(pago: PagoLinea, montoUSD: number): PagoLinea {
    return { ...pago, montoUSD, monto: Math.round(montoUSD * cotizacion) };
  }

  const totalRedondeado = Math.round(total);
  const sumaPagada = pagos.reduce((acc, p) => acc + p.monto, 0);
  // Comparamos montos redondeados: el total puede tener decimales (ej. decants,
  // conversión USD) que nunca se cobran en la práctica, así que un pago que
  // coincide con el total "redondeado" que se ve en pantalla es válido.
  const diferencia = totalRedondeado - Math.round(sumaPagada);

  // Autocompletar el monto a pagar con el total redondeado cuando el cobro es
  // "Única cuenta" (se dispara al entrar en modo Única y cada vez que cambia
  // el total, ej. se agregó/sacó un producto del carrito).
  useEffect(() => {
    if (
      modo === "UNICA" &&
      pagos.length === 1 &&
      (pagos[0].monto !== totalRedondeado || (pagos[0].esUSD && pagos[0].montoUSD == null))
    ) {
      onCambiarPagos([conMontoARS(pagos[0], totalRedondeado)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, totalRedondeado, cotizacion]);

  function abrirSelectorCuenta(filaId: string) {
    setFilaSeleccionandoCuenta(filaId);
  }

  function elegirCuenta(cuenta: CuentaOption) {
    setCuentasCache((prev) => ({ ...prev, [cuenta.id]: cuenta }));
    // Al elegir la cuenta se mantiene el monto en ARS y, si la cuenta es en
    // dólares, se calcula cuántos USD son (ej. $105.877 → US$ 67,87).
    onCambiarPagos(
      pagos.map((p) =>
        p.id === filaSeleccionandoCuenta
          ? conMontoARS({ ...p, cuentaId: cuenta.id, esUSD: esCuentaUSD(cuenta.tipo) }, p.monto)
          : p
      )
    );
    setFilaSeleccionandoCuenta(null);
  }

  // `valor` viene en la moneda de la cuenta: dólares si es USD, pesos si no.
  function cambiarMonto(filaId: string, valor: number) {
    onCambiarPagos(
      pagos.map((p) =>
        p.id !== filaId ? p : p.esUSD ? conMontoUSD(p, valor) : { ...p, monto: valor, montoUSD: null }
      )
    );
  }

  function agregarFila() {
    onCambiarPagos([...pagos, { id: `pago-${Date.now()}`, cuentaId: null, monto: 0 }]);
  }

  function eliminarFila(filaId: string) {
    onCambiarPagos(pagos.filter((p) => p.id !== filaId));
  }

  function completarResto(filaId: string) {
    const otras = pagos.filter((p) => p.id !== filaId).reduce((acc, p) => acc + p.monto, 0);
    const resto = Math.max(0, Math.round(total - otras));
    onCambiarPagos(pagos.map((p) => (p.id === filaId ? conMontoARS(p, resto) : p)));
  }

  function cambiarModo(nuevoModo: ModoCobro) {
    if (nuevoModo === "A_CUENTA" && !tieneCliente) return; // bloqueado sin cliente
    onCambiarModo(nuevoModo);
    if (nuevoModo === "UNICA") {
      onCambiarPagos([
        conMontoARS(
          { id: "pago-unica", cuentaId: pagos[0]?.cuentaId ?? null, esUSD: pagos[0]?.esUSD, monto: 0 },
          Math.round(total)
        ),
      ]);
    } else if (nuevoModo === "MIXTO" && pagos.length < 2) {
      onCambiarPagos([
        { id: "pago-1", cuentaId: null, monto: 0 },
        { id: "pago-2", cuentaId: null, monto: 0 },
      ]);
    } else if (nuevoModo === "A_CUENTA") {
      onCambiarPagos([
        { id: "pago-acuenta", cuentaId: pagos[0]?.cuentaId ?? null, esUSD: pagos[0]?.esUSD, monto: 0, montoUSD: null },
      ]);
    }
  }

  const esValido =
    modo === "A_CUENTA"
      ? sumaPagada >= 0 && Math.round(sumaPagada) <= totalRedondeado && pagos.every((p) => p.cuentaId != null)
      : diferencia === 0 && pagos.every((p) => p.cuentaId != null && p.monto > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-dim">Cobro</span>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => cambiarModo("UNICA")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              modo === "UNICA" ? "bg-primary text-white" : "text-text-dim hover:text-text"
            }`}
          >
            Única
          </button>
          <button
            type="button"
            onClick={() => cambiarModo("MIXTO")}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              modo === "MIXTO" ? "bg-primary text-white" : "text-text-dim hover:text-text"
            }`}
          >
            Mixto
          </button>
          <button
            type="button"
            onClick={() => cambiarModo("A_CUENTA")}
            disabled={!tieneCliente}
            title={!tieneCliente ? "Seleccioná un cliente para usar 'A cuenta'" : undefined}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              modo === "A_CUENTA" ? "bg-primary text-white" : "text-text-dim hover:text-text"
            }`}
          >
            A cuenta
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {pagos.map((pago) => (
          <div key={pago.id} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <button
              type="button"
              onClick={() => abrirSelectorCuenta(pago.id)}
              className="flex min-w-[140px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
            >
              <CreditCard size={14} className="text-text-dim shrink-0" />
              <span className="truncate">
                {pago.cuentaId != null ? cuentasCache[pago.cuentaId]?.nombre ?? "Cuenta" : "Seleccionar cuenta..."}
              </span>
            </button>

            <div className="relative w-24 shrink-0 sm:w-32">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-dim">
                {pago.esUSD ? "US$" : "$"}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={pago.esUSD && cotizacion <= 0}
                value={(pago.esUSD ? pago.montoUSD : pago.monto) || ""}
                onChange={(e) => cambiarMonto(pago.id, Number(e.target.value) || 0)}
                className={`w-full rounded-lg border border-border bg-surface py-2 pr-2 text-right text-sm text-text focus:border-primary focus:outline-none disabled:opacity-50 ${
                  pago.esUSD ? "pl-9" : "pl-5"
                }`}
              />
            </div>

            {modo === "MIXTO" && (
              <button
                type="button"
                onClick={() => completarResto(pago.id)}
                className="shrink-0 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-2 text-xs font-medium text-text-dim hover:bg-surface-hover"
              >
                Resto
              </button>
            )}

            {modo === "MIXTO" && pagos.length > 2 && (
              <button
                type="button"
                onClick={() => eliminarFila(pago.id)}
                className="shrink-0 text-text-dim hover:text-danger"
                aria-label="Quitar fila"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {pago.esUSD && (
            <p className="text-right text-xs text-text-dim">
              {cotizacion > 0
                ? `≈ ${formatCurrency(pago.monto, "ARS")} (cotización ${cotizacion.toLocaleString("es-AR")})`
                : "Cargando cotización..."}
            </p>
          )}
          </div>
        ))}

        {modo === "MIXTO" && (
          <button
            type="button"
            onClick={agregarFila}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus size={12} /> Agregar cuenta
          </button>
        )}
      </div>

      {modo === "MIXTO" && (
        <p className={`text-xs ${diferencia === 0 ? "text-success" : "text-danger"}`}>
          {diferencia === 0
            ? "El reparto coincide con el total ✓"
            : diferencia > 0
              ? `Falta repartir ${formatCurrency(diferencia, "ARS")}`
              : `Te pasaste por ${formatCurrency(-diferencia, "ARS")}`}
        </p>
      )}

      {modo === "UNICA" && pagos[0]?.cuentaId != null && diferencia !== 0 && (
        <p className="text-xs text-danger">
          {diferencia > 0
            ? `Faltan ${formatCurrency(diferencia, "ARS")} para llegar al total`
            : `Te pasaste por ${formatCurrency(-diferencia, "ARS")}`}
          {pagos[0].esUSD && cotizacion > 0 && ` (≈ US$ ${redondearUSD(Math.abs(diferencia) / cotizacion)})`}
        </p>
      )}

      {modo === "A_CUENTA" && Math.round(sumaPagada) < totalRedondeado && (
        <p className="text-xs text-warning">
          Queda como deuda del cliente: {formatCurrency(totalRedondeado - Math.round(sumaPagada), "ARS")}
        </p>
      )}

      {!esValido && modo !== "MIXTO" && pagos.some((p) => p.cuentaId == null) && (
        <p className="text-xs text-danger">Falta seleccionar la cuenta</p>
      )}

      {filaSeleccionandoCuenta && (
        <SelectorCuentaModal onSeleccionar={elegirCuenta} onClose={() => setFilaSeleccionandoCuenta(null)} />
      )}
    </div>
  );
}