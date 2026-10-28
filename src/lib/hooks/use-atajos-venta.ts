"use client";

import { useEffect, useRef } from "react";

/**
 * Atajos de teclado de Nueva venta (issue #110).
 *
 * - Las teclas F andan siempre (también escribiendo en un campo), salvo que
 *   haya un modal abierto: ahí el teclado es del modal.
 * - "+", "-" y Supr solo cuando no se está escribiendo. Excepción: el buscador
 *   de productos vacío, que es donde queda el cursor después de escanear.
 * - Se evitan F5 (recargar), F11 (pantalla completa) y F12 (herramientas de
 *   Chrome): un error ahí hace perder el carrito.
 */
export type AccionesVenta = {
  buscarProducto: () => void;
  buscarCliente: () => void;
  consultarPrecio: () => void;
  descuento: () => void;
  medioDePago: () => void;
  confirmar: () => void;
  sumarUltimo: () => void;
  restarUltimo: () => void;
  quitarUltimo: () => void;
};

/** Elementos de la pantalla que usan los atajos (atributo data-atajo). */
export const ATAJO = {
  buscarProducto: "buscar-producto",
  buscarCliente: "buscar-cliente",
  medioDePago: "medio-de-pago",
} as const;

export function elementoAtajo<T extends HTMLElement = HTMLElement>(nombre: string): T | null {
  return document.querySelector<T>(`[data-atajo="${nombre}"]`);
}

/**
 * Deja el cursor en el buscador de productos, listo para escanear. Solo en
 * pantallas grandes: en el celular abriría el teclado sin que nadie lo pida.
 */
export function enfocarBuscadorProducto() {
  if (!window.matchMedia("(min-width: 1024px)").matches) return;
  elementoAtajo<HTMLInputElement>(ATAJO.buscarProducto)?.focus();
}

/** Hay un modal abierto (todos los de la app son un fondo oscuro fixed inset-0). */
function hayModalAbierto(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(".fixed.inset-0")).some(
    (el) => /\bbg-black\//.test(el.className) && getComputedStyle(el).display !== "none"
  );
}

function estaEscribiendo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    if (["checkbox", "radio", "button", "submit"].includes(el.type)) return false;
    // El buscador de productos vacío no cuenta: ahí queda el cursor al escanear.
    return !(el.dataset.atajo === ATAJO.buscarProducto && el.value === "");
  }
  return false;
}

const TECLAS_F: Record<string, keyof AccionesVenta> = {
  F2: "buscarProducto",
  F3: "buscarCliente",
  F4: "consultarPrecio",
  F6: "descuento",
  F8: "medioDePago",
  F9: "confirmar",
};

export function useAtajosVenta(acciones: AccionesVenta) {
  // Las acciones cambian en cada render (cierran sobre el carrito): se leen del ref.
  const ref = useRef(acciones);
  useEffect(() => {
    ref.current = acciones;
  });

  useEffect(() => {
    function alApretar(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;

      const accionF = TECLAS_F[e.key];
      if (accionF) {
        if (hayModalAbierto()) return;
        e.preventDefault();
        if (e.repeat) return; // dejar apretada F9 no confirma dos veces
        ref.current[accionF]();
        return;
      }

      if (e.key !== "+" && e.key !== "-" && e.key !== "Delete") return;
      if (hayModalAbierto() || estaEscribiendo(e.target)) return;
      e.preventDefault();
      if (e.key === "+") ref.current.sumarUltimo();
      else if (e.key === "-") ref.current.restarUltimo();
      else if (!e.repeat) ref.current.quitarUltimo();
    }
    window.addEventListener("keydown", alApretar);
    // Al entrar a Nueva venta, el cursor arranca en el buscador.
    if (document.activeElement === document.body) enfocarBuscadorProducto();
    return () => window.removeEventListener("keydown", alApretar);
  }, []);
}
