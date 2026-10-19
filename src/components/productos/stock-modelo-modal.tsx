"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { armarGrilla } from "@/lib/agrupar-variantes";
import type { CeldaStock } from "@/lib/modelos-stock";
import { fijarStockVarianteAction, stockModeloAction, type StockModelo } from "@/app/(dashboard)/productos/modelos-actions";

/**
 * Grilla de stock talle × color de un modelo (RV-4, #63): el stock de la
 * sucursal en la que se trabaja, con alertas de sin stock / debajo del mínimo,
 * totales por talle y por color, y edición rápida tocando una casilla.
 */
export function StockModeloModal({
  modeloId,
  onClose,
  onChanged,
  onEditarModelo,
}: {
  modeloId: number;
  onClose: () => void;
  /** Se cambió algún stock: recargar el listado. */
  onChanged?: () => void;
  /** Abrir la edición del modelo (precios, combinaciones). */
  onEditarModelo?: () => void;
}) {
  const [datos, setDatos] = useState<StockModelo | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambio = useRef(false);

  useEffect(() => {
    let vigente = true;
    stockModeloAction(modeloId).then((r) => {
      if (!vigente) return;
      if (r.success) setDatos(r.data);
      else setErrorCarga(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [modeloId]);

  const cerrar = useCallback(() => {
    if (cambio.current) onChanged?.();
    onClose();
  }, [onChanged, onClose]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && editando == null && cerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [cerrar, editando]);

  function empezar(v: CeldaStock) {
    if (!datos?.editable || guardando) return;
    setEditando(v.id);
    setValor(String(v.stock));
  }

  async function guardar(v: CeldaStock) {
    const cantidad = Number(valor);
    if (valor.trim() === "" || cantidad === v.stock) return setEditando(null);
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      toast.error("Poné un número entero, 0 o más.");
      return;
    }
    setGuardando(true);
    const r = await fijarStockVarianteAction(modeloId, v.id, cantidad);
    setGuardando(false);
    if (!r.success) return void toast.error(r.error);
    cambio.current = true;
    setDatos((d) => (d ? { ...d, variantes: d.variantes.map((x) => (x.id === v.id ? { ...x, stock: cantidad } : x)) } : d));
    setEditando(null);
    toast.success(`${r.data.nombre}: ${r.data.anterior} → ${r.data.nuevo}`);
  }

  const grilla = datos ? armarGrilla(datos.variantes) : null;
  const total = datos?.variantes.reduce((a, v) => a + v.stock, 0) ?? 0;
  const totalTalle = (t: string | null) => datos!.variantes.filter((v) => (v.talle ?? null) === t).reduce((a, v) => a + v.stock, 0);
  const totalColor = (c: string | null) => datos!.variantes.filter((v) => (v.color ?? null) === c).reduce((a, v) => a + v.stock, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-10 backdrop-blur-sm sm:pt-20" onClick={cerrar}>
      <div
        role="dialog"
        aria-label="Stock por talle y color"
        className="w-full max-w-3xl rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-text">{datos?.nombre ?? "Stock del modelo"}</h2>
            <p className="text-xs text-text-dim">
              {datos == null
                ? "Cargando…"
                : datos.editable
                  ? `Stock${datos.sucursal ? ` de ${datos.sucursal}` : ""}. Tocá una casilla para cambiarlo.`
                  : "Total de todas las sucursales. Para cambiar el stock, elegí una sucursal en la barra superior."}
            </p>
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>

        {errorCarga ? (
          <p className="py-8 text-center text-sm text-danger">{errorCarga}</p>
        ) : !datos || !grilla ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
          </div>
        ) : datos.variantes.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-dim">Este modelo todavía no tiene combinaciones.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-text-dim">Talle</th>
                    {grilla.colores.map((c) => (
                      <th key={c ?? "-"} className="px-2 py-1 text-center text-xs font-semibold text-text">
                        {c ?? "—"}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-text-dim">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grilla.talles.map((t) => (
                    <tr key={t ?? "-"}>
                      <th className="px-2 py-1 text-left text-sm font-semibold text-text">{t ?? "—"}</th>
                      {grilla.colores.map((c) => {
                        const v = grilla.celda(t, c);
                        if (!v) {
                          return (
                            <td key={c ?? "-"} title="Esta combinación no existe en el modelo" className="rounded-md border border-dashed border-border px-2 py-2 text-center text-[11px] text-text-dim/70">
                              No existe
                            </td>
                          );
                        }
                        const sinStock = v.stock <= 0;
                        const bajo = !sinStock && v.minimo > 0 && v.stock <= v.minimo;
                        if (editando === v.id) {
                          return (
                            <td key={c ?? "-"} className="p-0">
                              <input
                                autoFocus
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={valor}
                                disabled={guardando}
                                aria-label={`Stock de ${v.nombre}`}
                                onChange={(e) => setValor(e.target.value)}
                                onBlur={() => guardar(v)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") guardar(v);
                                  if (e.key === "Escape") setEditando(null);
                                }}
                                className="w-full rounded-md border-2 border-primary bg-white px-2 py-2 text-center font-mono text-sm font-semibold text-text focus:outline-none"
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={c ?? "-"} className="p-0">
                            <button
                              type="button"
                              disabled={!datos.editable}
                              onClick={() => empezar(v)}
                              title={`${v.nombre}${v.minimo > 0 ? ` · mínimo ${v.minimo}` : ""}${v.activo ? "" : " · desactivada"}`}
                              className={cn(
                                "w-full rounded-md border px-2 py-2 text-center transition-colors disabled:cursor-default",
                                sinStock ? "border-danger/30 bg-danger/10" : bajo ? "border-warning/40 bg-warning/10" : "border-border bg-white",
                                datos.editable && "cursor-pointer hover:border-primary",
                                !v.activo && "opacity-50"
                              )}
                            >
                              <span className={cn("block font-mono text-sm font-semibold", sinStock ? "text-danger" : bajo ? "text-warning" : "text-text")}>
                                {v.stock}
                              </span>
                              {(v.minimo > 0 || !v.activo) && (
                                <span className="block text-[10px] text-text-dim">{!v.activo ? "desactivada" : `mín. ${v.minimo}`}</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-mono text-sm font-semibold text-text-dim">{totalTalle(t)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-text-dim">Total</th>
                    {grilla.colores.map((c) => (
                      <td key={c ?? "-"} className="px-2 py-2 text-center font-mono text-sm font-semibold text-text-dim">
                        {totalColor(c)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-mono text-sm font-bold text-text">{total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-dim">
              <span className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-danger/30" /> Sin stock</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-warning/40" /> Debajo del mínimo</span>
              </span>
              {onEditarModelo && (
                <button type="button" onClick={onEditarModelo} className="font-medium text-primary hover:underline">
                  Editar modelo (precios y combinaciones) →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
