"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { BarcodeInput } from "@/components/ui/barcode-input";
import DateInput from "@/components/ui/date-input";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useCotizacionUSD } from "@/lib/hooks/use-cotizacion";
import { formatCurrency, toArs, type Moneda } from "@/lib/currency";
import type { PromocionDTO } from "@/lib/promociones";

/** Nueva promoción / editar (#114). */

type Componente = { productoId: number; nombre: string; cantidad: number; precioARS: number };

type ResultadoBusqueda = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  monedaPrecio: Moneda;
  precioVenta: number;
  precioAbierto?: boolean;
  marca: { nombre: string } | null;
};

interface Props {
  promocion: PromocionDTO | null;
  onCerrar: () => void;
  onGuardada: () => void;
}

const inputClase =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none";

export function PromocionFormModal({ promocion, onCerrar, onGuardada }: Props) {
  const cotizacion = useCotizacionUSD();
  const [nombre, setNombre] = useState(promocion?.nombre ?? "");
  const [componentes, setComponentes] = useState<Componente[]>(
    promocion?.componentes.map((c) => ({ productoId: c.productoId, nombre: c.nombre, cantidad: c.cantidad, precioARS: c.precioARS })) ?? []
  );
  const [precio, setPrecio] = useState(promocion ? String(promocion.precio) : "");
  const [codigoBarras, setCodigoBarras] = useState(promocion?.codigoBarras ?? "");
  const [vigenciaDesde, setVigenciaDesde] = useState(promocion?.vigenciaDesde ?? "");
  const [vigenciaHasta, setVigenciaHasta] = useState(promocion?.vigenciaHasta ?? "");
  const [activo, setActivo] = useState(promocion?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  // Buscador de productos para agregar (sin promos ni precio abierto).
  const [busqueda, setBusqueda] = useState("");
  // Resultados junto con la búsqueda que los trajo: mientras no coinciden, está buscando.
  const [encontrados, setEncontrados] = useState<{ consulta: string; items: ResultadoBusqueda[] }>({ consulta: "", items: [] });
  const consulta = useDebounce(busqueda.trim(), 250);
  useEffect(() => {
    if (!consulta) return;
    const controller = new AbortController();
    fetch(`/api/productos/buscar?q=${encodeURIComponent(consulta)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setEncontrados({ consulta, items: ((d.items ?? []) as ResultadoBusqueda[]).filter((p) => !p.precioAbierto) }))
      .catch(() => {});
    return () => controller.abort();
  }, [consulta]);
  const resultados = busqueda.trim() && encontrados.consulta === consulta ? encontrados.items : [];
  const buscando = busqueda.trim() !== "" && encontrados.consulta !== busqueda.trim();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !guardando && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [guardando, onCerrar]);

  function agregar(p: ResultadoBusqueda) {
    setComponentes((prev) =>
      prev.some((c) => c.productoId === p.id)
        ? prev.map((c) => (c.productoId === p.id ? { ...c, cantidad: c.cantidad + 1 } : c))
        : [...prev, { productoId: p.id, nombre: p.nombre, cantidad: 1, precioARS: toArs(p.precioVenta, p.monedaPrecio, cotizacion || 1) }]
    );
    setBusqueda("");
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    setComponentes((prev) => prev.map((c) => (c.productoId === productoId ? { ...c, cantidad: Math.min(999, Math.max(1, cantidad)) } : c)));
  }

  const precioSeparado = useMemo(() => componentes.reduce((a, c) => a + c.precioARS * c.cantidad, 0), [componentes]);
  const precioNumero = Number(precio);
  const ahorro = precioSeparado - (Number.isFinite(precioNumero) ? precioNumero : 0);

  async function generarCodigo() {
    setGenerando(true);
    try {
      const res = await fetch("/api/productos/codigo-barras", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.codigo) throw new Error(data?.error ?? "No se pudo generar el código.");
      setCodigoBarras((actual) => (actual.trim() ? actual : data.codigo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el código.");
    } finally {
      setGenerando(false);
    }
  }

  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      const res = await fetch(promocion ? `/api/promociones/${promocion.id}` : "/api/promociones", {
        method: promocion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          codigoBarras,
          precio: precioNumero,
          vigenciaDesde: vigenciaDesde || null,
          vigenciaHasta: vigenciaHasta || null,
          activo,
          componentes: componentes.map((c) => ({ productoId: c.productoId, cantidad: c.cantidad })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar la promoción.");
      onGuardada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la promoción.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex min-h-full w-full max-w-2xl flex-col bg-surface shadow-2xl sm:min-h-0 sm:rounded-2xl sm:border sm:border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text">{promocion ? "Editar promoción" : "Nueva promoción"}</h2>
            <p className="text-sm text-text-dim">Al venderla se descuenta el stock de cada producto que incluye.</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-text-dim hover:text-text" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div>
            <label htmlFor="promo-nombre" className="block text-xs font-medium text-text-dim">
              Nombre
            </label>
            <input
              id="promo-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder='Ej: "Promo Fernet + 2 Coca"'
              maxLength={120}
              className={`mt-1 ${inputClase}`}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-text-dim">Productos que incluye</span>
            <div className="relative mt-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscá un producto por nombre o código..."
                className={`${inputClase} pl-9`}
              />
              {buscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-dim" />}
              {busqueda.trim() && resultados.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregar(p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text">{p.nombre}</span>
                        <span className="text-xs text-text-dim">Stock: {p.stockActual}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-text">
                        {formatCurrency(toArs(p.precioVenta, p.monedaPrecio, cotizacion || 1), "ARS")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {componentes.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-text-dim">
                Todavía no agregaste productos.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {componentes.map((c) => (
                  <li key={c.productoId} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{c.nombre}</span>
                      <span className="text-xs text-text-dim">{formatCurrency(c.precioARS, "ARS")} c/u</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(c.productoId, c.cantidad - 1)}
                        className="rounded-md border border-border p-1 text-text-dim hover:bg-surface-hover"
                        aria-label="Restar"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={c.cantidad}
                        onChange={(e) => cambiarCantidad(c.productoId, Math.floor(Number(e.target.value) || 1))}
                        className="w-12 rounded-md border border-border bg-surface px-1 py-1 text-center text-sm text-text focus:border-primary focus:outline-none"
                        aria-label={`Cantidad de ${c.nombre}`}
                      />
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(c.productoId, c.cantidad + 1)}
                        className="rounded-md border border-border p-1 text-text-dim hover:bg-surface-hover"
                        aria-label="Sumar"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComponentes((prev) => prev.filter((x) => x.productoId !== c.productoId))}
                      className="rounded-lg p-1.5 text-text-dim hover:bg-danger/10 hover:text-danger"
                      aria-label={`Quitar ${c.nombre}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="promo-precio" className="block text-xs font-medium text-text-dim">
                Precio de la promo ($)
              </label>
              <input
                id="promo-precio"
                type="number"
                min={0}
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="Ej: 18000"
                className={`mt-1 ${inputClase}`}
              />
              {componentes.length > 0 && (
                <p className="mt-1 text-xs text-text-dim">
                  Precio por separado: <span className="font-medium text-text">{formatCurrency(precioSeparado, "ARS")}</span>
                  {precio !== "" && precioNumero > 0 && (
                    <>
                      {" · "}
                      {ahorro > 0 ? (
                        <span className="font-medium text-success">Ahorro: {formatCurrency(ahorro, "ARS")}</span>
                      ) : (
                        <span className="font-medium text-warning">Sin ahorro para el cliente</span>
                      )}
                    </>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim">Código de barras (opcional)</label>
              <div className="mt-1 flex gap-2">
                <BarcodeInput value={codigoBarras} onChange={setCodigoBarras} placeholder="Escaneá o tipeá el código..." className={inputClase} />
                {!codigoBarras.trim() && (
                  <button
                    type="button"
                    onClick={generarCodigo}
                    disabled={generando}
                    title="Generar un código de barras interno para la promo"
                    className="shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:opacity-50"
                  >
                    {generando ? "…" : "Generar"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-text-dim">Vigencia (opcional)</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <DateInput value={vigenciaDesde} onChange={setVigenciaDesde} placeholder="Desde" max={vigenciaHasta || undefined} />
              <DateInput value={vigenciaHasta} onChange={setVigenciaHasta} placeholder="Hasta" min={vigenciaDesde || undefined} />
            </div>
            <p className="mt-1 text-xs text-text-dim">Sin fechas, la promo vale hasta que la pauses.</p>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-text">Activa</span>
              <span className="text-xs text-text-dim">Pausada, no aparece en Nueva venta.</span>
            </span>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
          </label>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>

        <div className="mt-auto flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : promocion ? "Guardar cambios" : "Crear promoción"}
          </button>
        </div>
      </div>
    </div>
  );
}
