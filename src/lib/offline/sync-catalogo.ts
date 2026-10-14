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

  await db.transaction("rw", db.productos, db.clientes, db.cuentas, db.meta, async () => {
    if (data.completo) await Promise.all([db.productos.clear(), db.clientes.clear()]);
    await db.cuentas.clear(); // las cuentas siempre vienen completas

    await db.productos.bulkDelete(bajas);
    await db.productos.bulkPut(
      activos.map(({ activo, ...p }) => {
        void activo;
        return { ...p, busqueda: normalizar(`${p.nombre} ${p.marcaNombre ?? ""} ${p.codigoBarras ?? ""}`) };
      })
    );
    await db.clientes.bulkPut(
      data.clientes.map((c) => ({
        ...c,
        busqueda: normalizar(`${c.nombre} ${c.apellido ?? ""} ${c.telefono ?? ""}`),
      }))
    );
    await db.cuentas.bulkPut(data.cuentas.map((c) => ({ ...c, activa: true as const })));

    await db.meta.bulkPut([
      { clave: "sincronizadoEn", valor: data.sincronizadoEn },
      { clave: "alcance", valor: data.alcance },
      { clave: "ultimaSync", valor: Date.now() },
      { clave: "config", valor: { cotizacionUSD: data.cotizacionUSD, usaCotizacionUSD: data.usaCotizacionUSD } },
      ...(data.completo ? [{ clave: "ultimaCompleta", valor: Date.now() }] : []),
    ]);
  });
}

/** Borra la copia local (llamar al cerrar sesión: es información del negocio). */
export async function limpiarCopiaLocal() {
  await db.transaction("rw", db.productos, db.clientes, db.cuentas, db.meta, () =>
    Promise.all([db.productos.clear(), db.clientes.clear(), db.cuentas.clear(), db.meta.clear()])
  );
}