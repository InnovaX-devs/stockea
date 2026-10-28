import { liveQuery } from "dexie";
import { toast } from "sonner";
import { db, expandirPromocionesLocal, leerAlcance, pedirAlmacenamientoPersistente, type PayloadVentaLocal, type VentaLocal } from "./db";
import { fijarVentasConError, fijarVentasPendientes } from "./estado-conexion";
import { sincronizarCatalogo } from "./sync-catalogo";

/**
 * Cola de ventas sin conexión (issue #41).
 *
 * - `encolarVenta` guarda la venta en IndexedDB ("outbox") y descuenta el
 *   stock de la copia local para que las ventas siguientes lo vean.
 * - `sincronizarVentas` las manda a POST /api/sync/ventas EN ORDEN, de a una,
 *   cuando hay red. Cada venta lleva un `idCliente` (uuid): si el envío se
 *   corta a medias y se reintenta, el servidor reconoce la venta y no la
 *   duplica, así que reenviar siempre es seguro.
 * - Hasta que el servidor le da su número (la numeración es por empresa y la
 *   lleva el servidor), la venta se muestra como "Pendiente".
 * - Si el servidor rechaza una venta (producto o cuenta que ya no existen,
 *   sucursal sin acceso…) queda en estado "error" con el motivo: no frena a
 *   las demás y se puede reintentar o descartar a mano. Nunca se borra sola.
 */

const RETENCION_SINCRONIZADAS_MS = 24 * 60 * 60 * 1000;
const CERROJO = "stockea-sync-ventas";

export function nuevoIdCliente(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Contextos sin crypto.randomUUID (http en red local): uuid v4 a mano.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

export type DatosVentaLocal = {
  empresaId: number;
  sucursalId: number;
  idCliente: string;
  venta: PayloadVentaLocal;
  clienteNombre: string | null;
  /** Nombre de cada producto, para el resumen ("Perfume X ×2, …"). */
  nombres: Record<number, string>;
};

function resumir(venta: PayloadVentaLocal, nombres: Record<number, string>): string {
  const partes = venta.items.map((i) => `${nombres[i.productoId] ?? `Producto ${i.productoId}`} ×${i.cantidad}`);
  const texto = partes.slice(0, 3).join(", ");
  return partes.length > 3 ? `${texto} y ${partes.length - 3} más` : texto;
}

/** Guarda la venta en la cola y baja el stock de la copia local. */
export async function encolarVenta(datos: DatosVentaLocal): Promise<VentaLocal> {
  const entrada: VentaLocal = {
    idCliente: datos.idCliente,
    empresaId: datos.empresaId,
    sucursalId: datos.sucursalId,
    creadaEn: Date.now(),
    estado: "pendiente",
    intentos: 0,
    totalARS: datos.venta.totalARS,
    clienteNombre: datos.clienteNombre,
    resumen: resumir(datos.venta, datos.nombres),
    venta: datos.venta,
  };

  await db.transaction("rw", db.outbox, db.productos, async () => {
    entrada.id = await db.outbox.add(entrada);
    await ajustarStockLocal(datos.venta.items, -1);
  });
  // Hay una venta que solo existe en esta compu: que el navegador no la borre.
  void pedirAlmacenamientoPersistente();
  return entrada;
}

/** Suma (+1) o resta (-1) a la copia local del stock; puede quedar negativo. Las promos (#114) mueven lo que incluyen. */
async function ajustarStockLocal(itemsVenta: PayloadVentaLocal["items"], signo: 1 | -1) {
  const items = await expandirPromocionesLocal(itemsVenta);
  const porProducto = new Map<number, number>();
  for (const i of items) porProducto.set(i.productoId, (porProducto.get(i.productoId) ?? 0) + i.cantidad);
  for (const [id, cantidad] of porProducto) {
    await db.productos.where("id").equals(id).modify((p) => {
      if (p.controlaStock !== false) p.stockActual += signo * cantidad; // verdura, fiambre…: sin stock
    });
  }
}

/** Ventas de la cola de la empresa actual, las más nuevas primero. */
export async function listarVentasLocales(): Promise<VentaLocal[]> {
  const alcance = await leerAlcance();
  const todas = await db.outbox.toArray();
  return todas.filter((v) => !alcance || v.empresaId === alcance.empresaId).sort((a, b) => b.creadaEn - a.creadaEn);
}

/** Cantidad de ventas que todavía no subieron / que el servidor rechazó. */
async function contar() {
  const alcance = await leerAlcance();
  const todas = await db.outbox.where("estado").anyOf("pendiente", "error").toArray();
  const propias = todas.filter((v) => !alcance || v.empresaId === alcance.empresaId);
  return {
    pendientes: propias.filter((v) => v.estado === "pendiente").length,
    conError: propias.filter((v) => v.estado === "error").length,
  };
}

/**
 * Mantiene al día los contadores de la barra superior mirando la cola
 * (también cuando cambia desde otra pestaña). Devuelve cómo dejar de mirar.
 */
export function vigilarCola(): () => void {
  const suscripcion = liveQuery(contar).subscribe({
    next: ({ pendientes, conError }) => {
      fijarVentasPendientes(pendientes);
      fijarVentasConError(conError);
    },
    error: () => {},
  });
  return () => suscripcion.unsubscribe();
}

/** Para la pantalla: la lista, siempre actualizada. */
export function observarVentasLocales(alCambiar: (ventas: VentaLocal[]) => void): () => void {
  const suscripcion = liveQuery(listarVentasLocales).subscribe({ next: alCambiar, error: () => {} });
  return () => suscripcion.unsubscribe();
}

export type ResultadoSincronizacion = {
  /** Ventas que subieron en esta pasada, con el número que les tocó. */
  subidas: { numero: number; stockNegativo: boolean; productos: string[] }[];
  /** La sesión venció: hay que volver a entrar para que suban. */
  sesionVencida: boolean;
};

const VACIO: ResultadoSincronizacion = { subidas: [], sesionVencida: false };

let enCurso: Promise<ResultadoSincronizacion> | null = null;

/**
 * Sube las ventas pendientes, en orden. Si ya hay una pasada en curso
 * (en esta pestaña o en otra) no arranca otra.
 */
export function sincronizarVentas(): Promise<ResultadoSincronizacion> {
  if (typeof navigator === "undefined" || !navigator.onLine) return Promise.resolve(VACIO);
  if (!enCurso) {
    enCurso = conCerrojo(ejecutar)
      .then(avisar)
      .finally(() => (enCurso = null));
  }
  return enCurso;
}

/** Una sola pestaña a la vez (el servidor igual deduplica por idCliente). */
async function conCerrojo(fn: () => Promise<ResultadoSincronizacion>): Promise<ResultadoSincronizacion> {
  if (!("locks" in navigator)) return fn();
  const resultado = await navigator.locks.request(CERROJO, { ifAvailable: true }, async (cerrojo) =>
    cerrojo ? fn() : null
  );
  return resultado ?? VACIO;
}

async function ejecutar(): Promise<ResultadoSincronizacion> {
  const alcance = await leerAlcance();
  const subidas: ResultadoSincronizacion["subidas"] = [];
  let sesionVencida = false;

  // En orden de creación (id autoincremental). Las "error" no se reintentan solas.
  const pendientes = (await db.outbox.where("estado").equals("pendiente").sortBy("id")).filter(
    (v) => !alcance || v.empresaId === alcance.empresaId
  );

  for (const v of pendientes) {
    let res: Response;
    try {
      res = await fetch("/api/sync/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ...v.venta,
          idCliente: v.idCliente,
          empresaId: v.empresaId,
          sucursalId: v.sucursalId,
          fecha: new Date(v.creadaEn).toISOString(),
        }),
      });
    } catch {
      break; // sin red: queda todo como estaba, se reintenta después
    }

    // Sin sesión, el proxy redirige al login (HTML): no es una respuesta de la API.
    const esJson = (res.headers.get("content-type") ?? "").includes("application/json");
    if (res.status === 401 || res.redirected || !esJson) {
      sesionVencida = true;
      break;
    }
    const data = await res.json().catch(() => null);

    if (res.status === 409 && data?.codigo === "OTRA_EMPRESA") continue; // de otra cuenta: no se toca

    if (res.ok && data?.success) {
      await db.outbox.update(v.id!, {
        estado: "sincronizada",
        numero: data.numero,
        sincronizadaEn: Date.now(),
        stockNegativo: !!data.stockNegativo,
        productosStockNegativo: data.productosStockNegativo ?? [],
        error: undefined,
      });
      subidas.push({ numero: data.numero, stockNegativo: !!data.stockNegativo, productos: data.productosStockNegativo ?? [] });
    } else if (data?.permanente) {
      // El servidor la entendió y la rechazó: se deja a la vista y se sigue con las demás.
      await db.outbox.update(v.id!, { estado: "error", error: data.error ?? "No se pudo guardar la venta.", intentos: v.intentos + 1 });
    } else {
      break; // error del servidor (5xx): se reintenta en la próxima pasada
    }
  }

  // Las ya subidas se muestran un día y se limpian.
  const limite = Date.now() - RETENCION_SINCRONIZADAS_MS;
  await db.outbox
    .where("estado")
    .equals("sincronizada")
    .filter((v) => (v.sincronizadaEn ?? 0) < limite)
    .delete();

  return { subidas, sesionVencida };
}

function avisar(r: ResultadoSincronizacion): ResultadoSincronizacion {
  if (r.subidas.length > 0) {
    const numeros = r.subidas.map((s) => `#${s.numero}`);
    toast.success(
      r.subidas.length === 1
        ? `Venta ${numeros[0]} subida`
        : `${r.subidas.length} ventas subidas (${numeros.length > 4 ? `${numeros.slice(0, 4).join(", ")}…` : numeros.join(", ")})`,
      { id: "ventas-subidas" }
    );
    for (const s of r.subidas.filter((x) => x.stockNegativo)) {
      toast.warning(`La venta #${s.numero} dejó stock negativo en: ${s.productos.join(", ")}`, { duration: 12000 });
    }
    // El stock del servidor cambió: se refresca la copia local.
    sincronizarCatalogo().catch(() => {});
  }
  if (r.sesionVencida) {
    toast.warning("Tus ventas sin subir esperan: volvé a iniciar sesión para enviarlas.", { id: "ventas-sesion", duration: 10000 });
  }
  return r;
}

/** Vuelve a poner en la cola una venta rechazada y lo intenta de nuevo. */
export async function reintentarVenta(id: number) {
  await db.outbox.update(id, { estado: "pendiente", error: undefined });
  return sincronizarVentas();
}

/** Borra una venta rechazada (y devuelve su stock a la copia local). */
export async function descartarVenta(id: number) {
  await db.transaction("rw", db.outbox, db.productos, async () => {
    const v = await db.outbox.get(id);
    if (!v || v.estado === "sincronizada") return;
    await ajustarStockLocal(v.venta.items, 1);
    await db.outbox.delete(id);
  });
}

/** ¿Hay ventas de esta empresa sin subir en este equipo? (para frenar el cierre de caja). */
export async function hayVentasSinSubir(): Promise<number> {
  const { pendientes, conError } = await contar();
  return pendientes + conError;
}
