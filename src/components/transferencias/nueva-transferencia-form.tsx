"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Select from "@/components/ui/select";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { CANTIDAD_MAXIMA } from "@/lib/transferencias-constantes";
import { enviarTransferencia } from "@/app/(dashboard)/transferencias/actions";

type Sucursal = { id: number; nombre: string };

/** Lo que devuelve /api/productos/buscar: `stockActual` es el de la sucursal en la que se trabaja (el origen). */
type ProductoBuscado = {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  marca: { nombre: string } | null;
};

type Linea = { productoId: number; nombre: string; marca: string | null; disponible: number; cantidad: string };

const INPUT =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary";

export function NuevaTransferenciaForm({ origen, destinos }: { origen: Sucursal; destinos: Sucursal[] }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  // Con una sola sucursal posible de destino ya viene elegida.
  const [destinoId, setDestinoId] = useState(destinos.length === 1 ? String(destinos[0].id) : "");
  const [observaciones, setObservaciones] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);

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
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(consulta)}`, { signal: controller.signal });
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

  function agregar(p: ProductoBuscado) {
    setBusqueda("");
    setResultados([]);
    setAbierto(false);
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

  const cantidadValida = (l: Linea) => {
    const n = Number(l.cantidad);
    return Number.isInteger(n) && n >= 1 && n <= Math.min(l.disponible, CANTIDAD_MAXIMA);
  };
  const lineasInvalidas = lineas.some((l) => !cantidadValida(l));
  const totalUnidades = useMemo(() => lineas.reduce((n, l) => n + (cantidadValida(l) ? Number(l.cantidad) : 0), 0), [lineas]);
  const puedeEnviar = destinoId !== "" && lineas.length > 0 && !lineasInvalidas && !enviando;

  function enviar() {
    if (!puedeEnviar) return;
    startTransition(async () => {
      const r = await enviarTransferencia({
        destinoId: Number(destinoId),
        observaciones: observaciones.trim() || null,
        items: lineas.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) })),
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
                const elegido = exacto ?? (resultados.length === 1 ? resultados[0] : undefined);
                if (elegido) agregar(elegido);
              }
            }}
            placeholder={`Buscar por nombre o código de barras (stock de ${origen.nombre})...`}
            className={`${INPUT} pl-9`}
            aria-label="Buscar producto"
          />
          {buscando && consulta && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-dim" />}

          {abierto && consulta && !buscando && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white py-1 text-sm shadow-lg">
              {resultados.length === 0 ? (
                <li className="px-3 py-2 text-text-dim">Sin resultados.</li>
              ) : (
                resultados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => agregar(p)}
                      disabled={p.stockActual <= 0}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate text-text">
                        {p.nombre}
                        {p.marca && <span className="ml-1.5 text-xs text-text-dim">{p.marca.nombre}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-text-dim">{p.stockActual > 0 ? `${p.stockActual} disp.` : "Sin stock"}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {lineas.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-dim">Buscá y agregá los productos que salen de {origen.nombre}.</p>
        ) : (
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
                  {!valida && (
                    <p className="w-full text-xs text-danger">Ingresá una cantidad entera entre 1 y {l.disponible}.</p>
                  )}
                </li>
              );
            })}
          </ul>
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
          {lineas.length > 0 && (
            <>
              <span className="font-mono font-semibold text-text">{totalUnidades}</span> {totalUnidades === 1 ? "unidad" : "unidades"} en{" "}
              {lineas.length} {lineas.length === 1 ? "producto" : "productos"}. El stock sale de {origen.nombre} al enviar.
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