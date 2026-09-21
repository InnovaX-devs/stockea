"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, X, Loader2 } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { buscarClientesRapido, type ClienteBusquedaResult } from "@/lib/clientes-busqueda";
import ClienteModal from "@/components/clientes/ClienteModal";
import type { ClienteBasico } from "@/components/clientes/ClienteForm";
import { useVenta } from "./venta-context";

export function BuscadorCliente() {
  const { cliente, setCliente } = useVenta();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ClienteBusquedaResult[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setCargando(true);

    buscarClientesRapido(debouncedQuery)
      .then((items) => {
        if (!cancelado) {
          setResultados(items);
          setActiveIndex(-1);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
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

  function seleccionar(c: ClienteBusquedaResult) {
    setCliente(c);
    setQuery("");
    setResultados([]);
    setAbierto(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!abierto || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      seleccionar(resultados[activeIndex]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  function handleClienteCreado(nuevo: ClienteBasico) {
    seleccionar({
      id: nuevo.id,
      nombre: nuevo.nombre,
      apellido: nuevo.apellido,
      telefono: null, // ClienteBasico no expone teléfono; se completa al buscar de nuevo
      esMayorista: nuevo.esMayorista,
    });
    setMostrarAlta(false);
  }

  if (cliente) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <span className="font-medium text-text">
          {cliente.nombre} {cliente.apellido ?? ""}
        </span>
        {"telefono" in cliente && cliente.telefono && (
          <span className="text-text-dim">· {cliente.telefono}</span>
        )}
        <button
          type="button"
          onClick={() => setCliente(null)}
          className="ml-1 text-text-dim hover:text-danger"
          aria-label="Quitar cliente"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={contenedorRef} className="relative flex-1 min-w-[220px]">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar cliente..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none"
          />
          {cargando && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-dim" />
          )}
        </div>
        <button
          type="button"
          onClick={() => setMostrarAlta(true)}
          className="flex shrink-0 items-center cursor-pointer gap-1 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
        >
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {abierto && (query.trim() || resultados.length > 0) && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
          {resultados.length === 0 && !cargando && (
            <div className="px-3 py-2 text-sm text-text-dim">Sin resultados para &quot;{query}&quot;</div>
          )}
          {resultados.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => seleccionar(c)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                i === activeIndex ? "bg-surface-hover" : ""
              }`}
            >
              <span className="flex w-full flex-wrap items-center gap-x-2 font-medium text-text">
                <span className="truncate">{c.nombre} {c.apellido ?? ""}</span>
                {c.esMayorista && (
                  <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    MAYORISTA
                  </span>
                )}
              </span>
              {c.telefono && <span className="text-xs text-text-dim">{c.telefono}</span>}
            </button>
          ))}
        </div>
      )}

      {mostrarAlta && <ClienteModal onSaved={handleClienteCreado} onClose={() => setMostrarAlta(false)} />}
    </div>
  );
}