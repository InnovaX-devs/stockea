import type { Moneda } from "@/lib/currency";

export type ProductoBusqueda = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  precioVenta: number; // minorista
  precioMayorista: number | null;
  monedaPrecio: Moneda;
  stockActual: number;
  marca: { nombre: string } | null;
  contenido?: number | null;
  unidadContenido?: string | null;
};

export type ClienteBusqueda = {
  id: number;
  nombre: string;
  apellido: string | null;
  esMayorista: boolean;
};

export type ItemPresupuestoLocal = {
  key: string;
  productoId: number | null;
  descripcion: string;
  tipoPrecio: "MINORISTA" | "MAYORISTA";
  cantidad: number;
  precioUnitario: number; // siempre en ARS, ya convertido con toArs()
};