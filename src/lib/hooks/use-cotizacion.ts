"use client";

import { useEffect, useState } from "react";

/**
 * Cotización USD para convertir pagos en cuentas en dólares (0 mientras carga).
 * Mismo criterio que el backend: si el negocio no opera con dólares
 * (usaCotizacionUSD apagado o licencia BASICO), la cotización es 1.
 */
export function useCotizacionUSD(): number {
  const [cotizacion, setCotizacion] = useState(0);

  useEffect(() => {
    let activo = true;
    fetch("/api/configuracion")
      .then((r) => r.json())
      .then((data) => {
        if (!activo) return;
        const valor = data.usaCotizacionUSD ? Number(data.cotizacionUSD) || 0 : 1;
        setCotizacion(valor > 0 ? valor : 1);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

  return cotizacion;
}
