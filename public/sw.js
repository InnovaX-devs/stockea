/*
 * Service worker de Stockea (issue #39).
 *
 * Qué hace:
 * - Archivos estáticos de Next (/_next/static/…, con hash en el nombre),
 *   fuentes e íconos: se guardan la primera vez y después se sirven de la
 *   copia (no cambian nunca: un deploy nuevo trae nombres nuevos).
 * - Páginas: SIEMPRE se piden a internet primero (con conexión, todo es igual
 *   que sin service worker). De Nueva venta se guarda una copia cada vez que
 *   se abre bien; sin conexión se muestra esa copia, y para el resto de las
 *   páginas, offline.html.
 * - /api y las peticiones internas de Next (RSC) no se tocan: van directo a
 *   internet. La venta sin conexión no depende del service worker: usa la copia
 *   local del catálogo (#40) y la cola de ventas en IndexedDB (#41).
 * - Como a Nueva venta casi siempre se entra desde el menú (Next cambia de
 *   página sin recargar y el service worker no se entera), la app le avisa
 *   al service worker (mensaje "precargar") y él la descarga por su cuenta,
 *   junto con los archivos JS/CSS que necesita para funcionar.
 * - Al volver a /login (cerrar sesión) se borran las páginas guardadas, así
 *   el siguiente usuario no ve la copia del anterior.
 *
 * Al cambiar algo de este archivo, subir VERSION: se borran las copias viejas.
 */
const VERSION = "v2";
const CACHE_ESTATICOS = `stockea-estaticos-${VERSION}`;
const CACHE_PAGINAS = `stockea-paginas-${VERSION}`;
const OFFLINE = "/offline.html";
const PAGINAS_SIN_CONEXION = ["/ventas"];
const PRECARGA = [OFFLINE, "/icons/icon-192.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ESTATICOS)
      .then((cache) => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c.startsWith("stockea-") && c !== CACHE_ESTATICOS && c !== CACHE_PAGINAS)
            .map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

function esEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === OFFLINE;
}

async function primeroCopia(request) {
  const cache = await caches.open(CACHE_ESTATICOS);
  const copia = await cache.match(request);
  if (copia) return copia;
  const respuesta = await fetch(request);
  if (respuesta.ok) cache.put(request, respuesta.clone());
  return respuesta;
}

// Guarda los /_next/static/… que pide una página, así funciona sin conexión
// aunque nunca se haya abierto entera.
async function guardarArchivosDe(html) {
  const rutas = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
  if (rutas.size === 0) return;
  const cache = await caches.open(CACHE_ESTATICOS);
  await Promise.all(
    [...rutas].map(async (ruta) => {
      if (await cache.match(ruta)) return;
      try {
        const r = await fetch(ruta);
        if (r.ok) await cache.put(ruta, r);
      } catch {
        // Sin conexión o archivo de un deploy viejo: se ignora.
      }
    })
  );
}

async function guardarPagina(ruta, respuesta) {
  const cache = await caches.open(CACHE_PAGINAS);
  await cache.put(ruta, respuesta.clone());
  await guardarArchivosDe(await respuesta.text());
}

async function precargarPaginas() {
  for (const ruta of PAGINAS_SIN_CONEXION) {
    try {
      const respuesta = await fetch(ruta, { credentials: "same-origin", cache: "no-store" });
      const final = new URL(respuesta.url || ruta, self.location.origin);
      if (final.pathname === "/login") {
        await caches.delete(CACHE_PAGINAS);
        return;
      }
      if (respuesta.ok && final.pathname === ruta) await guardarPagina(ruta, respuesta);
    } catch {
      return; // sin conexión: queda la copia que ya había
    }
  }
}

let precargando = null;
self.addEventListener("message", (event) => {
  if (event.data?.tipo !== "precargar") return;
  precargando = precargando || precargarPaginas().finally(() => (precargando = null));
  event.waitUntil(precargando);
});

async function pagina(request) {
  const url = new URL(request.url);
  try {
    const respuesta = await fetch(request);
    const final = new URL(respuesta.url || request.url);

    // Cerró sesión (o la sesión venció): fuera las copias del usuario anterior.
    if (final.pathname === "/login") {
      await caches.delete(CACHE_PAGINAS);
    } else if (respuesta.ok && PAGINAS_SIN_CONEXION.includes(final.pathname)) {
      // Sin await: la página se muestra ya y la copia se guarda de fondo.
      guardarPagina(final.pathname, respuesta.clone()).catch(() => {});
    }
    return respuesta;
  } catch {
    // Sin conexión.
    const cache = await caches.open(CACHE_PAGINAS);
    const copia =
      (await cache.match(url.pathname)) ||
      (url.pathname === "/" ? await cache.match("/ventas") : null);
    if (copia) return copia;
    return (await caches.match(OFFLINE)) || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(pagina(request));
    return;
  }
  if (esEstatico(url)) {
    event.respondWith(primeroCopia(request));
  }
  // Todo lo demás (RSC, imágenes de productos, etc.): directo a internet.
});
