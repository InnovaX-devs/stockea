"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import Select from "@/components/ui/select";
import { GrillaCantidades, cantidadDe, sumarCantidades } from "@/components/ui/grilla-cantidades";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { agruparResultados } from "@/lib/agrupar-variantes";
import { CANTIDAD_MAXIMA, MAX_ITEMS } from "@/lib/transferencias-constantes";
import { enviarTransferencia } from "@/app/(dashboard)/transferencias/actions";

type Sucursal = { id: number; nombre: string };

/** Lo que devuelve /api/productos/buscar: `stockActual` es el de la sucursal en la que se trabaja (el origen). */
type ProductoBuscado = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  marca: { nombre: string } | null;
  modeloId?: number | null;
  modeloNombre?: string | null;
  talle?: string | null;
  color?: string | null;
};

type Linea = { productoId: number; nombre: string; marca: string | null; disponible: number; cantidad: string };

/** Un modelo de ropa con su grilla talle × color (RV-6, #65). */
type BloqueModelo = {
  modeloId: number;
  nombre: string;
  marca: string | null;
  variantes: ProductoBuscado[];
  /** Cantidad a enviar por productoId (texto, para poder dejar la celda vacía). */
  cantidades: Record<number, string>;
};

const INPUT =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary";

export function NuevaTransferenciaForm({ origen, destinos }: { origen: Sucursal; destinos: Sucursal[] }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  // Con una sola sucursal posible de destino ya viene elegida.
  const [destinoId, setDestinoId] = useState(destinos.length === 1 ? String(destinos[0].id) : "");
  const [observaciones, setObservaciones] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [bloques, setBloques] = useState<BloqueModelo[]>([]);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoBuscado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const consulta = useDebounce(busqueda.trim(), 250);

  useEffect(() => {
    if (!consulta) return;
    const controller = new AbortController();
    const buscar = async () => {
      setBuscando(true);
      try {
        // agrupar=1: trae más resultados para juntar las combinaciones de cada modelo en una fila.
        const res = await fetch(`/api/productos/buscar?agrupar=1&q=${encodeURIComponent(consulta)}`, { signal: controller.signal });
        const data = res.ok ? await res.json() : { items: [] };
        setResultados(data.items ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        if (!controller.signal.aborted) setBuscando(false);
      }
    };
    void buscar();
    return () => controller.abort();
  }, [consulta]);

  useEffect(() => {
    function clickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", clickFuera);
    return () => document.removeEventListener("mousedown", clickFuera);
  }, []);

  const filas = useMemo(() => agruparResultados(resultados as never[], 10) as ReturnType<typeof agruparResultados>, [resultados]);

  function limpiarBusqueda() {
    setBusqueda("");
    setResultados([]);
    setAbierto(false);
  }

  function agregar(p: ProductoBuscado) {
    limpiarBusqueda();
    if (p.stockActual <= 0) return void toast.error(`"${p.nombre}" no tiene stock en ${origen.nombre}.`);
    setLineas((actuales) => {
      const existente = actuales.find((l) => l.productoId === p.id);
      if (existente) {
        return actuales.map((l) =>
          l.productoId === p.id ? { ...l, cantidad: String(Math.min(Number(l.cantidad || 0) + 1, l.disponible)) } : l
        );
      }
      return [...actuales, { productoId: p.id, nombre: p.nombre, marca: p.marca?.nombre ?? null, disponible: p.stockActual, cantidad: "1" }];
    });
  }

  /**
   * Agrega un modelo con su grilla. Trae TODAS las combinaciones del modelo con
   * el stock del origen. Si `sumarA` viene (lector de código de barras de una
   * combinación), suma 1 en esa celda.
   */
  async function agregarModelo(modeloId: number, nombre: string, marca: string | null, sumarA?: number) {
    limpiarBusqueda();

    const existente = bloques.find((b) => b.modeloId === modeloId);
    if (existente) {
      if (sumarA == null) return void toast.info(`"${nombre}" ya está cargado: completá su grilla más abajo.`);
      const v = existente.variantes.find((x) => x.id === sumarA);
      if (!v || v.stockActual <= 0) return void toast.error(`"${v?.nombre ?? nombre}" no tiene stock en ${origen.nombre}.`);
      setBloques((prev) =>
        prev.map((b) =>
          b.modeloId === modeloId
            ? { ...b, cantidades: { ...b.cantidades, [sumarA]: String(Math.min(cantidadDe(b.cantidades, sumarA) + 1, v.stockActual)) } }
            : b
        )
      );
      return;
    }

    try {
      const res = await fetch(`/api/productos/buscar?modeloId=${modeloId}`);
      const data = await res.json();
      const variantes: ProductoBuscado[] = res.ok ? data.items ?? [] : [];
      if (variantes.length === 0) return void toast.error(`"${nombre}" no tiene combinaciones de talle y color.`);
      if (variantes.every((v) => v.stockActual <= 0)) return void toast.error(`"${nombre}" no tiene stock en ${origen.nombre}.`);

      const inicial = sumarA != null ? variantes.find((v) => v.id === sumarA) : undefined;
      setBloques((prev) => [
        ...prev,
        { modeloId, nombre, marca, variantes, cantidades: inicial && inicial.stockActual > 0 ? { [inicial.id]: "1" } : {} },
      ]);
    } catch {
      toast.error("No se pudo cargar el modelo. Probá de nuevo.");
    }
  }

  const cantidadValida = (l: Linea) => {
    const n = Number(l.cantidad);
    return Number.isInteger(n) && n >= 1 && n <= Math.min(l.disponible, CANTIDAD_MAXIMA);
  };
  const lineasInvalidas = lineas.some((l) => !cantidadValida(l));

  // Una línea por combinación con cantidad > 0 (las celdas ya vienen topeadas al stock).
  const itemsGrilla = useMemo(
    () =>
      bloques.flatMap((b) =>
        b.variantes.map((v) => ({ productoId: v.id, cantidad: cantidadDe(b.cantidades, v.id) })).filter((i) => i.cantidad > 0)
      ),
    [bloques]
  );

  const totalUnidades = useMemo(
    () =>
      lineas.reduce((n, l) => n + (cantidadValida(l) ? Number(l.cantidad) : 0), 0) +
      itemsGrilla.reduce((n, i) => n + i.cantidad, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, itemsGrilla]
  );
  const totalItems = lineas.length + itemsGrilla.length;
  const excedeItems = totalItems > MAX_ITEMS;
  const puedeEnviar = destinoId !== "" && totalItems > 0 && !lineasInvalidas && !excedeItems && !enviando;

  function enviar() {
    if (!puedeEnviar) return;
    startTransition(async () => {
      const r = await enviarTransferencia({
        destinoId: Number(destinoId),
        observaciones: observaciones.trim() || null,
        items: [...lineas.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) })), ...itemsGrilla],
      });
      if (!r.success) return void toast.error(r.error);
      const destino = destinos.find((d) => d.id === Number(destinoId));
      toast.success(`Transferencia #${r.numero} enviada${destino ? ` a ${destino.nombre}` : ""}. El stock entra cuando la reciban.`);
      router.push("/transferencias?vista=historial");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-dim">Sale de</p>
          <p className="rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm font-medium text-text">{origen.nombre}</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-dim">Va a</p>
          <Select
            value={destinoId}
            onChange={setDestinoId}
            options={[{ value: "", label: "Elegí una sucursal" }, ...destinos.map((d) => ({ value: String(d.id), label: d.nombre }))]}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-text">Productos</p>

        <div ref={contenedorRef} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAbierto(false);
              // Lector de código de barras: Enter con coincidencia exacta agrega el producto.
              if (e.key === "Enter") {
                e.preventDefault();
                const exacto = resultados.find((p) => p.codigoBarras && p.codigoBarras === busqueda.trim());
                if (exacto) {
                  if (exacto.modeloId != null) {
                    void agregarModelo(exacto.modeloId, exacto.modeloNombre?.trim() || exacto.nombre, exacto.marca?.nombre ?? null, exacto.id);
                  } else {
                    agregar(exacto);
                  }
                  return;
                }
                if (filas.length === 1) {
                  const unica = filas[0];
                  if (unica.tipo === "producto") agregar(unica.producto as unknown as ProductoBuscado);
                  else void agregarModelo(unica.modeloId, unica.nombre, unica.marca);
                }
              }
            }}
            placeholder={`Buscar por nombre, modelo o código de barras (stock de ${origen.nombre})...`}
            className={`${INPUT} pl-9`}
            aria-label="Buscar producto"
          />
          {buscando && consulta && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-dim" />}

          {abierto && consulta && !buscando && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white py-1 text-sm shadow-lg">
              {filas.length === 0 ? (
                <li className="px-3 py-2 text-text-dim">Sin resultados.</li>
              ) : (
                filas.map((fila) =>
                  fila.tipo === "producto" ? (
                    <li key={`p-${fila.producto.id}`}>
                      <button
                        type="button"
                        onClick={() => agregar(fila.producto as unknown as ProductoBuscado)}
                        disabled={fila.producto.stockActual <= 0}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate text-text">
                          {fila.producto.nombre}
                          {fila.producto.marca && <span className="ml-1.5 text-xs text-text-dim">{fila.producto.marca.nombre}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-text-dim">
                          {fila.producto.stockActual > 0 ? `${fila.producto.stockActual} disp.` : "Sin stock"}
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={`m-${fila.modeloId}`}>
                      <button
                        type="button"
                        onClick={() => void agregarModelo(fila.modeloId, fila.nombre, fila.marca)}
                        disabled={fila.stock <= 0}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate text-text">
                          {fila.nombre}
                          {fila.marca && <span className="ml-1.5 text-xs text-text-dim">{fila.marca}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-text-dim">
                          {fila.stock > 0 ? `${fila.variantes.length} comb. · ${fila.stock} disp. · grilla` : "Sin stock"}
                        </span>
                      </button>
                    </li>
                  )
                )
              )}
            </ul>
          )}
        </div>

        {totalItems === 0 && bloques.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-dim">Buscá y agregá los productos que salen de {origen.nombre}.</p>
        ) : null}

        {/* Modelos con grilla talle × color */}
        {bloques.map((b) => {
          const unidades = sumarCantidades(b.cantidades);
          return (
            <div key={b.modeloId} className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">
                    {b.nombre}
                    {b.marca && <span className="ml-1.5 text-xs font-normal text-text-dim">{b.marca}</span>}
                  </p>
                  <p className="text-xs text-text-dim">
                    {unidades} {unidades === 1 ? "unidad" : "unidades"} a enviar · El número chico es lo disponible en {origen.nombre}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBloques((prev) => prev.filter((x) => x.modeloId !== b.modeloId))}
                  aria-label={`Quitar ${b.nombre}`}
                  className="shrink-0 cursor-pointer text-text-dim hover:text-danger"
                >
                  <X size={18} />
                </button>
              </div>
              <GrillaCantidades
                variantes={b.variantes}
                cantidades={b.cantidades}
                onCambiar={(id, valor) =>
                  setBloques((prev) =>
                    prev.map((x) => (x.modeloId === b.modeloId ? { ...x, cantidades: { ...x.cantidades, [id]: valor } } : x))
                  )
                }
                maximo={(v) => Math.min(Math.max(v.stockActual, 0), CANTIDAD_MAXIMA)}
                detalle={(v) => <>Disp. {Math.max(v.stockActual, 0)}</>}
              />
            </div>
          );
        })}

        {/* Productos sueltos */}
        {lineas.length > 0 && (
          <ul className="divide-y divide-border">
            {lineas.map((l) => {
              const valida = cantidadValida(l);
              return (
                <li key={l.productoId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{l.nombre}</p>
                    <p className="text-xs text-text-dim">
                      {l.marca ? `${l.marca} · ` : ""}Disponible en {origen.nombre}: <span className="font-mono">{l.disponible}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={l.disponible}
                      step={1}
                      value={l.cantidad}
                      onChange={(e) =>
                        setLineas((actuales) => actuales.map((x) => (x.productoId === l.productoId ? { ...x, cantidad: e.target.value } : x)))
                      }
                      aria-label={`Cantidad de ${l.nombre}`}
                      aria-invalid={!valida}
                      className={`w-24 rounded-lg border bg-white px-3 py-2 text-right font-mono text-sm text-text focus:outline-none focus:ring-1 ${
                        valida ? "border-border focus:ring-primary" : "border-danger focus:ring-danger"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setLineas((actuales) => actuales.filter((x) => x.productoId !== l.productoId))}
                      aria-label={`Quitar ${l.nombre}`}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {!valida && <p className="w-full text-xs text-danger">Ingresá una cantidad entera entre 1 y {l.disponible}.</p>}
                </li>
              );
            })}
          </ul>
        )}

        {excedeItems && (
          <p className="text-xs text-danger">Una transferencia puede tener hasta {MAX_ITEMS} productos (combinaciones incluidas).</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white p-4">
        <label htmlFor="observaciones" className="mb-1.5 block text-xs font-medium text-text-dim">
          Observaciones (opcional)
        </label>
        <textarea
          id="observaciones"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Ej.: lo lleva el cadete, caja 1 de 2..."
          className={INPUT}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-dim">
          {totalItems > 0 && (
            <>
              <span className="font-mono font-semibold text-text">{totalUnidades}</span> {totalUnidades === 1 ? "unidad" : "unidades"} en{" "}
              {totalItems} {totalItems === 1 ? "producto" : "productos"}. El stock sale de {origen.nombre} al enviar.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={enviar}
          disabled={!puedeEnviar}
          className="bg-grad flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar transferencia
        </button>
      </div>
    </div>
  );
}