"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (public/sw.js, issue #39). Solo en producción
 * (`npm run build && npm run start` o Vercel): en `npm run dev` guardar copias
 * de los archivos estorba al recargar cambios. Para probarlo en dev, poner
 * NEXT_PUBLIC_SW_EN_DEV=1 en el .env.
 *
 * Además le pide al service worker que guarde una copia de Nueva venta (al
 * cargar, al volver la conexión y cada 15 minutos), así está disponible sin
 * conexión aunque se haya entrado desde el menú.
 */
const CADA_MS = 15 * 60 * 1000;

function pedirPrecarga() {
  if (!navigator.onLine) return;
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ tipo: "precargar" })).catch(() => {});
}

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SW_EN_DEV !== "1") return;
    const registrar = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(pedirPrecarga)
        .catch((err) => console.warn("No se pudo registrar el service worker", err));
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
    window.addEventListener("online", pedirPrecarga);
    const intervalo = window.setInterval(pedirPrecarga, CADA_MS);
    return () => {
      window.removeEventListener("load", registrar);
      window.removeEventListener("online", pedirPrecarga);
      window.clearInterval(intervalo);
    };
  }, []);
  return null;
}
