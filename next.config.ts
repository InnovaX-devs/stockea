import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  typedRoutes: false,
  // Importación de productos desde Excel (src/lib/importar-productos-parseo.ts): se carga
  // como paquete de Node en vez de empaquetarse.
  serverExternalPackages: ["exceljs"],
  // Service worker (#39): que el navegador siempre busque la versión nueva.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  // sharp en Vercel: el empaquetado de cada función no incluye la librería
  // nativa libvips (libvips-cpp.so) y falla con ERR_DLOPEN_FAILED. La
  // forzamos a entrar en las rutas que convierten imágenes.
  outputFileTracingIncludes: {
    "/api/upload": [
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
    ],
    "/api/productos/pdf": [
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  images: {
    // Miniaturas de productos en Nueva venta (#108): que el navegador conserve
    // la imagen ya optimizada 30 días, así se ve también sin conexión. La URL
    // de la foto cambia al subir una nueva (lleva la fecha), no queda vieja.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};
export default nextConfig