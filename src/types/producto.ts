import type { Moneda } from "@/lib/currency";
import type { UnidadContenido } from "@/lib/rubro";

export type ProductoDTO = {
  id: number;
  nombre: string;
  marca: { nombre: string } | null;
  stockActual: number;
  monedaPrecio: Moneda;
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
};

export type ProductosSummary = {
  stockCostoArs: number;
  stockVentaArs: number;
  gananciaPotencialArs: number;
};

export type ProductosResponse = {
  items: ProductoDTO[];
  total: number;
  page: number;
  pageSize: number;
  summary: ProductosSummary;
};

export type ProductoBusquedaDTO = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  monedaPrecio: Moneda;
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
  contenido: number | null;
  unidadContenido: UnidadContenido | null;
  marca: { nombre: string } | null;
  /** Ropa (RV-2): modelo al que pertenece esta combinación talle × color. */
  modeloId?: number | null;
  modeloNombre?: string | null;
  talle?: string | null;
  color?: string | null;
};