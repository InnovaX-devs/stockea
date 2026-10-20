"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, PackageX, Shirt, ChevronDown } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { ProductoBusquedaDTO } from "@/types/producto";
import { formatCurrency, toUsd, toArs } from "@/lib/currency";
import { buscarProductos, buscarVariantes, cargarConfig } from "@/lib/offline/buscar";
import { agruparResultados } from "@/lib/agrupar-variantes";
import { GrillaVariantes } from "@/components/ventas/grilla-variantes";
import { useRubro } from "@/components/layout/rubro-context";
import { contenidoVisible } from "@/lib/rubro";

interface Props {
  onClose: () => void;
}

function Iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Ropa (RV-5): un modelo en "Consultar precio", con su grilla de talle × color desplegable. */
function ModeloConsulta({
  modeloId,
  nombre,
  marca,
  stock,
  cotizacionUSD,
}: {
  modeloId: number;
  nombre: string;
  marca: string | null;
  stock: number;
  cotizacionUSD: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [variantes, setVariantes] = useState<ProductoBusquedaDTO[] | null>(null);

  function alternar() {
    setAbierto((a) => !a);
    if (variantes == null) {
      buscarVariantes(modeloId)
        .then((r) => setVariantes(r.items))
        .catch(() => setVariantes([]));
    }
  }

  return (
    <div className="rounded-xl p-3 hover:bg-surface-hover">
      <button type="button" onClick={alternar} className="flex w-full items-center gap-3 text-left" aria-expanded={abierto}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shirt size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text">
            {nombre}
            {marca && <span className="ml-1 font-normal text-text-dim">· {marca}</span>}
          </p>
          <p className="text-xs text-text-dim">Ver talles, colores y precios · Stock total: {stock}</p>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-text-dim transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="mt-3">
          {variantes == null ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-text-dim" />
          ) : (
            <GrillaVariantes variantes={variantes} cotizacionUSD={cotizacionUSD} />
          )}
        </div>
      )}
    </div>
  );
}

export function ModalConsultarPrecio({ onClose }: Props) {
  const { rubro } = useRubro();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoBusquedaDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  const [cotizacionUSD, setCotizacionUSD] = useState(0);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);
  const [desdeCopia, setDesdeCopia] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 250);
  // Los de precio abierto (verdura, fiambre…) no tienen un precio para consultar.
  const filas = useMemo(() => agruparResultados(resultados.filter((r) => !r.precioAbierto), 20), [resultados]);

  useEffect(() => {
    cargarConfig().then((c) => {
      setCotizacionUSD(c.cotizacionUSD);
      setUsaCotizacionUSD(c.usaCotizacionUSD);
    });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResultados([]);
      setDesdeCopia(false);
      return;
    }
    const controller = new AbortController();
    setCargando(true);

    buscarProductos(debouncedQuery, controller.signal)
      .then(({ items, local }) => {
        setResultados(items);
        setDesdeCopia(local);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setCargando(false));

    return () => controller.abort();
  }, [debouncedQuery]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-8 sm:pt-20 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Search size={18} className="text-text-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar producto por nombre o marca..."
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-dim focus:outline-none"
          />
          {cargando && <Loader2 size={16} className="animate-spin text-text-dim" />}
          <button onClick={onClose} className="text-text-dim cursor-pointer hover:text-text" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-text-dim">
              <Search size={28} className="opacity-40" />
              Escribí para buscar un producto
            </div>
          )}

          {query.trim() && resultados.length === 0 && !cargando && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-text-dim">
              <PackageX size={28} className="opacity-40" />
              Sin resultados para &quot;{query}&quot;
            </div>
          )}

          {desdeCopia && resultados.length > 0 && (
            <p className="px-3 pb-2 text-xs text-warning">
              Sin conexión: precios y stock de la última sincronización.
            </p>
          )}

          <div className="divide-y divide-border">
            {filas.map((fila, i) => {
              if (fila.tipo === "modelo") {
                return (
                  <ModeloConsulta
                    key={`m-${fila.modeloId}`}
                    modeloId={fila.modeloId}
                    nombre={fila.nombre}
                    marca={fila.marca}
                    stock={fila.stock}
                    cotizacionUSD={cotizacionUSD}
                  />
                );
              }
              const p = fila.producto;
              const minoristaUsd = toUsd(p.precioVenta, p.monedaPrecio, cotizacionUSD);
              const minoristaArs = toArs(p.precioVenta, p.monedaPrecio, cotizacionUSD);
              const mayoristaUsd = p.precioMayorista != null ? toUsd(p.precioMayorista, p.monedaPrecio, cotizacionUSD) : null;
              const mayoristaArs = p.precioMayorista != null ? toArs(p.precioMayorista, p.monedaPrecio, cotizacionUSD) : null;
              const conStock = p.stockActual > 0;

              return (
                <div
                  key={p.id}
                  className="animate-in fade-in slide-in-from-top-1 flex gap-3 rounded-xl p-3 duration-200 hover:bg-surface-hover"
                  style={{ animationDelay: `${Math.min(i, 6) * 25}ms`, animationFillMode: "backwards" }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                    {Iniciales(p.nombre)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-text">
                        {p.nombre}
                        {p.marca && <span className="ml-1 font-normal text-text-dim">· {p.marca.nombre}</span>}
                        {contenidoVisible(rubro, p.contenido, p.unidadContenido) && (
                          <span className="ml-1 font-normal text-text-dim">· {contenidoVisible(rubro, p.contenido, p.unidadContenido)}</span>
                        )}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          conStock ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                        }`}
                      >
                        {conStock ? `${p.stockActual} en stock` : "Sin stock"}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 xs:grid-cols-2 sm:gap-3">
                      <div className="rounded-lg bg-surface-hover/50 p-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                          Minorista
                        </span>
                        <p className="text-sm font-semibold text-text">
                          {formatCurrency(usaCotizacionUSD ? minoristaUsd : minoristaArs, usaCotizacionUSD ? "USD" : "ARS")}
                        </p>
                        {usaCotizacionUSD && (
                          <p className="text-xs text-text-dim">
                            {cotizacionUSD > 0 ? formatCurrency(minoristaUsd * cotizacionUSD, "ARS") : "Sin cotización"}
                          </p>
                        )}
                      </div>
                      <div
                        className={`rounded-lg p-2 ${
                          mayoristaUsd != null ? "bg-primary/5 ring-1 ring-primary/20" : "bg-surface-hover/50"
                        }`}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                          Mayorista
                        </span>
                        {mayoristaUsd != null ? (
                          <>
                            <p className="text-sm font-semibold text-primary">
                              {formatCurrency(usaCotizacionUSD ? mayoristaUsd : mayoristaArs!, usaCotizacionUSD ? "USD" : "ARS")}
                            </p>
                            {usaCotizacionUSD && (
                              <p className="text-xs text-text-dim">
                                {cotizacionUSD > 0
                                  ? formatCurrency(mayoristaUsd * cotizacionUSD, "ARS")
                                  : "Sin cotización"}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-text-dim">No configurado</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}