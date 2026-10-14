import type { MetadataRoute } from "next";

/**
 * Manifest de la app (PWA, issue #39): permite "instalar" Stockea en la
 * compu o el celular y abrirlo en su propia ventana, sin la barra del
 * navegador. Los íconos se generan con scripts/generar-iconos.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stockea",
    short_name: "Stockea",
    description: "Stock, ventas, compras, clientes y caja en un solo sistema.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAFAFC",
    theme_color: "#132A1F",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
