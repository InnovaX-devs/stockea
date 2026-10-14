"use client";

import { useEffect } from "react";
import { sincronizarCatalogo } from "@/lib/offline/sync-catalogo";
import { sincronizarVentas, vigilarCola } from "@/lib/offline/cola-ventas";

/**
 * Refresco cada pocos minutos con conexión (issue #40). Primero suben las
 * ventas hechas sin conexión (#41) y después se baja el catálogo, así el stock
 * que se baja ya las incluye.
 */
const CADA_MS = 3 * 60 * 1000;

/** `sucursalKey` cambia al cambiar de sucursal → sincroniza en el momento. */
export function SincronizadorCatalogo({ sucursalKey }: { sucursalKey: string }) {
  useEffect(() => {
    const sincronizar = () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      sincronizarVentas()
        .catch((err) => console.warn("No se pudieron subir las ventas pendientes", err))
        .then(() => sincronizarCatalogo())
        .catch((err) => console.warn("No se pudo sincronizar el catálogo", err));
    };
    const dejarDeVigilar = vigilarCola();
    sincronizar();
    const intervalo = window.setInterval(sincronizar, CADA_MS);
    window.addEventListener("online", sincronizar);
    document.addEventListener("visibilitychange", sincronizar);
    return () => {
      dejarDeVigilar();
      window.clearInterval(intervalo);
      window.removeEventListener("online", sincronizar);
      document.removeEventListener("visibilitychange", sincronizar);
    };
  }, [sucursalKey]);

  return null;
}