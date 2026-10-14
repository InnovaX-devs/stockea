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

type Meta = { clave: string; valor: unknown };

class StockeaDB extends Dexie {
  productos!: Table<ProductoLocal, number>;
  clientes!: Table<ClienteLocal, number>;
  cuentas!: Table<CuentaLocal, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super("stockea-offline");
    this.version(1).stores({
      productos: "id, codigoBarras",
      clientes: "id, telefono",
      cuentas: "id",
      meta: "clave",
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