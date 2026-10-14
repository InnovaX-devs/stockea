"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado de conexión del navegador y cantidad de ventas pendientes de subir
 * (issue #39). Las cifras las carga la cola de ventas sin conexión (#41)
 * con `fijarVentasPendientes(n)` y `fijarVentasConError(n)` (las que el
 * servidor rechazó y hay que mirar).
 */
type Estado = { enLinea: boolean; ventasPendientes: number; ventasConError: number };

let estado: Estado = { enLinea: true, ventasPendientes: 0, ventasConError: 0 };
const oyentes = new Set<() => void>();
let escuchando = false;

function emitir(nuevo: Partial<Estado>) {
  const siguiente = { ...estado, ...nuevo };
  if (
    siguiente.enLinea === estado.enLinea &&
    siguiente.ventasPendientes === estado.ventasPendientes &&
    siguiente.ventasConError === estado.ventasConError
  )
    return;
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

const ESTADO_SERVIDOR: Estado = { enLinea: true, ventasPendientes: 0, ventasConError: 0 };

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

export function fijarVentasConError(n: number) {
  emitir({ ventasConError: Math.max(0, Math.floor(n)) });
}
