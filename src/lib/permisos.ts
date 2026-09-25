/**
 * Permisos por rol. ÚNICA fuente de verdad de "qué puede hacer el empleado".
 *
 * - ADMIN: todo (sujeto a la licencia, como siempre).
 * - EMPLEADO: solo existe con licencia PREMIUM. Usa Nueva Venta, Pedidos y
 *   Clientes, y ve Productos como catálogo (sin costos ni ganancias).
 *
 * Este archivo no importa Prisma ni nada de servidor: lo usa también el
 * proxy (middleware), que corre antes de cada request.
 *
 * Ojo: esto controla PÁGINAS y RUTAS /api. Las server actions se pueden
 * llamar desde cualquier página, así que las que son solo de admin llaman
 * además a requerirAdmin() (src/lib/empresa.ts).
 */

export type Rol = "ADMIN" | "EMPLEADO";

/** Adónde va el empleado cuando entra o toca algo que no puede ver. */
export const INICIO_EMPLEADO = "/ventas";

/** Páginas que ve el empleado (coincidencia exacta). */
const PAGINAS_EMPLEADO = ["/ventas", "/ventas/pedidos", "/clientes", "/productos", "/salir"];

/** Rutas /api que puede usar el empleado, con el método permitido. */
const API_EMPLEADO: { patron: RegExp; metodos: string[] }[] = [
  { patron: /^\/api\/auth(\/|$)/, metodos: ["GET", "POST"] },
  // Lee cotización y módulos habilitados (lo usa la pantalla de venta).
  { patron: /^\/api\/configuracion$/, metodos: ["GET"] },
  // Catálogo y buscador del carrito: el costo se saca del lado del servidor.
  { patron: /^\/api\/productos$/, metodos: ["GET"] },
  { patron: /^\/api\/productos\/buscar$/, metodos: ["GET"] },
  // Filtros del catálogo.
  { patron: /^\/api\/marcas$/, metodos: ["GET"] },
  { patron: /^\/api\/categorias$/, metodos: ["GET"] },
  // Elegir cuenta al cobrar: el saldo se saca del lado del servidor.
  { patron: /^\/api\/cuentas$/, metodos: ["GET"] },
  // Comprobante de una venta / pedido.
  { patron: /^\/api\/ventas\/\d+\/comprobante$/, metodos: ["GET"] },
];

export function esRutaApi(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * ¿Puede este rol entrar a esta ruta? El ADMIN siempre puede (los módulos
 * Premium los sigue controlando la licencia en cada página / API).
 */
export function puedeAcceder(rol: Rol | undefined, pathname: string, metodo: string): boolean {
  if (rol !== "EMPLEADO") return true;

  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (esRutaApi(ruta)) {
    return API_EMPLEADO.some((r) => r.patron.test(ruta) && r.metodos.includes(metodo.toUpperCase()));
  }

  // Archivos estáticos de /public (imágenes, robots.txt, etc.).
  if (/\.[a-z0-9]+$/i.test(ruta)) return true;

  return PAGINAS_EMPLEADO.includes(ruta);
}

/** Qué ítems del menú ve cada rol (por href). */
export function puedeVerEnMenu(rol: Rol | undefined, href: string) {
  return puedeAcceder(rol, href, "GET");
}
