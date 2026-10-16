import Dexie, { type Table } from "dexie";
import type { Moneda } from "@/lib/currency";

/** Copia local del catálogo (issue #40). Sin precioCosto a propósito. */
export type ProductoLocal = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  monedaPrecio: Moneda;
  precioVenta: number;
  precioMayorista: number | null;
  contenidoMl: number | null;
  marcaNombre: string | null;
  /** nombre + marca + código, en minúsculas y sin acentos, para buscar. */
  busqueda: string;
};

export type ClienteLocal = {
  id: number;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  esMayorista: boolean;
  busqueda: string;
};

export type CuentaLocal = {
  id: number;
  nombre: string;
  tipo: "EFECTIVO_ARS" | "EFECTIVO_USD" | "BANCO_ARS" | "BANCO_USD";
  favorita: boolean;
  activa: true;
  color: string | null;
};

/** Lo que se manda al servidor por cada venta (ver POST /api/sync/ventas). */
export type PayloadVentaLocal = {
  clienteId: number | null;
  items: { productoId: number; cantidad: number; precioUnitarioArs: number; tipoPrecio: "MINORISTA" | "MAYORISTA" }[];
  pagos: { cuentaId: number; monto: number; montoUSD: number | null }[];
  descuentoMonto: number | null;
  descuentoPorcentaje: number | null;
  totalARS: number;
};

export type EstadoVentaLocal =
  /** Esperando subir (sin red, o todavía no le tocó). */
  | "pendiente"
  /** El servidor la rechazó: hay que mirarla (reintentar o descartar). */
  | "error"
  /** Ya subió y tiene su número; queda unas horas a la vista. */
  | "sincronizada";

/**
 * Venta hecha sin conexión, en la cola de salida (issue #41). `idCliente` es
 * el uuid que identifica la venta en el servidor: reenviarla es seguro.
 */
export type VentaLocal = {
  id?: number;
  idCliente: string;
  empresaId: number;
  sucursalId: number;
  /** Momento real de la venta (ms). */
  creadaEn: number;
  estado: EstadoVentaLocal;
  intentos: number;
  error?: string;
  /** Número que le dio el servidor (hasta entonces se muestra "Pendiente"). */
  numero?: number;
  sincronizadaEn?: number;
  stockNegativo?: boolean;
  productosStockNegativo?: string[];
  // Para mostrarla en la lista
  totalARS: number;
  clienteNombre: string | null;
  resumen: string;
  venta: PayloadVentaLocal;
};

type Meta = { clave: string; valor: unknown };

class StockeaDB extends Dexie {
  productos!: Table<ProductoLocal, number>;
  clientes!: Table<ClienteLocal, number>;
  cuentas!: Table<CuentaLocal, number>;
  meta!: Table<Meta, string>;
  outbox!: Table<VentaLocal, number>;

  constructor() {
    super("stockea-offline");
    this.version(1).stores({
      productos: "id, codigoBarras",
      clientes: "id, telefono",
      cuentas: "id",
      meta: "clave",
    });
    // v2 (issue #41): cola de ventas sin conexión. `&idCliente` = único: la
    // misma venta nunca entra dos veces.
    this.version(2).stores({
      productos: "id, codigoBarras",
      clientes: "id, telefono",
      cuentas: "id",
      meta: "clave",
      outbox: "++id, &idCliente, estado, empresaId",
    });
  }
}

export const db = new StockeaDB();

export async function leerMeta<T>(clave: string): Promise<T | undefined> {
  return (await db.meta.get(clave))?.valor as T | undefined;
}

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** "empresaId:sucursalId" (o "empresaId:todas") de la última sincronización del catálogo. */
export async function leerAlcance(): Promise<{ empresaId: number; sucursalId: number | null } | null> {
  const alcance = await leerMeta<string>("alcance");
  if (!alcance) return null;
  const [empresa, sucursal] = alcance.split(":");
  const empresaId = Number(empresa);
  if (!Number.isInteger(empresaId)) return null;
  const sucursalId = Number(sucursal);
  return { empresaId, sucursalId: Number.isInteger(sucursalId) ? sucursalId : null };
}

/**
 * Último estado de la caja que se vio CON conexión (abrir y cerrar caja
 * requieren conexión, así que sin red no hay forma de saberlo de nuevo).
 */
export type EstadoCajaLocal = { abierta: boolean; sucursalId: number | null; en: number };

export async function guardarEstadoCaja(abierta: boolean, sucursalId: number | null) {
  await db.meta.put({ clave: "caja", valor: { abierta, sucursalId, en: Date.now() } satisfies EstadoCajaLocal });
}

/** Igual que guardarEstadoCaja, para la sucursal en la que se está trabajando. */
export async function recordarEstadoCaja(abierta: boolean) {
  const alcance = await leerAlcance();
  await guardarEstadoCaja(abierta, alcance?.sucursalId ?? null);
}

/**
 * Le pide al navegador que NO borre esta base por falta de espacio (issue #42).
 * Sin esto, si el disco se llena, Chrome puede vaciar IndexedDB por su cuenta
 * y se perderían ventas que todavía no subieron. Con la app instalada Chrome
 * suele aceptarlo sin preguntar. No hace nada si ya está concedido o si el
 * navegador no lo soporta.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
