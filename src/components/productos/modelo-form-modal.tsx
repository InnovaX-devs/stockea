"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Select from "@/components/ui/select";
import { ChipsSelector } from "@/components/productos/chips-selector";
import { crearModeloAction } from "@/app/(dashboard)/productos/modelos-actions";
import { TALLES_POR_DEFECTO, COLORES_POR_DEFECTO } from "@/lib/variantes";

interface Opcion {
  id: string | number;
  nombre: string;
}

interface ModeloFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none";
const LABEL = "block text-xs font-medium text-text-dim";

const clave = (talle: string | null, color: string | null) => `${talle ?? ""}\u0000${color ?? ""}`;
const lista = (data: unknown): Opcion[] =>
  Array.isArray(data) ? data : ((data as { items?: Opcion[] } | null)?.items ?? []);

/**
 * Alta de un modelo de ropa con todas sus combinaciones (RV-3): datos y precios
 * una sola vez, talles y colores con chips, y una grilla talle × color para el
 * stock inicial. Las combinaciones que no existen se sacan con la ✕.
 */
export function ModeloFormModal({ isOpen, onClose, onSuccess }: ModeloFormModalProps) {
  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [tallesSugeridos, setTallesSugeridos] = useState<string[]>(TALLES_POR_DEFECTO);
  const [coloresSugeridos, setColoresSugeridos] = useState<string[]>(COLORES_POR_DEFECTO);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);
  const [sucursal, setSucursal] = useState<{ id: number | null; nombre: string | null; multisucursal: boolean }>({
    id: null,
    nombre: null,
    multisucursal: false,
  });

  const [nombre, setNombre] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [costo, setCosto] = useState("");
  const [venta, setVenta] = useState("");
  const [mayorista, setMayorista] = useState("");

  const [talles, setTalles] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [stock, setStock] = useState<Record<string, string>>({});
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [stockParaTodas, setStockParaTodas] = useState("");

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      fetch("/api/marcas").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/categorias").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/configuracion").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/sucursales").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([m, c, config, suc]) => {
        setMarcas(lista(m));
        setCategorias(lista(c));
        if (config) {
          if (Array.isArray(config.tallesSugeridos)) setTallesSugeridos(config.tallesSugeridos);
          if (Array.isArray(config.coloresSugeridos)) setColoresSugeridos(config.coloresSugeridos);
          setUsaCotizacionUSD(Boolean(config.usaCotizacionUSD));
          setMoneda(config.usaCotizacionUSD ? "USD" : "ARS");
        }
        if (suc) {
          const actual = (suc.sucursales ?? []).find((s: { id: number }) => s.id === suc.actualId);
          setSucursal({ id: suc.actualId ?? null, nombre: actual?.nombre ?? null, multisucursal: Boolean(suc.multisucursal) });
        }
      })
      .catch(() => toast.error("No se pudieron cargar las marcas y categorías."));
  }, [isOpen]);

  // Todas las combinaciones posibles; si solo se elige talle o solo color, la otra dimensión queda vacía.
  const filas = talles.length > 0 ? talles : [null];
  const columnas = colores.length > 0 ? colores : [null];
  const hayCombinaciones = talles.length > 0 || colores.length > 0;

  const combinaciones = useMemo(
    () => (hayCombinaciones ? filas.flatMap((talle) => columnas.map((color) => ({ talle, color, key: clave(talle, color) }))) : []),
    [filas, columnas, hayCombinaciones]
  );
  const activas = combinaciones.filter((c) => !quitadas.has(c.key));
  const puedeCargarStock = sucursal.id !== null;

  function resetear() {
    setNombre("");
    setMarcaId("");
    setCategoriaId("");
    setCosto("");
    setVenta("");
    setMayorista("");
    setTalles([]);
    setColores([]);
    setQuitadas(new Set());
    setStock({});
    setCodigos({});
    setStockParaTodas("");
  }

  function cerrar() {
    resetear();
    onClose();
  }

  function alternarQuitada(key: string) {
    setQuitadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(key)) siguiente.delete(key);
      else siguiente.add(key);
      return siguiente;
    });
  }

  function aplicarStockATodas() {
    if (stockParaTodas === "") return;
    const nuevo: Record<string, string> = { ...stock };
    for (const c of activas) nuevo[c.key] = stockParaTodas;
    setStock(nuevo);
  }

  const valido =
    nombre.trim() !== "" && costo !== "" && venta !== "" && activas.length > 0 && !Number.isNaN(Number(costo)) && !Number.isNaN(Number(venta));

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      const r = await crearModeloAction({
        nombre,
        marcaId: marcaId ? Number(marcaId) : null,
        categoriaId: categoriaId ? Number(categoriaId) : null,
        precios: {
          monedaPrecio: usaCotizacionUSD ? moneda : "ARS",
          precioCosto: Number(costo),
          precioVenta: Number(venta),
          precioMayorista: mayorista === "" ? null : Number(mayorista),
        },
        combinaciones: activas.map((c) => ({
          talle: c.talle,
          color: c.color,
          stock: puedeCargarStock ? Number(stock[c.key] || 0) : 0,
          codigoBarras: codigos[c.key]?.trim() || null,
        })),
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`Modelo creado con ${r.data.combinaciones} combinaciones.`);
      resetear();
      onSuccess();
      onClose();
    } finally {
      setGuardando(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="my-0 max-h-full min-h-screen w-full max-w-3xl overflow-y-auto border-0 border-border bg-surface p-4 shadow-2xl sm:my-8 sm:max-h-[95vh] sm:min-h-0 sm:rounded-2xl sm:border sm:p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-lg font-semibold text-text sm:text-xl">Nuevo modelo</h2>
          <button type="button" onClick={cerrar} className="rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {/* Datos del modelo */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={LABEL}>Nombre del modelo *</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Remera básica" className={INPUT} autoFocus />
              <p className="mt-1 text-[11px] text-text-dim">
                Cada combinación se llamará &quot;{nombre.trim() || "Remera básica"} · M · Negro&quot;.
              </p>
            </div>
            <div>
              <label className={LABEL}>Marca</label>
              <Select
                value={marcaId}
                onChange={setMarcaId}
                options={[{ value: "", label: "Sin marca" }, ...marcas.map((m) => ({ value: String(m.id), label: m.nombre }))]}
              />
            </div>
            <div>
              <label className={LABEL}>Categoría</label>
              <Select
                value={categoriaId}
                onChange={setCategoriaId}
                options={[{ value: "", label: "Sin categoría" }, ...categorias.map((c) => ({ value: String(c.id), label: c.nombre }))]}
              />
            </div>
            {usaCotizacionUSD && (
              <div>
                <label className={LABEL}>Moneda de los precios</label>
                <Select
                  value={moneda}
                  onChange={(v) => setMoneda(v === "ARS" ? "ARS" : "USD")}
                  options={[
                    { value: "USD", label: "Dólares (USD)" },
                    { value: "ARS", label: "Pesos (ARS)" },
                  ]}
                />
              </div>
            )}
          </div>

          {/* Precios */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL}>Costo *</label>
              <input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Venta *</label>
              <input type="number" min="0" step="0.01" value={venta} onChange={(e) => setVenta(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Mayorista</label>
              <input type="number" min="0" step="0.01" value={mayorista} onChange={(e) => setMayorista(e.target.value)} className={INPUT} />
            </div>
          </div>

          {/* Talles y colores */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <ChipsSelector titulo="Talles" sugeridos={tallesSugeridos} seleccionados={talles} onChange={setTalles} />
            <ChipsSelector titulo="Colores" sugeridos={coloresSugeridos} seleccionados={colores} onChange={setColores} />
          </div>

          {/* Vista previa y stock inicial */}
          {hayCombinaciones && (
            <div className="rounded-xl border border-border p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text">
                  {talles.length > 0 && colores.length > 0
                    ? `${talles.length} talles × ${colores.length} colores = ${combinaciones.length} combinaciones`
                    : `${combinaciones.length} combinaciones`}
                  {quitadas.size > 0 && <span className="font-normal text-text-dim"> · {quitadas.size} quitadas</span>}
                </p>
                {puedeCargarStock && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={stockParaTodas}
                      onChange={(e) => setStockParaTodas(e.target.value)}
                      placeholder="Stock"
                      aria-label="Stock para todas las combinaciones"
                      className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={aplicarStockATodas}
                      className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text hover:bg-surface-hover"
                    >
                      Poner a todas
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-1 text-xs text-text-dim">
                {puedeCargarStock
                  ? `Stock inicial en ${sucursal.nombre ?? "la sucursal actual"}. Sacá con ✕ las combinaciones que no existen.`
                  : "Elegí una sucursal en la barra superior para cargar el stock inicial. Podés crear el modelo sin stock."}
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-text-dim">
                      <th className="px-2 py-1">{talles.length > 0 && colores.length > 0 ? "Talle \\ Color" : ""}</th>
                      {columnas.map((color) => (
                        <th key={color ?? "sin-color"} className="px-2 py-1">
                          {color ?? "Stock"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((talle) => (
                      <tr key={talle ?? "sin-talle"} className="border-t border-border">
                        <td className="whitespace-nowrap px-2 py-1.5 font-medium text-text">{talle ?? "—"}</td>
                        {columnas.map((color) => {
                          const key = clave(talle, color);
                          const quitada = quitadas.has(key);
                          return (
                            <td key={key} className="px-2 py-1.5">
                              {quitada ? (
                                <button type="button" onClick={() => alternarQuitada(key)} className="text-xs text-text-dim underline">
                                  Restaurar
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={!puedeCargarStock}
                                    value={stock[key] ?? ""}
                                    onChange={(e) => setStock({ ...stock, [key]: e.target.value })}
                                    placeholder="0"
                                    aria-label={`Stock ${[talle, color].filter(Boolean).join(" ")}`}
                                    className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:outline-none disabled:opacity-50"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => alternarQuitada(key)}
                                    aria-label={`Quitar ${[talle, color].filter(Boolean).join(" ")}`}
                                    className="rounded p-1 text-xs text-text-dim hover:bg-surface-hover hover:text-danger"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {activas.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-text-dim">Códigos de barras (opcional)</summary>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {activas.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-xs text-text-dim">
                        <span className="w-28 shrink-0 truncate">{[c.talle, c.color].filter(Boolean).join(" · ")}</span>
                        <input
                          type="text"
                          value={codigos[c.key] ?? ""}
                          onChange={(e) => setCodigos({ ...codigos, [c.key]: e.target.value })}
                          className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <button type="button" onClick={cerrar} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!valido || guardando}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Creando..." : `Crear ${activas.length || ""} combinaciones`.replace("  ", " ")}
          </button>
        </div>
      </div>
    </div>
  );
}
