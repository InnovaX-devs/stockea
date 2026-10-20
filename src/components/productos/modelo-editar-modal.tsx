"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Select from "@/components/ui/select";
import { confirmar } from "@/components/ui/dialogos";
import { ChipsSelector } from "@/components/productos/chips-selector";
import {
  actualizarPreciosModeloAction,
  agregarCombinacionesAction,
  eliminarCombinacionAction,
  guardarModeloAction,
  obtenerModeloAction,
} from "@/app/(dashboard)/productos/modelos-actions";
import type { ModeloDetalle } from "@/lib/modelos";
import { COLORES_POR_DEFECTO, limpiarLista, TALLES_POR_DEFECTO } from "@/lib/variantes";

interface Opcion {
  id: string | number;
  nombre: string;
}

interface ModeloEditarModalProps {
  modeloId: number;
  onClose: () => void;
  /** Se llama después de cualquier cambio, para recargar el listado de productos. */
  onChanged: () => void;
}

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none";
const INPUT_CELDA =
  "w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:outline-none";
const LABEL = "block text-xs font-medium text-text-dim";
const BOTON =
  "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const lista = (data: unknown): Opcion[] =>
  Array.isArray(data) ? data : ((data as { items?: Opcion[] } | null)?.items ?? []);

type PreciosFila = { costo: string; venta: string; mayorista: string };

/**
 * Editar un modelo de ropa (RV-3): cambiar nombre/marca/categoría (se copia a
 * todas las combinaciones), cambiar el precio de todas a la vez o de una sola, y
 * agregar talles o colores nuevos (crea las combinaciones que faltan).
 */
export function ModeloEditarModal({ modeloId, onClose, onChanged }: ModeloEditarModalProps) {
  const [modelo, setModelo] = useState<ModeloDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [tallesSugeridos, setTallesSugeridos] = useState<string[]>(TALLES_POR_DEFECTO);
  const [coloresSugeridos, setColoresSugeridos] = useState<string[]>(COLORES_POR_DEFECTO);

  const [nombre, setNombre] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  const [todasCosto, setTodasCosto] = useState("");
  const [todasVenta, setTodasVenta] = useState("");
  const [todasMayorista, setTodasMayorista] = useState("");

  const [filas, setFilas] = useState<Record<number, PreciosFila>>({});
  const [nuevosTalles, setNuevosTalles] = useState<string[]>([]);
  const [nuevosColores, setNuevosColores] = useState<string[]>([]);
  // Vista previa de lo que se va a crear: lo que la persona saca, y el stock / código de cada una.
  const [sacadas, setSacadas] = useState<Set<string>>(new Set());
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [codigos, setCodigos] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const r = await obtenerModeloAction(modeloId);
    if (!r.success) {
      toast.error(r.error);
      setCargando(false);
      return;
    }
    const m = r.data;
    setModelo(m);
    setNombre(m.nombre);
    setMarcaId(m.marcaId ? String(m.marcaId) : "");
    setCategoriaId(m.categoriaId ? String(m.categoriaId) : "");
    setFilas(
      Object.fromEntries(
        m.variantes.map((v) => [
          v.id,
          { costo: String(v.precioCosto), venta: String(v.precioVenta), mayorista: v.precioMayorista === null ? "" : String(v.precioMayorista) },
        ])
      )
    );
    setCargando(false);
  }, [modeloId]);

  useEffect(() => {
    cargar();
    Promise.all([
      fetch("/api/marcas").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/categorias").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/configuracion").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([m, c, config]) => {
        setMarcas(lista(m));
        setCategorias(lista(c));
        if (config && Array.isArray(config.tallesSugeridos)) setTallesSugeridos(config.tallesSugeridos);
        if (config && Array.isArray(config.coloresSugeridos)) setColoresSugeridos(config.coloresSugeridos);
      })
      .catch(() => {});
  }, [cargar]);

  /** Corre una acción, avisa el resultado y recarga el modelo y el listado. */
  async function correr<T>(accion: () => Promise<{ success: true; data?: T } | { success: false; error: string }>, ok: (data: T) => string, despues?: () => void) {
    setOcupado(true);
    try {
      const r = await accion();
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(ok(r.data as T));
      despues?.();
      await cargar();
      onChanged();
    } finally {
      setOcupado(false);
    }
  }

  const aNumero = (texto: string) => (texto.trim() === "" ? undefined : Number(texto));

  async function guardarDatos() {
    await correr(
      () =>
        guardarModeloAction(modeloId, {
          nombre,
          marcaId: marcaId ? Number(marcaId) : null,
          categoriaId: categoriaId ? Number(categoriaId) : null,
        }),
      (d) => `Modelo guardado. Se actualizaron ${(d as { variantes: number }).variantes} combinaciones.`
    );
  }

  async function aplicarATodas() {
    const precios = { precioCosto: aNumero(todasCosto), precioVenta: aNumero(todasVenta), precioMayorista: aNumero(todasMayorista) };
    if (precios.precioCosto === undefined && precios.precioVenta === undefined && precios.precioMayorista === undefined) {
      toast.error("Completá al menos un precio.");
      return;
    }
    if (!(await confirmar(`¿Cambiar los precios de las ${modelo?.variantes.length ?? 0} combinaciones de "${modelo?.nombre}"?`, { titulo: "Precio de todas", confirmar: "Aplicar" }))) return;
    await correr(
      () => actualizarPreciosModeloAction(modeloId, precios),
      (d) => `Precios actualizados en ${(d as { actualizadas: number }).actualizadas} combinaciones.`,
      () => {
        setTodasCosto("");
        setTodasVenta("");
        setTodasMayorista("");
      }
    );
  }

  async function guardarFila(id: number) {
    const f = filas[id];
    await correr(
      () => actualizarPreciosModeloAction(modeloId, { precioCosto: aNumero(f.costo), precioVenta: aNumero(f.venta), precioMayorista: aNumero(f.mayorista) }, [id]),
      () => "Precio actualizado."
    );
  }

  async function borrarFila(id: number, nombre: string) {
    if (!(await confirmar(`¿Borrar "${nombre}"? Solo se puede si nunca tuvo stock ni ventas.`, { titulo: "Borrar combinación", confirmar: "Borrar", peligro: true }))) return;
    await correr(
      () => eliminarCombinacionAction(modeloId, id),
      () => "Combinación borrada."
    );
  }

  async function agregar() {
    const elegidas = combinacionesNuevas.map((c) => ({
      talle: c.talle,
      color: c.color,
      stock: Number(stocks[c.clave] || 0),
      codigoBarras: codigos[c.clave]?.trim() || null,
    }));
    await correr(
      () => agregarCombinacionesAction(modeloId, elegidas),
      (d) => `Se crearon ${(d as { creadas: number }).creadas} combinaciones nuevas.`,
      () => {
        setNuevosTalles([]);
        setNuevosColores([]);
        setSacadas(new Set());
        setStocks({});
        setCodigos({});
      }
    );
  }

  // A los chips solo se ofrecen los talles y colores que el modelo todavía no tiene.
  const tallesDelModelo = limpiarLista((modelo?.variantes ?? []).map((v) => v.talle).filter((t): t is string => !!t));
  const coloresDelModelo = limpiarLista((modelo?.variantes ?? []).map((v) => v.color).filter((c): c is string => !!c));
  const sinLosActuales = (sugeridos: string[], actuales: string[]) =>
    sugeridos.filter((s) => !actuales.some((a) => a.toLowerCase() === s.toLowerCase()));

  // Combinaciones que se crearían: las que involucran un talle o color nuevo y todavía no existen.
  const claveDe = (talle: string | null, color: string | null) => `${(talle ?? "").toLowerCase()}|${(color ?? "").toLowerCase()}`;
  const existentes = new Set((modelo?.variantes ?? []).map((v) => claveDe(v.talle, v.color)));
  const esNuevo = (valor: string | null, lista: string[]) => !!valor && lista.some((n) => n.toLowerCase() === valor.toLowerCase());
  const todosTalles = limpiarLista([...tallesDelModelo, ...nuevosTalles]);
  const todosColores = limpiarLista([...coloresDelModelo, ...nuevosColores]);
  const candidatas: { clave: string; talle: string | null; color: string | null }[] = [];
  for (const talle of todosTalles.length ? todosTalles : [null]) {
    for (const color of todosColores.length ? todosColores : [null]) {
      const k = claveDe(talle, color);
      if (existentes.has(k)) continue;
      if (esNuevo(talle, nuevosTalles) || esNuevo(color, nuevosColores)) candidatas.push({ clave: k, talle, color });
    }
  }
  const combinacionesNuevas = candidatas.filter((c) => !sacadas.has(c.clave));

  const cambiarTalles = (v: string[]) => {
    setNuevosTalles(v);
    setSacadas(new Set());
  };
  const cambiarColores = (v: string[]) => {
    setNuevosColores(v);
    setSacadas(new Set());
  };
  const sacar = (k: string) => setSacadas(new Set(sacadas).add(k));

  const filaCambio = (id: number) => {
    const v = modelo?.variantes.find((x) => x.id === id);
    const f = filas[id];
    if (!v || !f) return false;
    return (
      Number(f.costo) !== v.precioCosto ||
      Number(f.venta) !== v.precioVenta ||
      (f.mayorista.trim() !== "" && Number(f.mayorista) !== v.precioMayorista)
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="my-0 max-h-full min-h-screen w-full max-w-4xl overflow-y-auto border-0 border-border bg-surface p-4 shadow-2xl sm:my-8 sm:max-h-[95vh] sm:min-h-0 sm:rounded-2xl sm:border sm:p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-lg font-semibold text-text sm:text-xl">Editar modelo{modelo ? `: ${modelo.nombre}` : ""}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text">
            ✕
          </button>
        </div>

        {cargando && <p className="py-8 text-center text-sm text-text-dim">Cargando...</p>}

        {!cargando && !modelo && <p className="py-8 text-center text-sm text-danger">No se pudo cargar el modelo.</p>}

        {modelo && (
          <div className="mt-4 space-y-6">
            {/* Datos del modelo */}
            <section>
              <h3 className="text-sm font-semibold text-text">Datos del modelo</h3>
              <p className="text-xs text-text-dim">Se copian a todas las combinaciones.</p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={LABEL}>Nombre</label>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Marca</label>
                  <Select value={marcaId} onChange={setMarcaId} options={[{ value: "", label: "Sin marca" }, ...marcas.map((m) => ({ value: String(m.id), label: m.nombre }))]} />
                </div>
                <div>
                  <label className={LABEL}>Categoría</label>
                  <Select value={categoriaId} onChange={setCategoriaId} options={[{ value: "", label: "Sin categoría" }, ...categorias.map((c) => ({ value: String(c.id), label: c.nombre }))]} />
                </div>
              </div>
              <button type="button" onClick={guardarDatos} disabled={ocupado || nombre.trim() === ""} className={`${BOTON} mt-3`}>
                Guardar datos
              </button>
            </section>

            {/* Precio de todas */}
            <section>
              <h3 className="text-sm font-semibold text-text">Precio de todas las combinaciones</h3>
              <p className="text-xs text-text-dim">Dejá vacío el que no quieras cambiar. Queda en el historial de precios.</p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
                <div>
                  <label className={LABEL}>Costo</label>
                  <input type="number" min="0" step="0.01" value={todasCosto} onChange={(e) => setTodasCosto(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Venta</label>
                  <input type="number" min="0" step="0.01" value={todasVenta} onChange={(e) => setTodasVenta(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Mayorista</label>
                  <input type="number" min="0" step="0.01" value={todasMayorista} onChange={(e) => setTodasMayorista(e.target.value)} className={INPUT} />
                </div>
                <button type="button" onClick={aplicarATodas} disabled={ocupado} className={BOTON}>
                  Aplicar a todas
                </button>
              </div>
            </section>

            {/* Combinaciones */}
            <section>
              <h3 className="text-sm font-semibold text-text">Combinaciones ({modelo.variantes.length})</h3>
              <p className="text-xs text-text-dim">Cambiá el precio de una sola y guardala. Podés borrar una combinación solo si nunca tuvo stock ni ventas; si no, desactivala desde Productos.</p>
              <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-text-dim">
                    <tr>
                      <th className="px-3 py-2">Combinación</th>
                      <th className="px-3 py-2">Stock</th>
                      <th className="px-3 py-2">Costo</th>
                      <th className="px-3 py-2">Venta</th>
                      <th className="px-3 py-2">Mayorista</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {modelo.variantes.map((v) => {
                      const f = filas[v.id];
                      if (!f) return null;
                      return (
                        <tr key={v.id} className={`border-t border-border ${v.activo ? "" : "opacity-60"}`}>
                          <td className="px-3 py-1.5 font-medium text-text">
                            {[v.talle, v.color].filter(Boolean).join(" · ")}
                            {!v.activo && <span className="ml-2 text-xs font-normal text-text-dim">(inactiva)</span>}
                          </td>
                          <td className="px-3 py-1.5 text-text-dim">{v.stockActual}</td>
                          <td className="px-3 py-1.5">
                            <input type="number" min="0" step="0.01" value={f.costo} onChange={(e) => setFilas({ ...filas, [v.id]: { ...f, costo: e.target.value } })} className={INPUT_CELDA} />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" min="0" step="0.01" value={f.venta} onChange={(e) => setFilas({ ...filas, [v.id]: { ...f, venta: e.target.value } })} className={INPUT_CELDA} />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" min="0" step="0.01" value={f.mayorista} onChange={(e) => setFilas({ ...filas, [v.id]: { ...f, mayorista: e.target.value } })} className={INPUT_CELDA} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button type="button" onClick={() => guardarFila(v.id)} disabled={ocupado || !filaCambio(v.id)} className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-text hover:bg-surface-hover disabled:opacity-40">
                              Guardar
                            </button>
                            <button type="button" onClick={() => borrarFila(v.id, v.nombre)} disabled={ocupado} aria-label="Borrar combinación" className="ml-1 rounded-lg px-2 py-1 text-xs text-text-dim hover:bg-surface-hover hover:text-danger disabled:opacity-40">
                              Borrar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Agregar talles / colores */}
            <section>
              <h3 className="text-sm font-semibold text-text">Agregar talles o colores</h3>
              <p className="text-xs text-text-dim">
                Elegí lo nuevo y mirá la vista previa: podés sacar las combinaciones que no existen. Se crean con el precio de la primera combinación.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <ChipsSelector titulo="Talles nuevos" sugeridos={sinLosActuales(tallesSugeridos, tallesDelModelo)} seleccionados={nuevosTalles} onChange={cambiarTalles} />
                <ChipsSelector titulo="Colores nuevos" sugeridos={sinLosActuales(coloresSugeridos, coloresDelModelo)} seleccionados={nuevosColores} onChange={cambiarColores} />
              </div>

              {candidatas.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                  <div className="bg-surface-hover px-3 py-2 text-xs font-semibold text-text">
                    Se van a crear {combinacionesNuevas.length} combinaciones
                    {sacadas.size > 0 && <span className="font-normal text-text-dim"> ({sacadas.size} sacadas)</span>}
                  </div>
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-text-dim">
                      <tr>
                        <th className="px-3 py-2">Combinación</th>
                        <th className="px-3 py-2">Stock inicial</th>
                        <th className="px-3 py-2">Código de barras</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {combinacionesNuevas.map((c) => (
                        <tr key={c.clave} className="border-t border-border">
                          <td className="px-3 py-1.5 font-medium text-text">{[c.talle, c.color].filter(Boolean).join(" · ")}</td>
                          <td className="px-3 py-1.5">
                            <input type="number" min="0" step="1" placeholder="0" value={stocks[c.clave] ?? ""} onChange={(e) => setStocks({ ...stocks, [c.clave]: e.target.value })} className={INPUT_CELDA} />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="text" placeholder="Opcional" value={codigos[c.clave] ?? ""} onChange={(e) => setCodigos({ ...codigos, [c.clave]: e.target.value })} className="w-40 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:outline-none" />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button type="button" onClick={() => sacar(c.clave)} aria-label="Sacar esta combinación" className="rounded-lg px-2 py-1 text-text-dim hover:bg-surface-hover hover:text-danger">
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(nuevosTalles.length > 0 || nuevosColores.length > 0) && candidatas.length === 0 && (
                <p className="mt-3 text-xs text-text-dim">No falta ninguna combinación para lo que elegiste.</p>
              )}

              <button type="button" onClick={agregar} disabled={ocupado || combinacionesNuevas.length === 0} className={`${BOTON} mt-3`}>
                {combinacionesNuevas.length > 0 ? `Crear ${combinacionesNuevas.length} combinaciones` : "Crear combinaciones"}
              </button>
            </section>
          </div>
        )}

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}