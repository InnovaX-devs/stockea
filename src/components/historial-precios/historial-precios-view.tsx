"use client";

import { useEffect, useState } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { HistorialFiltros, type HistorialFiltrosState } from "@/components/historial-precios/historial-filtros";
import { HistorialTabla } from "@/components/historial-precios/historial-tabla";
import type { HistorialPrecioResponse } from "@/types/historial-precio";

const PAGE_SIZE = 50;

const FILTROS_INICIALES: HistorialFiltrosState = {
  producto: "",
  campo: "",
  origen: "",
  fechaDesde: "",
  fechaHasta: "",
};

export function HistorialPreciosView() {
  const [filtros, setFiltros] = useState<HistorialFiltrosState>(FILTROS_INICIALES);
  const debouncedProducto = useDebounce(filtros.producto, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistorialPrecioResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedProducto, filtros.campo, filtros.origen, filtros.fechaDesde, filtros.fechaHasta]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchHistorial() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (debouncedProducto) params.set("producto", debouncedProducto);
        if (filtros.campo) params.set("campo", filtros.campo);
        if (filtros.origen) params.set("origen", filtros.origen);
        if (filtros.fechaDesde) params.set("fechaDesde", filtros.fechaDesde);
        if (filtros.fechaHasta) params.set("fechaHasta", filtros.fechaHasta);

        const res = await fetch(`/api/historial-precios?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("No se pudo cargar el historial de precios.");
        const json: HistorialPrecioResponse = await res.json();
        setData(json);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("No se pudo cargar el historial de precios.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistorial();
    return () => controller.abort();
  }, [debouncedProducto, filtros.campo, filtros.origen, filtros.fechaDesde, filtros.fechaHasta, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5 sm:space-y-6">
      <HistorialFiltros filtros={filtros} onChange={setFiltros} />

      {error && (
        <div role="alert" className="rounded-lg border border-[#f3b4b4] bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <HistorialTabla items={data?.items ?? []} isLoading={isLoading && !data} />

      {(data?.total ?? 0) > 0 && (
        <div className="flex flex-col gap-2 text-sm text-text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>
            {data?.total} registro{data?.total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}