"use client";

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { armarGrilla } from "@/lib/agrupar-variantes";

/**
 * Grilla talle × color para CARGAR cantidades (RV-6, #65): la usan Nueva compra
 * y Nueva transferencia. Una celda por combinación existente del modelo.
 *
 * Pensada para cargar rápido con el teclado:
 * - Enter: pasa a la celda siguiente (fila por fila).
 * - Flechas ↑ ↓: misma columna, fila de arriba / de abajo.
 * - Al entrar a una celda se selecciona su contenido, así se pisa de una.
 */

export type VarianteGrilla = {
  id: number;
  nombre: string;
  talle?: string | null;
  color?: string | null;
};

/** Cantidad de la celda como número (vacío o inválido = 0). */
export function cantidadDe(cantidades: Record<number, string>, id: number): number {
  const n = Number(cantidades[id]);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Total de unidades cargadas en una grilla. */
export function sumarCantidades(cantidades: Record<number, string>): number {
  return Object.keys(cantidades).reduce((acc, id) => acc + cantidadDe(cantidades, Number(id)), 0);
}

const CANTIDAD_TOPE = 99999;

export function GrillaCantidades<T extends VarianteGrilla>({
  variantes,
  cantidades,
  onCambiar,
  maximo,
  detalle,
  extra,
}: {
  variantes: T[];
  /** Cantidad tipeada por productoId (string para poder dejar la celda vacía). */
  cantidades: Record<number, string>;
  onCambiar: (id: number, valor: string) => void;
  /** Tope por celda (ej.: stock disponible en transferencias). Con tope 0 la celda queda bloqueada. */
  maximo?: (v: T) => number;
  /** Texto chico arriba del input (ej.: "Stock 5"). */
  detalle?: (v: T) => ReactNode;
  /** Contenido extra debajo del input (ej.: costo propio de la combinación). */
  extra?: (v: T) => ReactNode;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const { talles, colores, celda } = armarGrilla(variantes);

  const totalFila = (t: string | null) =>
    colores.reduce((acc, c) => {
      const v = celda(t, c);
      return acc + (v ? cantidadDe(cantidades, v.id) : 0);
    }, 0);
  const totalColumna = (c: string | null) =>
    talles.reduce((acc, t) => {
      const v = celda(t, c);
      return acc + (v ? cantidadDe(cantidades, v.id) : 0);
    }, 0);
  const totalGeneral = variantes.reduce((acc, v) => acc + cantidadDe(cantidades, v.id), 0);

  function cambiar(v: T, crudo: string) {
    // Solo dígitos; si se pasa del tope, se recorta al tope.
    const limpio = crudo.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (limpio === "") return onCambiar(v.id, "");
    const tope = Math.min(maximo ? maximo(v) : CANTIDAD_TOPE, CANTIDAD_TOPE);
    onCambiar(v.id, Number(limpio) > tope ? String(tope) : limpio);
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    const raiz = raizRef.current;
    if (!raiz) return;
    const input = e.currentTarget;
    const fila = Number(input.dataset.fila);
    const col = Number(input.dataset.col);
    const buscar = (f: number, c: number) =>
      raiz.querySelector<HTMLInputElement>(`input[data-celda][data-fila="${f}"][data-col="${c}"]:not(:disabled)`);

    let destino: HTMLInputElement | null = null;
    if (e.key === "ArrowDown") destino = buscar(fila + 1, col);
    else if (e.key === "ArrowUp") destino = buscar(fila - 1, col);
    else if (e.key === "Enter") {
      const todos = Array.from(raiz.querySelectorAll<HTMLInputElement>("input[data-celda]:not(:disabled)"));
      destino = todos[todos.indexOf(input) + 1] ?? null;
      e.preventDefault(); // Enter nunca debe enviar el formulario desde una celda
    } else return;

    if (destino) {
      e.preventDefault();
      destino.focus();
    }
  }

  return (
    <div ref={raizRef} className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-text-dim">Talle</th>
            {colores.map((c) => (
              <th key={c ?? "-"} className="px-2 py-1 text-center text-xs font-semibold text-text">
                {c ?? "—"}
              </th>
            ))}
            <th className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-text-dim">Total</th>
          </tr>
        </thead>
        <tbody>
          {talles.map((t, fila) => (
            <tr key={t ?? "-"}>
              <th className="px-2 py-1 text-left text-sm font-semibold text-text">{t ?? "—"}</th>
              {colores.map((c, col) => {
                const v = celda(t, c);
                if (!v) {
                  return (
                    <td
                      key={c ?? "-"}
                      title="Esta combinación no existe en el modelo"
                      className="rounded-md border border-dashed border-border px-2 py-2 text-center text-[11px] text-text-dim/70"
                    >
                      No existe
                    </td>
                  );
                }
                const tope = maximo ? maximo(v) : CANTIDAD_TOPE;
                const bloqueada = tope <= 0;
                const cargada = cantidadDe(cantidades, v.id) > 0;
                return (
                  <td key={c ?? "-"} className="p-0 align-top">
                    <div
                      className={cn(
                        "rounded-md border px-1.5 py-1.5 text-center",
                        bloqueada ? "border-border bg-surface-hover/40 opacity-60" : cargada ? "border-primary bg-primary/5" : "border-border bg-white"
                      )}
                    >
                      {detalle && <div className="mb-1 text-[11px] text-text-dim">{detalle(v)}</div>}
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        data-celda
                        data-fila={fila}
                        data-col={col}
                        disabled={bloqueada}
                        value={cantidades[v.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => cambiar(v, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={alTeclear}
                        aria-label={`Cantidad de ${v.nombre}`}
                        title={bloqueada ? "Sin stock en esta sucursal" : v.nombre}
                        className="w-full min-w-14 rounded-md border border-border bg-white px-2 py-1.5 text-center font-mono text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed"
                      />
                      {extra && <div className="mt-1">{extra(v)}</div>}
                    </div>
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-mono text-sm font-semibold text-text">{totalFila(t) || "·"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-text-dim">Total</th>
            {colores.map((c) => (
              <td key={c ?? "-"} className="px-2 py-1 text-center font-mono text-sm font-semibold text-text">
                {totalColumna(c) || "·"}
              </td>
            ))}
            <td className="px-2 py-1 text-center font-mono text-sm font-bold text-primary">{totalGeneral}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}