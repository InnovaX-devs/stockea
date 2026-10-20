"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import Select from "@/components/ui/select";
import { precioConMismoMargen, type ModoCosto } from "@/lib/calculos/actualizacion-precios";

/**
 * Ventana de confirmación de una compra con el paso "¿Actualizar precios?".
 * Propone el costo nuevo (promedio ponderado o costo de esta compra, por
 * defecto según Configuración) y precios de venta que mantienen el mismo
 * margen. El costo real lo recalcula el servidor; los precios se pueden
 * editar antes de confirmar.
 *
 * Abajo, el pago (CP-1): pagar todo, una parte o nada ahora. Lo que no se
 * paga queda como deuda con el proveedor. Los montos son en ARS; si la
 * cuenta es en dólares, el servidor descuenta el equivalente con la
 * cotización de la compra.
 */

type ModoPago = "TODO" | "PARCIAL" | "NADA";

type CuentaOpcion = { id: number; nombre: string; tipo: string; saldoActual?: number };

const CUENTAS_USD = ["EFECTIVO_USD", "BANCO_USD"];

const MODOS_PAGO: { modo: ModoPago; etiqueta: string }[] = [
  { modo: "TODO", etiqueta: "Pagar todo" },
  { modo: "PARCIAL", etiqueta: "Pagar una parte" },
  { modo: "NADA", etiqueta: "No pagar ahora" },
];

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

  // Pago
  const [totalARS, setTotalARS] = useState(0);
  const [cotizacion, setCotizacion] = useState(1);
  const [cuentas, setCuentas] = useState<CuentaOpcion[]>([]);
  const [modoPago, setModoPago] = useState<ModoPago>("TODO");
  const [montoParcial, setMontoParcial] = useState("");
  const [cuentaId, setCuentaId] = useState("");

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
        setTotalARS(data.totalARS ?? 0);
        setCotizacion(data.cotizacion ?? 1);
        if (data.cuentaId != null) setCuentaId(String(data.cuentaId));
        setProductos(data.productos);
        setFilas(filasIniciales(data.productos, data.modoPorDefecto));
      })
      .catch((e) => setError(e.message));
    // Cuentas de la sucursal actual y compartidas. Sin cuenta sugerida, la primera (favoritas primero).
    fetch("/api/cuentas")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        const lista: CuentaOpcion[] = data.items ?? [];
        setCuentas(lista);
        setCuentaId((actual) => actual || (lista[0] ? String(lista[0].id) : ""));
      })
      .catch(() => setCuentas([]));
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

  // ---- Pago ----
  const montoAPagar =
    modoPago === "TODO" ? totalARS : modoPago === "PARCIAL" ? Number(montoParcial.replace(",", ".")) : 0;
  const quedaDebiendo = Math.max(0, Math.round((totalARS - (Number.isFinite(montoAPagar) ? montoAPagar : 0)) * 100) / 100);
  const cuentaElegida = cuentas.find((c) => String(c.id) === cuentaId);
  const cuentaEsUSD = !!cuentaElegida && CUENTAS_USD.includes(cuentaElegida.tipo);
  const errorPago =
    modoPago === "NADA"
      ? null
      : !cuentaElegida
        ? "Elegí la cuenta desde la que se paga."
        : modoPago === "PARCIAL" && montoParcial.trim() === ""
          ? "Ingresá cuánto vas a pagar."
          : modoPago === "PARCIAL" && !(montoAPagar > 0)
            ? "El monto tiene que ser mayor a cero."
            : modoPago === "PARCIAL" && montoAPagar >= totalARS
              ? "Para pagar el total, elegí “Pagar todo”."
              : null;

  async function confirmar() {
    if (!productos || errorPago) return;
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
        body: JSON.stringify({
          precios,
          pago: { monto: montoAPagar, cuentaId: montoAPagar > 0 ? Number(cuentaId) : null },
        }),
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
            <p className="text-sm text-text-dim">Se suma el stock y se registra el pago. Lo que no pagues queda como deuda con el proveedor.</p>
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

          {productos && (
            <SeccionPago
              totalARS={totalARS}
              cotizacion={cotizacion}
              modo={modoPago}
              onModo={setModoPago}
              monto={montoParcial}
              onMonto={setMontoParcial}
              cuentas={cuentas}
              cuentaId={cuentaId}
              onCuenta={setCuentaId}
              cuentaEsUSD={cuentaEsUSD}
              montoAPagar={montoAPagar}
              quedaDebiendo={quedaDebiendo}
              error={errorPago}
            />
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
            disabled={!productos || confirmando || precioInvalido || !!errorPago}
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

function SeccionPago({
  totalARS,
  cotizacion,
  modo,
  onModo,
  monto,
  onMonto,
  cuentas,
  cuentaId,
  onCuenta,
  cuentaEsUSD,
  montoAPagar,
  quedaDebiendo,
  error,
}: {
  totalARS: number;
  cotizacion: number;
  modo: ModoPago;
  onModo: (m: ModoPago) => void;
  monto: string;
  onMonto: (v: string) => void;
  cuentas: CuentaOpcion[];
  cuentaId: string;
  onCuenta: (v: string) => void;
  cuentaEsUSD: boolean;
  montoAPagar: number;
  quedaDebiendo: number;
  error: string | null;
}) {
  const pagaAlgo = modo !== "NADA";
  return (
    <section className="mt-6 space-y-4 rounded-xl border border-border bg-white p-4" aria-labelledby="pago-compra">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="pago-compra" className="text-base font-semibold text-text">Pago</p>
        <p className="text-sm text-text-dim">
          Total de la compra: <span className="font-semibold text-text">{fmt(totalARS, "ARS")}</span>
        </p>
      </div>

      <div className="inline-flex flex-wrap rounded-lg border border-border bg-white p-1 text-sm" role="group" aria-label="Cómo se paga">
        {MODOS_PAGO.map((o) => (
          <button
            key={o.modo}
            type="button"
            onClick={() => onModo(o.modo)}
            aria-pressed={modo === o.modo}
            className={cn("rounded-md px-3 py-1.5", modo === o.modo ? "bg-primary text-white" : "text-text-dim hover:text-text")}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>

      {pagaAlgo && (
        <div className="grid gap-3 sm:grid-cols-2">
          {modo === "PARCIAL" && (
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-text-dim">Monto a pagar (ARS)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={monto}
                onChange={(e) => onMonto(e.target.value)}
                placeholder="0"
                className={cn(INPUT, "w-full text-left")}
              />
            </label>
          )}
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-text-dim">Cuenta desde la que se paga</span>
            {cuentas.length === 0 ? (
              <p className="text-sm text-danger">No hay cuentas activas. Creá una en Finanzas o elegí “No pagar ahora”.</p>
            ) : (
              <Select
                value={cuentaId}
                onChange={onCuenta}
                options={[
                  { value: "", label: "Elegí una cuenta..." },
                  ...cuentas.map((c) => ({
                    value: String(c.id),
                    label:
                      c.saldoActual != null
                        ? `${c.nombre} · saldo ${fmt(c.saldoActual, CUENTAS_USD.includes(c.tipo) ? "USD" : "ARS")}`
                        : c.nombre,
                  })),
                ]}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-hover px-3 py-2 text-sm">
        <span className="text-text-dim">
          {pagaAlgo && montoAPagar > 0 ? (
            <>
              Sale de la cuenta:{" "}
              <span className="font-semibold text-text">
                {cuentaEsUSD ? fmt(montoAPagar / cotizacion, "USD") : fmt(montoAPagar, "ARS")}
              </span>
              {cuentaEsUSD && <span className="text-xs"> (cotización {fmt(cotizacion, "ARS")})</span>}
            </>
          ) : (
            "No sale plata de ninguna cuenta."
          )}
        </span>
        <span className={quedaDebiendo > 0 ? "font-semibold text-warning" : "text-success"}>
          {quedaDebiendo > 0 ? `Queda debiendo ${fmt(quedaDebiendo, "ARS")}` : "Queda pagada"}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
