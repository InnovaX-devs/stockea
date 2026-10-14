// venta-context.tsx
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { ClienteBusquedaResult } from "@/lib/clientes-busqueda";
import type { ModoCobro, PagoLinea } from "@/types/pago";
import { cargarConfig } from "@/lib/offline/buscar";

type TipoPrecio = "MINORISTA" | "MAYORISTA";

type VentaContextValue = {
  tipoPrecio: TipoPrecio;
  setTipoPrecio: (tipo: TipoPrecio) => void;
  cliente: ClienteBusquedaResult | null;
  setCliente: (cliente: ClienteBusquedaResult | null) => void;
  modoCobro: ModoCobro;
  setModoCobro: (modo: ModoCobro) => void;
  pagos: PagoLinea[];
  setPagos: (pagos: PagoLinea[]) => void;
  cotizacionUSD: number; // NUEVO
  usaCotizacionUSD: boolean;
};

const VentaContext = createContext<VentaContextValue | null>(null);

export function VentaProvider({ children }: { children: ReactNode }) {
  const [tipoPrecio, setTipoPrecio] = useState<TipoPrecio>("MINORISTA");
  const [cliente, setClienteState] = useState<ClienteBusquedaResult | null>(null);
  const [modoCobro, setModoCobro] = useState<ModoCobro>("UNICA");
  const [pagos, setPagos] = useState<PagoLinea[]>([{ id: "pago-unica", cuentaId: null, monto: 0 }]);
  const [cotizacionUSD, setCotizacionUSD] = useState<number>(0); // NUEVO
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState<boolean>(false);

  // Traer la cotización UNA vez al abrir la pantalla de venta (red primero, copia local sin red)
  useEffect(() => {
    cargarConfig().then((c) => {
      setCotizacionUSD(c.cotizacionUSD);
      setUsaCotizacionUSD(c.usaCotizacionUSD);
    });
  }, []);

  function setCliente(nuevoCliente: ClienteBusquedaResult | null) {
    setClienteState(nuevoCliente);
    setTipoPrecio(nuevoCliente?.esMayorista ? "MAYORISTA" : "MINORISTA");
  }

  return (
    <VentaContext.Provider
      value={{
        tipoPrecio,
        setTipoPrecio,
        cliente,
        setCliente,
        modoCobro,
        setModoCobro,
        pagos,
        setPagos,
        cotizacionUSD,
        usaCotizacionUSD,
      }}
    >
      {children}
    </VentaContext.Provider>
  );
}

export function useVenta() {
  const ctx = useContext(VentaContext);
  if (!ctx) throw new Error("useVenta debe usarse dentro de VentaProvider");
  return ctx;
}