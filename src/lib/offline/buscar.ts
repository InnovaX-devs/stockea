import type { ProductoBusquedaDTO } from "@/types/producto";
import type { CuentaDTO } from "@/types/cuenta";
import { buscarClientesRapido, type ClienteBusquedaResult } from "@/lib/clientes-busqueda";
import { db, leerMeta, normalizar, type ProductoLocal } from "./db";

const MAX_RESULTADOS = 10;
/** Productos: se traen más porque las combinaciones de un modelo se agrupan en una fila (ver agrupar-variantes.ts). */
const MAX_PRODUCTOS = 50;

function aDTO(p: ProductoLocal): ProductoBusquedaDTO {
  return {
    id: p.id,
    nombre: p.nombre,
    codigoBarras: p.codigoBarras,
    stockActual: p.stockActual,
    monedaPrecio: p.monedaPrecio,
    precioCosto: 0, // la copia local no guarda costos
    precioVenta: p.precioVenta,
    precioMayorista: p.precioMayorista,
    contenido: p.contenido ?? null,
    unidadContenido: p.unidadContenido ?? null,
    marca: p.marcaNombre ? { nombre: p.marcaNombre } : null,
    modeloId: p.modeloId ?? null,
    modeloNombre: p.modeloNombre ?? null,
    talle: p.talle ?? null,
    color: p.color ?? null,
  };
}

export async function buscarProductosLocal(q: string): Promise<ProductoBusquedaDTO[]> {
  const texto = q.trim();
  const n = normalizar(texto);
  if (!n) return [];
  const [exacto, coincidencias] = await Promise.all([
    db.productos.where("codigoBarras").equals(texto).first(),
    db.productos.filter((p) => p.busqueda.includes(n)).sortBy("nombre"),
  ]);
  const lista = exacto ? [exacto, ...coincidencias.filter((p) => p.id !== exacto.id)] : coincidencias;
  return lista.slice(0, MAX_PRODUCTOS).map(aDTO);
}

/** Todas las combinaciones (talle × color) de un modelo en la copia local. */
export async function buscarVariantesLocal(modeloId: number): Promise<ProductoBusquedaDTO[]> {
  return (await db.productos.where("modeloId").equals(modeloId).sortBy("nombre")).map(aDTO);
}

/** Combinaciones de un modelo: red primero, copia local si no hay red o falla. */
export async function buscarVariantes(modeloId: number, signal?: AbortSignal) {
  if (navigator.onLine) {
    try {
      const res = await fetch(`/api/productos/buscar?modeloId=${modeloId}`, { signal });
      if (res.ok) return { items: ((await res.json()).items ?? []) as ProductoBusquedaDTO[], local: false };
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }
  return { items: await buscarVariantesLocal(modeloId), local: true };
}

export async function buscarClientesLocal(q: string): Promise<ClienteBusquedaResult[]> {
  const n = normalizar(q.trim());
  if (!n) return [];
  const lista = await db.clientes.filter((c) => c.busqueda.includes(n)).sortBy("nombre");
  return lista.slice(0, MAX_RESULTADOS).map(({ busqueda, ...c }) => {
    void busqueda;
    return c;
  });
}

/** Buscador de productos: red primero, copia local si no hay red o falla. */
export async function buscarProductos(q: string, signal?: AbortSignal) {
  if (navigator.onLine) {
    try {
      const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(q)}&agrupar=1`, { signal });
      if (res.ok) return { items: ((await res.json()).items ?? []) as ProductoBusquedaDTO[], local: false };
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }
  return { items: await buscarProductosLocal(q), local: true };
}

export async function buscarClientes(q: string) {
  if (navigator.onLine) {
    try {
      return { items: await buscarClientesRapido(q), local: false };
    } catch {
      /* sin red o servidor caído: copia local */
    }
  }
  return { items: await buscarClientesLocal(q), local: true };
}

type CuentaBasica = Pick<CuentaDTO, "id" | "nombre" | "tipo" | "favorita" | "activa" | "color">;

export async function cargarCuentas(): Promise<CuentaBasica[]> {
  if (navigator.onLine) {
    try {
      const res = await fetch("/api/cuentas");
      if (res.ok) return (await res.json()).items ?? [];
    } catch {
      /* copia local */
    }
  }
  return db.cuentas.toArray();
}

export async function cargarConfig(): Promise<{ cotizacionUSD: number; usaCotizacionUSD: boolean }> {
  if (navigator.onLine) {
    try {
      const res = await fetch("/api/configuracion");
      if (res.ok) {
        const d = await res.json();
        return { cotizacionUSD: d.cotizacionUSD ?? 0, usaCotizacionUSD: d.usaCotizacionUSD ?? false };
      }
    } catch {
      /* copia local */
    }
  }
  return (await leerMeta<{ cotizacionUSD: number; usaCotizacionUSD: boolean }>("config")) ?? {
    cotizacionUSD: 0,
    usaCotizacionUSD: false,
  };
}