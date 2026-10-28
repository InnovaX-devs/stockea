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
  /** Precio abierto (verdura, fiambre…): el monto se carga al vender. Ausente = precio fijo. */
  precioAbierto?: boolean;
  /** false = no descuenta ni suma stock. Ausente = controla stock. */
  controlaStock?: boolean;
  /** Ropa (RV-2): modelo al que pertenece esta combinación talle × color. */
  modeloId?: number | null;
  modeloNombre?: string | null;
  talle?: string | null;
  color?: string | null;
  /** Foto del producto (Vercel Blob), para mostrar una miniatura al vender. Ausente/null = sin foto. */
  fotoUrl?: string | null;
  /**
   * Promoción (#114): lo que incluye. En las promos, `stockActual` es cuántas
   * se pueden armar con el stock de los componentes.
   */
  esPromocion?: boolean;
  componentes?: ComponentePromocionDTO[];
};

/** Un producto incluido en una promoción, con su nombre para el carrito y el ticket. */
export type ComponentePromocionDTO = { productoId: number; cantidad: number; nombre: string };