"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, RefreshCw, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatFechaAR } from "@/lib/timezone";

interface Compra {
  id: number;
  proveedor: { nombre: string } | null;
  cuenta: { nombre: string; tipo: string } | null;
  totalUSD: number;
  totalARS: number | null;
  confirmada: boolean;
  pagada: boolean;
  recibida: boolean;
  cancelada: boolean;
  fecha: string;
}

type FiltroKey = "todas" | "pendientes" | "confirmadas" | "canceladas";

const FILTROS: { key: FiltroKey; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pendientes", label: "Pendientes" },
  { key: "confirmadas", label: "Confirmadas" },
  { key: "canceladas", label: "Canceladas" },
];

const PAGE_SIZE = 15;
const DEBOUNCE_MS = 300;

function estadoDeCompra(compra: Compra): { label: string; className: string } {
  if (compra.cancelada) {
    return { label: "Cancelada", className: "bg-danger/10 text-danger" };
  }
  if (compra.confirmada) {
    return { label: "Confirmada", className: "bg-surface-hover text-primary" };
  }
  return { label: "Pendiente", className: "bg-surface-hover text-text-dim" };
}

export function ComprasListado() {
  const [filtro, setFiltro] = useState<FiltroKey>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [compras, setCompras] = useState<Compra[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accionandoId, setAccionandoId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsaCotizacionUSD(data?.usaCotizacionUSD ?? false))
      .catch(() => {});
  }, []);

  // Debounce del texto de búsqueda antes de mandarlo al servidor
  useEffect(() => {
    const timeout = setTimeout(() => setBusquedaDebounced(busqueda.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  const cargarCompras = (esRecarga = false) => {
    if (esRecarga) setRecargando(true);
    else setCargando(true);
    setError(null);

    const params = new URLSearchParams();
    if (filtro !== "todas") params.set("filtro", filtro);
    if (busquedaDebounced) params.set("q", busquedaDebounced);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    return fetch(`/api/compras?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar las compras");
        setCompras(data.items ?? []);
        setTotalRegistros(data.totalCount ?? 0);
        setTotalPaginas(data.totalPages ?? 1);
      })
      .catch((err) => setError(err.message || "Error al cargar las compras"))
      .finally(() => {
        setCargando(false);
        setRecargando(false);
      });
  };

  useEffect(() => {
    cargarCompras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, busquedaDebounced, page]);

  // Si cambia el filtro o la búsqueda, volvemos a la página 1
  useEffect(() => {
    setPage(1);
  }, [filtro, busquedaDebounced]);

  const ejecutarAccion = async (id: number, accion: "confirmar" | "cancelar") => {
    setAccionandoId(id);
    try {
      const res = await fetch(`/api/compras/${id}/${accion}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error al ${accion} la compra`);
      // Si era el único ítem de esta página y no es la primera, retrocedemos una página
      if (compras.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await cargarCompras(true);
      }
    } catch (err: any) {
      setError(err.message || `Error al ${accion} la compra`);
    } finally {
      setAccionandoId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Compras</h1>
        <Link
          href="/compras/nueva"
          className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2 text-sm text-white hover:opacity-90 sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Nueva Compra
        </Link>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor..."
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                className={cn(
                  "shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filtro === f.key
                    ? "bg-primary text-white"
                    : "border border-border bg-white text-text-dim hover:bg-surface-hover"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => cargarCompras(true)}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-text-dim hover:bg-surface-hover"
            aria-label="Actualizar"
          >
            <RefreshCw className={cn("h-4 w-4", recargando && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {cargando ? (
          <p className="p-8 text-center text-sm text-text-dim">Cargando...</p>
        ) : compras.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-dim">
            {busquedaDebounced
              ? "No hay compras que coincidan con la búsqueda."
              : "No hay compras para este filtro."}
          </p>
        ) : (
          <>
            {/* Desktop / tablet: tabla */}
            <div className="relative hidden overflow-x-auto md:block">
              {recargando && (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-16 backdrop-blur-[1px]">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-topbar">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((compra) => {
                    const estado = estadoDeCompra(compra);
                    const puedeAccionar = !compra.confirmada && !compra.cancelada;
                    const cargandoFila = accionandoId === compra.id;
                    return (
                      <tr key={compra.id} className="border-t border-border">
                        <td className="px-4 py-4 font-mono text-xs text-text-dim">#{compra.id}</td>
                        <td className="px-4 py-4 font-medium text-text">
                          {compra.proveedor?.nombre ?? "Sin especificar"}
                        </td>
                        <td className="px-4 py-4 text-text-dim">{compra.cuenta?.nombre ?? "—"}</td>
                        <td className="px-4 py-4 font-mono font-medium text-text">
                          {usaCotizacionUSD ? (
                            <>
                              USD {compra.totalUSD.toFixed(2)}
                              {compra.totalARS != null && (
                                <span className="ml-1 text-xs font-normal text-text-dim">
                                  (ARS {compra.totalARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })})
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {(compra.totalARS ?? compra.totalUSD).toLocaleString("es-AR", {
                                style: "currency",
                                currency: "ARS",
                                maximumFractionDigits: 0,
                              })}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              estado.className
                            )}
                          >
                            {estado.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-text-dim">
                          {formatFechaAR(new Date(compra.fecha))}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {puedeAccionar ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={cargandoFila}
                                onClick={() => ejecutarAccion(compra.id, "confirmar")}
                                aria-label="Confirmar compra"
                                title="Confirmar"
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {cargandoFila ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={cargandoFila}
                                onClick={() => ejecutarAccion(compra.id, "cancelar")}
                                aria-label="Cancelar compra"
                                title="Cancelar"
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-text-dim">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: tarjetas */}
            <div className="relative divide-y divide-border md:hidden">
              {recargando && (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-10 backdrop-blur-[1px]">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              {compras.map((compra) => {
                const estado = estadoDeCompra(compra);
                const puedeAccionar = !compra.confirmada && !compra.cancelada;
                const cargandoFila = accionandoId === compra.id;
                return (
                  <div key={compra.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-text-dim">#{compra.id}</p>
                        <p className="truncate font-medium text-text">
                          {compra.proveedor?.nombre ?? "Sin especificar"}
                        </p>
                        <p className="text-xs text-text-dim">{compra.cuenta?.nombre ?? "—"}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                          estado.className
                        )}
                      >
                        {estado.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono font-semibold text-text">
                        {usaCotizacionUSD ? (
                          <>
                            USD {compra.totalUSD.toFixed(2)}
                            {compra.totalARS != null && (
                              <span className="ml-1 text-xs font-normal text-text-dim">
                                (ARS {compra.totalARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })})
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {(compra.totalARS ?? compra.totalUSD).toLocaleString("es-AR", {
                              style: "currency",
                              currency: "ARS",
                              maximumFractionDigits: 0,
                            })}
                          </>
                        )}
                      </p>
                      <p className="text-xs text-text-dim">
                        {formatFechaAR(new Date(compra.fecha))}
                      </p>
                    </div>

                    {puedeAccionar && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={cargandoFila}
                          onClick={() => ejecutarAccion(compra.id, "confirmar")}
                          aria-label="Confirmar compra"
                          title="Confirmar"
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cargandoFila ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={cargandoFila}
                          onClick={() => ejecutarAccion(compra.id, "cancelar")}
                          aria-label="Cancelar compra"
                          title="Cancelar"
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Paginación: bloque separado, igual que en Clientes */}
      {totalRegistros > 0 && (
        <div className="flex flex-col gap-2 text-sm text-text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>
            {totalRegistros} compra{totalRegistros !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPaginas}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={page >= totalPaginas}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}