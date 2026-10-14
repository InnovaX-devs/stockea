"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado de conexión del navegador y cantidad de ventas pendientes de subir
 * (issue #39). Las ventas pendientes las va a cargar la cola de ventas sin
 * conexión (#41) llamando a `fijarVentasPendientes(n)`; por ahora siempre es 0.
 */
type Estado = { enLinea: boolean; ventasPendientes: number };

let estado: Estado = { enLinea: true, ventasPendientes: 0 };
const oyentes = new Set<() => void>();
let escuchando = false;

function emitir(nuevo: Partial<Estado>) {
  const siguiente = { ...estado, ...nuevo };
  if (siguiente.enLinea === estado.enLinea && siguiente.ventasPendientes === estado.ventasPendientes) return;
  estado = siguiente;
  oyentes.forEach((o) => o());
}

function empezarAEscuchar() {
  if (escuchando || typeof window === "undefined") return;
  escuchando = true;
  estado = { ...estado, enLinea: navigator.onLine };
  window.addEventListener("online", () => emitir({ enLinea: true }));
  window.addEventListener("offline", () => emitir({ enLinea: false }));
}

function suscribir(oyente: () => void) {
  empezarAEscuchar();
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

const ESTADO_SERVIDOR: Estado = { enLinea: true, ventasPendientes: 0 };

export function useEstadoConexion(): Estado {
  return useSyncExternalStore(
    suscribir,
    () => {
      empezarAEscuchar();
      return estado;
    },
    () => ESTADO_SERVIDOR
  );
}

export function fijarVentasPendientes(n: number) {
  emitir({ ventasPendientes: Math.max(0, Math.floor(n)) });
}
