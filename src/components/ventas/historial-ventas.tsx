"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { listarVentas } from "@/app/(dashboard)/ventas/actions"; // ajustá el path según donde queden las actions
import type { EstadoPago } from "@prisma/client";
import type { FiltroEstado, VentaListItem } from "@/types/venta";
import { Search, RefreshCw, Download, Loader2, X, Plus } from "lucide-react";
import Select from "@/components/ui/select";
import { RangoFechas } from "@/components/ui/rango-fechas";

const PAGE_SIZE = 15;

const FILTROS_ESTADO: { label: string; value: FiltroEstado }[] = [
  { label: "Todos", value: "TODOS" },
  { label: "Pagadas", value: "PAGADA" },
  { label: "A cuenta", value: "A_CUENTA" },
  { label: "Canceladas", value: "CANCELADA" },
];

const OPCIONES_ORDEN = [
  { value: "MAS_NUEVO", label: "Más nuevo primero" },
  { value: "MAS_VIEJO", label: "Más viejo primero" },
];

const ESTADO_STYLE: Record<EstadoPago, string> = {
  PAGADA: "bg-success/10 text-success",
  A_CUENTA: "bg-warning/10 text-warning",
  ANULADA: "bg-surface-hover text-text-dim",
  CANCELADA: "bg-danger/10 text-danger",
};

const ESTADO_LABEL: Record<EstadoPago, string> = {
  PAGADA: "Pagada",
  A_CUENTA: "A cuenta",
  ANULADA: "Anulada",
  CANCELADA: "Cancelada",
};

const formatoMoneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export function HistorialVentas() {
  const [ventas, setVentas] = useState<VentaListItem[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estado, setEstado] = useState<FiltroEstado>("TODOS");
  const [clienteInput, setClienteInput] = useState("");
  const [clienteTexto, setClienteTexto] = useState("");
  const [fechaDesde, setFechaDesde] = useState<string | null>(null);
  const [fechaHasta, setFechaHasta] = useState<string | null>(null);
  const [orden, setOrden] = useState<"MAS_NUEVO" | "MAS_VIEJO">("MAS_NUEVO");
  const [page, setPage] = useState(1);
  const [descargando, setDescargando] = useState<number | null>(null);

  const hayFiltrosActivos =
    estado !== "TODOS" || clienteTexto !== "" || !!fechaDesde || !!fechaHasta;

  function limpiarFiltros() {
    setEstado("TODOS");
    setClienteInput("");
    setClienteTexto("");
    setFechaDesde(null);
    setFechaHasta(null);
    setPage(1);
  }

  function handleCambiarFechas(desde: string | null, hasta: string | null) {
    setFechaDesde(desde);
    setFechaHasta(hasta);
    setPage(1);
  }

  async function descargarComprobante(ventaId: number) {
    setDescargando(ventaId);
    try {
      const res = await fetch(`/api/ventas/${ventaId}/comprobante`);
      if (!res.ok) throw new Error("No se pudo generar el comprobante.");

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `comprobante-venta-${String(ventaId).padStart(6, "0")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      console.error(err);
    } finally {
      setDescargando(null);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setClienteTexto(clienteInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [clienteInput]);

  async function cargar(esRecarga = false) {
    if (esRecarga) setRecargando(true);
    else setCargando(true);
    setError(null);

    try {
      const resultado = await listarVentas({
        estado,
        clienteTexto,
        fechaDesde: fechaDesde || null,
        fechaHasta: fechaHasta || null,
        orden,
        page,
        pageSize: PAGE_SIZE,
      });
      setVentas(resultado.ventas);
      setTotalRegistros(resultado.totalRegistros);
    } catch (err: any) {
      setError(err.message || "Error al cargar las ventas");
    } finally {
      setCargando(false);
      setRecargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, clienteTexto, fechaDesde, fechaHasta, orden, page]);

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE));

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Ventas</h1>
        <Link
          href="/ventas"
          className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2 text-sm text-white hover:opacity-90 sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Nueva Venta
        </Link>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            value={clienteInput}
            onChange={(e) => setClienteInput(e.target.value)}
            placeholder='Cliente, "Sin cliente" o Nº de venta...'
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setEstado(f.value);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  estado === f.value
                    ? "bg-primary text-white"
                    : "border border-border bg-white text-text-dim hover:bg-surface-hover"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RangoFechas desde={fechaDesde} hasta={fechaHasta} onCambiar={handleCambiarFechas} />

            <Select
              value={orden}
              onChange={(v) => setOrden(v as "MAS_NUEVO" | "MAS_VIEJO")}
              options={OPCIONES_ORDEN}
              className="w-full min-w-[9rem] sm:w-auto"
            />

            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-primary hover:underline"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}

            <button
              type="button"
              onClick={() => cargar(true)}
              className="flex h-9 w-9 shrink-0 items-center cursor-pointer justify-center rounded-lg border border-border text-text-dim hover:bg-surface-hover"
              aria-label="Actualizar"
            >
              <RefreshCw className={cn("h-4 w-4", recargando && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {cargando ? (
          <p className="p-8 text-center text-sm text-text-dim">Cargando...</p>
        ) : ventas.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-dim">
            No se encontraron ventas con estos filtros.
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
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Ganancia</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((venta) => (
                    <tr key={venta.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs text-text-dim">#{venta.id}</td>
                      <td className="px-4 py-3">
                        {venta.clienteNombre ? (
                          <span className="font-medium text-text">{venta.clienteNombre}</span>
                        ) : (
                          <span className="italic text-text-dim">Sin cliente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-text">
                        {formatoMoneda.format(venta.totalARS)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-success">
                          {formatoMoneda.format(venta.gananciaARS)}
                        </span>
                        <span className="ml-1 text-xs text-text-dim">
                          ({venta.gananciaPorcentaje.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-dim">
                        {formatoFecha.format(new Date(venta.fecha))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            ESTADO_STYLE[venta.estado]
                          )}
                        >
                          {ESTADO_LABEL[venta.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => descargarComprobante(venta.id)}
                          disabled={descargando === venta.id}
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-text-dim hover:bg-surface-hover disabled:opacity-50"
                          aria-label={`Descargar comprobante de la venta #${venta.id}`}
                        >
                          {descargando === venta.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
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
              {ventas.map((venta) => (
                <div key={venta.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-text-dim">#{venta.id}</p>
                      {venta.clienteNombre ? (
                        <p className="truncate font-medium text-text">{venta.clienteNombre}</p>
                      ) : (
                        <p className="italic text-text-dim">Sin cliente</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        ESTADO_STYLE[venta.estado]
                      )}
                    >
                      {ESTADO_LABEL[venta.estado]}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-mono font-semibold text-text">
                        {formatoMoneda.format(venta.totalARS)}
                      </span>{" "}
                      <span className="font-mono text-xs text-success">
                        +{formatoMoneda.format(venta.gananciaARS)} ({venta.gananciaPorcentaje.toFixed(1)}%)
                      </span>
                    </p>
                    <p className="text-xs text-text-dim">{formatoFecha.format(new Date(venta.fecha))}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => descargarComprobante(venta.id)}
                    disabled={descargando === venta.id}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:opacity-50"
                  >
                    {descargando === venta.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Comprobante
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Paginación */}
      {totalRegistros > 0 && (
        <div className="flex flex-col gap-2 text-sm text-text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>
            {totalRegistros} venta{totalRegistros !== 1 ? "s" : ""}
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
              Página {page} de {totalPaginas}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={page >= totalPaginas}
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