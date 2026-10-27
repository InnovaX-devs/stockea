import type { ProductoBusquedaDTO } from "@/types/producto";
import type { UnidadContenido } from "@/lib/rubro";

/**
 * Alta rápida de producto desde Nueva compra / Nueva venta (#105).
 * Helpers compartidos por las dos pantallas.
 */

/** Lo que se precarga en el formulario de producto al crearlo desde el buscador. */
export type ValoresInicialesProducto = { nombre?: string; codigoBarras?: string };

/**
 * ¿Lo buscado parece un código de barras (solo números, como lo que tira una lectora)?
 * Si sí, se precarga en "Código de barras" y no en el nombre.
 */
export function pareceCodigoDeBarras(texto: string): boolean {
  return /^\d+$/.test(texto.trim());
}

/** Valores a precargar en el formulario a partir de lo que se buscó. */
export function valoresInicialesDesdeBusqueda(busqueda: string): ValoresInicialesProducto {
  const texto = busqueda.trim();
  return pareceCodigoDeBarras(texto) ? { codigoBarras: texto } : { nombre: texto };
}

/** Producto tal como lo devuelve POST /api/productos (los campos que usamos). */
type ProductoCreadoRespuesta = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  monedaPrecio: "ARS" | "USD";
  precioCosto: number;
  precioVenta: number;
  precioMayorista: number | null;
  contenido: number | null;
  unidadContenido: UnidadContenido | null;
  precioAbierto?: boolean;
  controlaStock?: boolean;
};

/** Arma el mismo objeto que devuelve el buscador, para sumarlo directo a la compra o la venta. */
export function productoCreadoADTO(
  creado: ProductoCreadoRespuesta,
  marcaNombre: string | null
): ProductoBusquedaDTO {
  return {
    id: creado.id,
    nombre: creado.nombre,
    codigoBarras: creado.codigoBarras ?? null,
    stockActual: creado.stockActual,
    monedaPrecio: creado.monedaPrecio,
    precioCosto: creado.precioCosto,
    precioVenta: creado.precioVenta,
    precioMayorista: creado.precioMayorista ?? null,
    contenido: creado.contenido ?? null,
    unidadContenido: creado.unidadContenido ?? null,
    precioAbierto: creado.precioAbierto ?? false,
    controlaStock: creado.controlaStock ?? true,
    marca: marcaNombre ? { nombre: marcaNombre } : null,
    modeloId: null,
    modeloNombre: null,
    talle: null,
    color: null,
  };
}
