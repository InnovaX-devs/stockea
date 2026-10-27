"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Shirt, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { ProductoBusquedaDTO } from "@/types/producto";
import { formatCurrency, toArs } from "@/lib/currency";
import { useVenta } from "@/components/ventas/venta-context";
import { buscarProductos } from "@/lib/offline/buscar";
import { useRubro } from "@/components/layout/rubro-context";
import { contenidoVisible } from "@/lib/rubro";
import { agruparResultados, type FilaBusqueda } from "@/lib/agrupar-variantes";
import { SelectorVariante } from "@/components/ventas/selector-variante";
import { ProductoFormModal } from "@/components/productos/producto-form-modal";
import { useRol } from "@/components/layout/rol-context";
import { puedeCrearProductos } from "@/lib/permisos";
import { valoresInicialesDesdeBusqueda, type ValoresInicialesProducto } from "@/lib/producto-rapido";


const UMBRAL_LECTORA_MS = 40;

type Props = { onSeleccionar: (producto: ProductoBusquedaDTO) => void };

export function BuscadorProducto({ onSeleccionar }: Props) {
  const { cotizacionUSD, usaCotizacionUSD } = useVenta();
  const { textos, rubro } = useRubro();
  // Crear un producto desde acá (#105): solo quien puede administrar productos (hoy, no el empleado).
  const puedeCrear = puedeCrearProductos(useRol());
  const [nuevoProducto, setNuevoProducto] = useState<ValoresInicialesProducto | null>(null);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoBusquedaDTO[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const ultimaTecla = useRef<number>(0);
  const esLectora = useRef(false);
  const debouncedQuery = useDebounce(query, 250);
  // Ropa (RV-5): las combinaciones de un modelo van en una sola fila; al
  // elegirla se abre la grilla de talle × color.
  const filas = useMemo(() => agruparResultados(resultados), [resultados]);
  const [modeloAbierto, setModeloAbierto] = useState<{ modeloId: number; nombre: string } | null>(null);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResultados([]);
      return;
    }
    const controller = new AbortController();
    setCargando(true);

    buscarProductos(debouncedQuery, controller.signal)
      .then(({ items }) => {
        setResultados(items);
        setActiveIndex(-1);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setCargando(false));

    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  function seleccionar(p: ProductoBusquedaDTO) {
    onSeleccionar(p);
    setQuery("");
    setResultados([]);
    setAbierto(false);
    setModeloAbierto(null);
  }

  function elegirFila(fila: FilaBusqueda) {
    if (fila.tipo === "producto") return seleccionar(fila.producto);
    setAbierto(false);
    setModeloAbierto({ modeloId: fila.modeloId, nombre: fila.nombre });
  }

  function abrirNuevoProducto(textoBuscado: string) {
    if (!navigator.onLine) {
      toast.error("Crear un producto requiere conexión a internet.");
      return;
    }
    setAbierto(false);
    setNuevoProducto(valoresInicialesDesdeBusqueda(textoBuscado));
  }

  async function buscarPorCodigoExacto(codigo: string) {
    setCargando(true);
    try {
      const { items } = await buscarProductos(codigo);
      const match = items.find((p) => p.codigoBarras === codigo);
      if (match) {
        seleccionar(match);
      } else {
        setResultados(items);
        setAbierto(true);
      }
    } finally {
      setCargando(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const ahora = Date.now();
    if (ahora - ultimaTecla.current < UMBRAL_LECTORA_MS) esLectora.current = true;
    ultimaTecla.current = ahora;
    setQuery(e.target.value);
    setAbierto(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (esLectora.current && query.trim()) {
        buscarPorCodigoExacto(query.trim());
        esLectora.current = false;
        return;
      }
      if (abierto && activeIndex >= 0 && filas[activeIndex]) {
        elegirFila(filas[activeIndex]);
        return;
      }
      if (query.trim()) {
        buscarPorCodigoExacto(query.trim());
      }
      return;
    }
    if (!abierto || filas.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  return (
    <div ref={contenedorRef} className="relative flex-1 min-w-[280px]">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={handleChange}
            onFocus={() => setAbierto(true)}
            onKeyDown={handleKeyDown}
            placeholder={textos.buscarProductoVenta}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-9 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none"
          />
          {cargando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-dim" />}
        </div>
        {puedeCrear && (
          <button
            type="button"
            onClick={() => abrirNuevoProducto(query)}
            className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            <Plus size={14} /> Nuevo producto
          </button>
        )}
      </div>

      {modeloAbierto && (
        <SelectorVariante
          modeloId={modeloAbierto.modeloId}
          nombre={modeloAbierto.nombre}
          cotizacionUSD={cotizacionUSD}
          onElegir={seleccionar}
          onCerrar={() => setModeloAbierto(null)}
        />
      )}

      {abierto && (query.trim() || resultados.length > 0) && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
          {resultados.length === 0 && !cargando && (
            <div className="px-3 py-2 text-sm text-text-dim">Sin resultados para &quot;{query}&quot;</div>
          )}
          {puedeCrear && resultados.length === 0 && !cargando && query.trim() !== "" && query.trim() === debouncedQuery.trim() && (
            <button
              type="button"
              onClick={() => abrirNuevoProducto(query)}
              className="flex w-full cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-surface-hover"
            >
              <Plus size={14} className="shrink-0" />
              <span className="truncate">Crear producto &quot;{query.trim()}&quot;</span>
            </button>
          )}
          {filas.map((fila, i) =>
            fila.tipo === "producto" ? (
              <button
                key={`p-${fila.producto.id}`}
                type="button"
                onClick={() => elegirFila(fila)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === activeIndex ? "bg-surface-hover" : ""}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-text">
                    {fila.producto.nombre}
                    {fila.producto.marca && <span className="ml-1 text-text-dim">· {fila.producto.marca.nombre}</span>}
                  </span>
                  <span className="truncate text-xs text-text-dim">
                    {[
                      contenidoVisible(rubro, fila.producto.contenido, fila.producto.unidadContenido),
                      fila.producto.controlaStock === false ? null : `Stock: ${fila.producto.stockActual}`,
                      fila.producto.codigoBarras,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-text">
                  {fila.producto.precioAbierto
                    ? "Precio abierto"
                    : formatCurrency(toArs(fila.producto.precioVenta, fila.producto.monedaPrecio, cotizacionUSD), "ARS")}
                </span>
              </button>
            ) : (
              <button
                key={`m-${fila.modeloId}`}
                type="button"
                onClick={() => elegirFila(fila)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === activeIndex ? "bg-surface-hover" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Shirt size={15} className="shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-text">
                      {fila.nombre}
                      {fila.marca && <span className="ml-1 text-text-dim">· {fila.marca}</span>}
                    </span>
                    <span className="truncate text-xs text-text-dim">
                      Elegir talle y color · Stock: {fila.stock}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text">
                  {(() => {
                    const precios = fila.variantes.map((v) => toArs(v.precioVenta, v.monedaPrecio, cotizacionUSD));
                    const min = Math.min(...precios);
                    return `${Math.max(...precios) > min ? "desde " : ""}${formatCurrency(min, "ARS")}`;
                  })()}
                  <ChevronRight size={14} className="text-text-dim" />
                </span>
              </button>
            )
          )}
        </div>
      )}

      {puedeCrear && (
        <ProductoFormModal
          isOpen={nuevoProducto != null}
          onClose={() => setNuevoProducto(null)}
          onSuccess={() => {}}
          valoresIniciales={nuevoProducto}
          usaCotizacionUSD={usaCotizacionUSD}
          // Al guardar, el producto va directo a la venta (cantidad 1) y lo que ya estaba cargado no se toca.
          onCreado={seleccionar}
        />
      )}
    </div>
  );
}
