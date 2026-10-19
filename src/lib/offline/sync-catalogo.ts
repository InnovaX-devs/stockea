import { db, leerMeta, normalizar, type CuentaLocal, type ProductoLocal } from "./db";

/** Cada cuánto se baja una copia completa (limpia clientes borrados, marcas renombradas, etc.). */
const COMPLETA_CADA_MS = 24 * 60 * 60 * 1000;

type RespuestaSync = {
  sincronizadoEn: string;
  completo: boolean;
  alcance: string;
  productos: (Omit<ProductoLocal, "busqueda"> & { activo: boolean })[];
  clientes: { id: number; nombre: string; apellido: string | null; telefono: string | null; esMayorista: boolean }[];
  cuentas: Omit<CuentaLocal, "activa">[];
  cotizacionUSD: number;
  usaCotizacionUSD: boolean;
};

let enCurso: Promise<void> | null = null;

/** Sincroniza (incremental si se puede). Si ya hay una en curso, devuelve esa. */
export function sincronizarCatalogo(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return Promise.resolve();
  if (!enCurso) enCurso = ejecutar().finally(() => (enCurso = null));
  return enCurso;
}

async function ejecutar() {
  const [desde, alcance, ultimaCompleta] = await Promise.all([
    leerMeta<string>("sincronizadoEn"),
    leerMeta<string>("alcance"),
    leerMeta<number>("ultimaCompleta"),
  ]);
  const pedirCompleta = !desde || !alcance || !ultimaCompleta || Date.now() - ultimaCompleta > COMPLETA_CADA_MS;

  const params = new URLSearchParams();
  if (!pedirCompleta) {
    params.set("desde", desde);
    params.set("alcance", alcance);
  }
  const res = await fetch(`/api/sync/catalogo?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sincronización: HTTP ${res.status}`);
  const data: RespuestaSync = await res.json();

  const activos = data.productos.filter((p) => p.activo);
  const bajas = data.productos.filter((p) => !p.activo).map((p) => p.id);

  await db.transaction("rw", db.productos, db.clientes, db.cuentas, db.meta, db.outbox, async () => {
    if (data.completo) await Promise.all([db.productos.clear(), db.clientes.clear()]);
    await db.cuentas.clear(); // las cuentas siempre vienen completas

    await db.productos.bulkDelete(bajas);
    await db.productos.bulkPut(
      activos.map(({ activo, ...p }) => {
        void activo;
        return {
          ...p,
          // Respuestas de un servidor viejo (sin RV-5) no traen estos campos.
          modeloId: p.modeloId ?? null,
          modeloNombre: p.modeloNombre ?? null,
          talle: p.talle ?? null,
          color: p.color ?? null,
          busqueda: normalizar(`${p.nombre} ${p.marcaNombre ?? ""} ${p.codigoBarras ?? ""}`),
        };
      })
    );
    await db.clientes.bulkPut(
      data.clientes.map((c) => ({
        ...c,
        busqueda: normalizar(`${c.nombre} ${c.apellido ?? ""} ${c.telefono ?? ""}`),
      }))
    );
    await db.cuentas.bulkPut(data.cuentas.map((c) => ({ ...c, activa: true as const })));

    // Las ventas hechas sin conexión que todavía no subieron (o que el servidor
    // rechazó y siguen a la vista) ya sacaron mercadería del mostrador, pero el
    // servidor no las conoce: se vuelven a descontar para que el stock local no "reviva".
    // OJO: solo en los productos que se acaban de pisar con el stock del
    // servidor. Los demás ya tienen el descuento hecho (al encolar o en una
    // sincronización anterior): descontarlos otra vez los haría bajar en cada
    // sincronización incremental (cada 3 minutos) mientras la venta siga en la cola.
    const pisados = data.completo ? null : new Set(activos.map((p) => p.id));
    const sinSubir = await db.outbox.where("estado").anyOf("pendiente", "error").toArray();
    const alcanceActual = Number(data.alcance.split(":")[0]);
    const descontar = new Map<number, number>();
    for (const v of sinSubir) {
      if (v.empresaId !== alcanceActual) continue;
      for (const i of v.venta.items) {
        if (pisados && !pisados.has(i.productoId)) continue;
        descontar.set(i.productoId, (descontar.get(i.productoId) ?? 0) + i.cantidad);
      }
    }
    for (const [id, cantidad] of descontar) {
      await db.productos.where("id").equals(id).modify((p) => {
        p.stockActual -= cantidad;
      });
    }

    await db.meta.bulkPut([
      { clave: "sincronizadoEn", valor: data.sincronizadoEn },
      { clave: "alcance", valor: data.alcance },
      { clave: "ultimaSync", valor: Date.now() },
      { clave: "config", valor: { cotizacionUSD: data.cotizacionUSD, usaCotizacionUSD: data.usaCotizacionUSD } },
      ...(data.completo ? [{ clave: "ultimaCompleta", valor: Date.now() }] : []),
    ]);
  });
}

/**
 * Borra la copia local (llamar al cerrar sesión: es información del negocio).
 * NO toca la cola de ventas sin conexión (`outbox`): son ventas reales que
 * todavía no subieron y no se pueden perder (issue #41).
 */
export async function limpiarCopiaLocal() {
  await db.transaction("rw", db.productos, db.clientes, db.cuentas, db.meta, () =>
    Promise.all([db.productos.clear(), db.clientes.clear(), db.cuentas.clear(), db.meta.clear()])
  );
}