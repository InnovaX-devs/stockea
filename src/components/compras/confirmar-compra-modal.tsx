"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { precioConMismoMargen, type ModoCosto } from "@/lib/calculos/actualizacion-precios";

/**
 * Ventana de confirmación de una compra con el paso "¿Actualizar precios?".
 * Propone el costo nuevo (promedio ponderado o costo de esta compra, por
 * defecto según Configuración) y precios de venta que mantienen el mismo
 * margen. El costo real lo recalcula el servidor; los precios se pueden
 * editar antes de confirmar.
 */

type Moneda = "USD" | "ARS";

type ProductoPreview = {
  productoId: number;
  nombre: string;
  moneda: Moneda;
  cantidad: number;
  costoActual: number;
  costoCompra: number;
  costoPonderado: number;
  precioVenta: number;
  precioMayorista: number | null;
};

// Un interruptor por producto: actualiza costo y precios juntos. Para dejar
// un precio como está, se toca "Hoy $X" y el campo vuelve al precio actual.
type Fila = {
  actualizar: boolean;
  venta: string;
  ventaEditada: boolean;
  mayorista: string;
  mayoristaEditado: boolean;
};

function fmt(valor: number, moneda: Moneda) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 0,
    maximumFractionDigits: moneda === "USD" ? 2 : 0,
  }).format(valor);
}

function variacion(anterior: number, nuevo: number) {
  if (anterior <= 0) return null;
  const pct = Math.round(((nuevo - anterior) / anterior) * 1000) / 10;
  return pct === 0 ? null : `${pct > 0 ? "+" : ""}${pct.toLocaleString("es-AR")}%`;
}

const INPUT =
  "w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-right text-sm tabular-nums text-text focus:border-primary focus:outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function ConfirmarCompraModal({
  compraId,
  onCerrar,
  onConfirmada,
}: {
  compraId: number;
  onCerrar: () => void;
  onConfirmada: () => void;
}) {
  // Número visible de la compra en la empresa (llega con la vista previa).
  const [numero, setNumero] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoPreview[] | null>(null);
  const [modo, setModo] = useState<ModoCosto>("PONDERADO");
  const [filas, setFilas] = useState<Record<number, Fila>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const costoNuevo = (p: ProductoPreview, m: ModoCosto = modo) => (m === "PONDERADO" ? p.costoPonderado : p.costoCompra);
  const sugerido = (precio: number | null, p: ProductoPreview, m: ModoCosto = modo) =>
    precioConMismoMargen(precio, p.costoActual, costoNuevo(p, m), p.moneda);

  function filasIniciales(lista: ProductoPreview[], m: ModoCosto, previas: Record<number, Fila> = {}) {
    const nuevas: Record<number, Fila> = {};
    for (const p of lista) {
      const prev = previas[p.productoId];
      const venta = sugerido(p.precioVenta, p, m);
      const mayorista = sugerido(p.precioMayorista, p, m);
      nuevas[p.productoId] = {
        actualizar: prev?.actualizar ?? true,
        venta: prev?.ventaEditada ? prev.venta : venta != null ? String(venta) : "",
        ventaEditada: prev?.ventaEditada ?? false,
        mayorista: prev?.mayoristaEditado ? prev.mayorista : mayorista != null ? String(mayorista) : "",
        mayoristaEditado: prev?.mayoristaEditado ?? false,
      };
    }
    return nuevas;
  }

  useEffect(() => {
    fetch(`/api/compras/${compraId}/confirmar`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "No se pudo preparar la confirmación");
        setModo(data.modoPorDefecto);
        setNumero(data.numero ?? null);
        setProductos(data.productos);
        setFilas(filasIniciales(data.productos, data.modoPorDefecto));
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compraId]);

  function cambiarModo(m: ModoCosto) {
    setModo(m);
    if (productos) setFilas((prev) => filasIniciales(productos, m, prev));
  }

  const cambiar = (id: number, cambio: Partial<Fila>) => setFilas((p) => ({ ...p, [id]: { ...p[id], ...cambio } }));

  // Solo se muestran los productos cuyo costo cambia.
  const conCambios = useMemo(
    () => (productos ?? []).filter((p) => costoNuevo(p) !== p.costoActual),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, modo]
  );
  const sinCambios = (productos?.length ?? 0) - conCambios.length;
  const hayDiferenciaEntreModos = (productos ?? []).some((p) => p.costoCompra !== p.costoPonderado);

  function marcarTodo(valor: boolean) {
    setFilas((prev) => {
      const nuevas = { ...prev };
      for (const p of conCambios) {
        nuevas[p.productoId] = { ...nuevas[p.productoId], actualizar: valor };
      }
      return nuevas;
    });
  }

  const precioInvalido = conCambios.some((p) => {
    const f = filas[p.productoId];
    if (!f) return false;
    // Vacío = no se toca ese precio; si tiene algo, tiene que ser mayor a cero.
    const mal = (valor: string) => valor.trim() !== "" && !(Number(valor.replace(",", ".")) > 0);
    return f.actualizar && (mal(f.venta) || mal(f.mayorista));
  });

  async function confirmar() {
    if (!productos) return;
    setConfirmando(true);
    setError(null);
    const numero = (v: string) => Number(v.replace(",", "."));
    const precios = productos.map((p) => {
      const f = filas[p.productoId];
      const cambia = conCambios.some((c) => c.productoId === p.productoId) && f?.actualizar;
      const precio = (valor: string | undefined) => (cambia && valor && valor.trim() !== "" ? numero(valor) : null);
      return {
        productoId: p.productoId,
        costo: cambia ? modo : null,
        precioVenta: precio(f?.venta),
        precioMayorista: p.precioMayorista == null ? null : precio(f?.mayorista),
      };
    });
    try {
      const r = await fetch(`/api/compras/${compraId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precios }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error al confirmar la compra");
      onConfirmada();
    } catch (e: any) {
      setError(e.message || "Error al confirmar la compra");
      setConfirmando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={confirmando ? undefined : onCerrar}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text">Confirmar compra {numero != null ? `#${numero}` : ""}</h2>
            <p className="text-sm text-text-dim">Se suma el stock y se descuenta el pago de la cuenta.</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={confirmando} className="rounded p-1 text-text/60 hover:bg-surface-hover" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!productos && !error && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-text-dim">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparando...
            </p>
          )}

          {productos && conCambios.length === 0 && (
            <p className="py-6 text-center text-sm text-text-dim">
              Los costos de esta compra son iguales a los que ya tenés cargados: no hay precios para actualizar.
            </p>
          )}

          {productos && conCambios.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-text">¿Actualizar precios?</p>
                  <p className="text-sm text-text-dim">
                    El precio sugerido mantiene el mismo margen que tenía cada producto. Podés cambiarlo antes de confirmar.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => marcarTodo(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover">
                    Actualizar todo
                  </button>
                  <button type="button" onClick={() => marcarTodo(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover">
                    No actualizar nada
                  </button>
                </div>
              </div>

              {hayDiferenciaEntreModos && (
                <div className="inline-flex rounded-lg border border-border bg-white p-1 text-sm">
                  {(["PONDERADO", "COMPRA"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => cambiarModo(m)}
                      className={cn("rounded-md px-3 py-1.5", modo === m ? "bg-primary text-white" : "text-text-dim hover:text-text")}
                    >
                      {m === "PONDERADO" ? "Costo promedio ponderado" : "Costo de esta compra"}
                    </button>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-topbar text-left text-[11px] font-bold uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Costo</th>
                      <th className="px-4 py-3">Precio de venta</th>
                      <th className="px-4 py-3">Mayorista</th>
                      <th className="px-4 py-3 text-right">Actualizar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conCambios.map((p) => {
                      const f = filas[p.productoId];
                      if (!f) return null;
                      const nuevo = costoNuevo(p);
                      const pct = variacion(p.costoActual, nuevo);
                      return (
                        <tr key={p.productoId} className="border-t border-border align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium text-text">{p.nombre}</p>
                            <p className="text-xs text-text-dim">+{p.cantidad} unidades</p>
                          </td>
                          <td className={cn("px-4 py-3", !f.actualizar && "opacity-40")}>
                            <span className="text-text-dim line-through">{fmt(p.costoActual, p.moneda)}</span>{" "}
                            <span className="font-semibold text-text">{fmt(nuevo, p.moneda)}</span>
                            {pct && (
                              <span className={cn("ml-1 text-xs font-medium", nuevo > p.costoActual ? "text-danger" : "text-success")}>
                                {pct}
                              </span>
                            )}
                          </td>
                          {f.actualizar ? (
                            <>
                              <td className="px-4 py-3">
                                <CampoPrecio
                                  anterior={p.precioVenta}
                                  valor={f.venta}
                                  onValor={(v) => cambiar(p.productoId, { venta: v, ventaEditada: true })}
                                  moneda={p.moneda}
                                  sinSugerencia={sugerido(p.precioVenta, p) == null}
                                />
                              </td>
                              <td className="px-4 py-3">
                                {p.precioMayorista == null ? (
                                  <span className="text-xs text-text-dim">Sin precio mayorista</span>
                                ) : (
                                  <CampoPrecio
                                    anterior={p.precioMayorista}
                                    valor={f.mayorista}
                                    onValor={(v) => cambiar(p.productoId, { mayorista: v, mayoristaEditado: true })}
                                    moneda={p.moneda}
                                    sinSugerencia={sugerido(p.precioMayorista, p) == null}
                                  />
                                )}
                              </td>
                            </>
                          ) : (
                            <td colSpan={2} className="px-4 py-3 text-sm text-text-dim">
                              Se mantienen el costo y los precios de hoy.
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            <Interruptor
                              activo={f.actualizar}
                              onChange={(v) => cambiar(p.productoId, { actualizar: v })}
                              etiqueta={`Actualizar ${p.nombre}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {sinCambios > 0 && (
                <p className="text-xs text-text-dim">
                  {sinCambios} producto{sinCambios === 1 ? "" : "s"} de la compra no cambia{sinCambios === 1 ? "" : "n"} de costo: solo se suma el stock.
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onCerrar}
            disabled={confirmando}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text hover:bg-surface-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!productos || confirmando || precioInvalido}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {confirmando ? "Confirmando..." : "Confirmar compra"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Interruptor({ activo, onChange, etiqueta }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onChange(!activo)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        activo ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          activo ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function CampoPrecio({
  anterior,
  valor,
  onValor,
  moneda,
  sinSugerencia,
}: {
  anterior: number;
  valor: string;
  onValor: (v: string) => void;
  moneda: Moneda;
  sinSugerencia: boolean;
}) {
  const nuevo = Number(valor.replace(",", "."));
  const pct = nuevo > 0 ? variacion(anterior, nuevo) : null;
  const igualAHoy = nuevo === anterior;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={moneda === "USD" ? "0.01" : "1"}
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          placeholder={sinSugerencia ? "Nuevo precio" : ""}
          aria-label="Nuevo precio"
          className={INPUT}
        />
        {pct && <span className="text-xs font-medium text-text-dim">{pct}</span>}
      </div>
      {igualAHoy ? (
        <p className="text-xs text-text-dim">Igual que hoy</p>
      ) : (
        <button
          type="button"
          onClick={() => onValor(String(anterior))}
          className="text-xs text-text-dim hover:text-primary hover:underline"
          title="Dejar el precio de hoy"
        >
          Hoy {fmt(anterior, moneda)}
        </button>
      )}
      {valor.trim() !== "" && !(nuevo > 0) && <p className="text-xs text-danger">Tiene que ser mayor a cero.</p>}
    </div>
  );
}
