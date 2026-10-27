"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Barcode, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Generar e imprimir códigos de barras (issue #106).
 * Se eligen productos y cuántas etiquetas de cada uno (por defecto, el stock),
 * se generan los códigos que falten y se arma el PDF (hoja A4 o rollo 50×25 mm).
 */

export type ProductoParaCodigo = {
  id: number | string;
  nombre: string;
  codigoBarras?: string | null;
  stockActual: number;
  activo?: boolean;
};

const MAX_VISIBLES = 200;

export function CodigosBarrasModal({
  abierto,
  onCerrar,
  productos,
  onCodigosGenerados,
}: {
  abierto: boolean;
  onCerrar: () => void;
  productos: ProductoParaCodigo[];
  /** Se llama después de asignar códigos, para recargar el listado. */
  onCodigosGenerados: () => void | Promise<void>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [soloSinCodigo, setSoloSinCodigo] = useState(false);
  // id → cantidad de etiquetas (solo los elegidos)
  const [elegidos, setElegidos] = useState<Record<number, number>>({});
  // Códigos recién generados (hasta que se recargue el listado)
  const [nuevos, setNuevos] = useState<Record<number, string>>({});
  const [formato, setFormato] = useState<"A4" | "ROLLO">("A4");
  const [conPrecio, setConPrecio] = useState(false);
  const [tipoPrecio, setTipoPrecio] = useState<"MINORISTA" | "MAYORISTA">("MINORISTA");
  const [generandoCodigos, setGenerandoCodigos] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const codigoDe = (p: ProductoParaCodigo) => nuevos[Number(p.id)] ?? (p.codigoBarras?.trim() || null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        p.activo !== false &&
        (!soloSinCodigo || !(nuevos[Number(p.id)] ?? p.codigoBarras?.trim())) &&
        (!q || p.nombre.toLowerCase().includes(q) || (p.codigoBarras ?? "").includes(q))
    );
  }, [productos, busqueda, soloSinCodigo, nuevos]);

  if (!abierto) return null;

  const visibles = filtrados.slice(0, MAX_VISIBLES);
  const idsElegidos = Object.keys(elegidos).map(Number);
  const elegidosSinCodigo = productos.filter((p) => elegidos[Number(p.id)] != null && !codigoDe(p));
  const totalEtiquetas = productos.reduce((a, p) => a + (elegidos[Number(p.id)] != null && codigoDe(p) ? elegidos[Number(p.id)] : 0), 0);

  const cantidadInicial = (p: ProductoParaCodigo) => Math.max(1, Math.floor(p.stockActual) || 0);
  function alternar(p: ProductoParaCodigo) {
    setElegidos((prev) => {
      const nuevo = { ...prev };
      if (nuevo[Number(p.id)] != null) delete nuevo[Number(p.id)];
      else nuevo[Number(p.id)] = cantidadInicial(p);
      return nuevo;
    });
  }
  function elegirVisibles() {
    setElegidos((prev) => {
      const nuevo = { ...prev };
      for (const p of visibles) if (nuevo[Number(p.id)] == null) nuevo[Number(p.id)] = cantidadInicial(p);
      return nuevo;
    });
  }

  async function generarCodigos() {
    if (elegidosSinCodigo.length === 0) return;
    setGenerandoCodigos(true);
    try {
      const res = await fetch("/api/productos/codigo-barras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoIds: elegidosSinCodigo.map((p) => Number(p.id)) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudieron generar los códigos.");
      const asignados: { id: number; codigo: string }[] = data.asignados ?? [];
      setNuevos((prev) => ({ ...prev, ...Object.fromEntries(asignados.map((a) => [a.id, a.codigo])) }));
      toast.success(`${asignados.length} código${asignados.length === 1 ? "" : "s"} generado${asignados.length === 1 ? "" : "s"}`);
      await onCodigosGenerados();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron generar los códigos.");
    } finally {
      setGenerandoCodigos(false);
    }
  }

  async function generarPdf() {
    const items = productos.filter((p) => elegidos[Number(p.id)] != null && codigoDe(p)).map((p) => ({ id: Number(p.id), cantidad: elegidos[Number(p.id)] }));
    if (items.length === 0) {
      toast.error("Elegí productos con código de barras.");
      return;
    }
    setGenerandoPdf(true);
    try {
      const res = await fetch("/api/productos/codigo-barras/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, formato, conPrecio, tipoPrecio }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo generar el PDF.");
      }
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-5 pb-4 pt-5">
          <div>
            <h2 className="text-lg font-bold text-text">Códigos de barras</h2>
            <p className="text-sm text-text-dim">Generá los que falten e imprimí las etiquetas</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-text-dim hover:text-text" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2 text-text-dim">
              <input type="checkbox" checked={soloSinCodigo} onChange={(e) => setSoloSinCodigo(e.target.checked)} />
              Solo productos sin código
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={elegirVisibles} className="font-medium text-primary hover:underline">
                Elegir los {visibles.length} de la lista
              </button>
              {idsElegidos.length > 0 && (
                <button type="button" onClick={() => setElegidos({})} className="text-text-dim hover:text-text">
                  Quitar todos
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {visibles.length === 0 && <p className="py-6 text-center text-sm text-text-dim">No hay productos con ese filtro.</p>}
          <ul className="divide-y divide-border">
            {visibles.map((p) => {
              const elegido = elegidos[Number(p.id)] != null;
              const codigo = codigoDe(p);
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <input type="checkbox" checked={elegido} onChange={() => alternar(p)} aria-label={`Elegir ${p.nombre}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{p.nombre}</p>
                    {codigo ? (
                      <p className={cn("font-mono text-xs", nuevos[Number(p.id)] ? "text-success" : "text-text-dim")}>
                        {codigo}
                        {nuevos[Number(p.id)] ? " · nuevo" : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-warning">Sin código</p>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-text-dim">
                    Etiquetas
                    <input
                      type="number"
                      min={1}
                      max={999}
                      disabled={!elegido}
                      value={elegido ? elegidos[Number(p.id)] : cantidadInicial(p)}
                      onChange={(e) =>
                        setElegidos((prev) => ({ ...prev, [Number(p.id)]: Math.max(1, Math.min(999, Math.floor(Number(e.target.value)) || 1)) }))
                      }
                      className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm text-text disabled:opacity-40"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          {filtrados.length > MAX_VISIBLES && (
            <p className="py-2 text-center text-xs text-text-dim">
              Se muestran {MAX_VISIBLES} de {filtrados.length}. Usá el buscador para encontrar el resto.
            </p>
          )}
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          {elegidosSinCodigo.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
              <span className="text-text">
                {elegidosSinCodigo.length} de los elegidos no tiene{elegidosSinCodigo.length === 1 ? "" : "n"} código.
              </span>
              <button
                type="button"
                onClick={generarCodigos}
                disabled={generandoCodigos}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {generandoCodigos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
                Generar códigos
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div role="radiogroup" aria-label="Formato" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-hover p-1">
              {([
                ["A4", "Hoja A4 (24)"],
                ["ROLLO", "Rollo 50×25 mm"],
              ] as const).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={formato === valor}
                  onClick={() => setFormato(valor)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium",
                    formato === valor ? "bg-white text-text shadow-sm" : "text-text-dim hover:text-text"
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-text">
                <input type="checkbox" checked={conPrecio} onChange={(e) => setConPrecio(e.target.checked)} />
                Con precio
              </label>
              {conPrecio && (
                <select
                  value={tipoPrecio}
                  onChange={(e) => setTipoPrecio(e.target.value as "MINORISTA" | "MAYORISTA")}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text"
                >
                  <option value="MINORISTA">Minorista</option>
                  <option value="MAYORISTA">Mayorista</option>
                </select>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-text-dim">
              {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? "" : "s"}
              {formato === "A4" && totalEtiquetas > 0 ? ` · ${Math.ceil(totalEtiquetas / 24)} hoja${Math.ceil(totalEtiquetas / 24) === 1 ? "" : "s"}` : ""}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={onCerrar} className="rounded-lg border border-border px-4 py-2 text-sm text-text">
                Cerrar
              </button>
              <button
                type="button"
                onClick={generarPdf}
                disabled={generandoPdf || totalEtiquetas === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {generandoPdf ? "Generando…" : "Generar PDF"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
