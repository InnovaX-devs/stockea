"use client";

import { useEffect } from "react";
import { sincronizarCatalogo } from "@/lib/offline/sync-catalogo";

/** Refresco cada pocos minutos con conexión (issue #40). */
const CADA_MS = 3 * 60 * 1000;

/** `sucursalKey` cambia al cambiar de sucursal → sincroniza en el momento. */
export function SincronizadorCatalogo({ sucursalKey }: { sucursalKey: string }) {
  useEffect(() => {
    const sincronizar = () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      sincronizarCatalogo().catch((err) => console.warn("No se pudo sincronizar el catálogo", err));
    };
    sincronizar();
    const intervalo = window.setInterval(sincronizar, CADA_MS);
    window.addEventListener("online", sincronizar);
    document.addEventListener("visibilitychange", sincronizar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("online", sincronizar);
      document.removeEventListener("visibilitychange", sincronizar);
    };
  }, [sucursalKey]);

  return null;
}