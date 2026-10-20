"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type Opcion = { id: number; nombre: string };
type Cambio = "NO" | "FECHA" | "ULTIMA";

const CLAVE_ULTIMA = "etiquetas:ultimaImpresion";

export function EtiquetasModal({ abierto, onCerrar, ids }: { abierto: boolean; onCerrar: () => void; ids?: number[] }) {
  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [marcaId, setMarcaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tamano, setTamano] = useState<"CHICA" | "MEDIANA">("CHICA");
  const [tipoPrecio, setTipoPrecio] = useState<"MINORISTA" | "MAYORISTA">("MINORISTA");
  const [cambio, setCambio] = useState<Cambio>("NO");
  const [fecha, setFecha] = useState("");
  const [codigo, setCodigo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [ultima, setUltima] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setUltima(localStorage.getItem(CLAVE_ULTIMA));
    Promise.all([fetch("/api/marcas"), fetch("/api/categorias")])
        .then(([m, c]) => Promise.all([m.json(), c.json()]))
        .then(([m, c]) => {
        setMarcas(Array.isArray(m) ? m : m.items ?? []);
        setCategorias(Array.isArray(c) ? c : c.items ?? []);
        })
        .catch(() => {});
  }, [abierto]);

  if (!abierto) return null;

  async function generar() {
    const desde = cambio === "FECHA" ? fecha : cambio === "ULTIMA" ? ultima : null;
    if (cambio !== "NO" && !desde) {
      toast.error(cambio === "FECHA" ? "Elegí una fecha." : "Todavía no imprimiste etiquetas desde este navegador.");
      return;
    }
    const params = new URLSearchParams({ tamano, tipoPrecio });
    if (ids?.length) params.set("ids", ids.join(","));
    if (marcaId) params.set("marcaId", marcaId);
    if (categoriaId) params.set("categoriaId", categoriaId);
    if (desde) params.set("desde", desde);
    if (codigo) params.set("codigo", "1");

    setGenerando(true);
    try {
      const res = await fetch(`/api/productos/etiquetas?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "No se pudo generar el PDF.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      localStorage.setItem(CLAVE_ULTIMA, new Date().toISOString());
      onCerrar();
    } finally {
      setGenerando(false);
    }
  }

  const campo = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text">Etiquetas de góndola</h2>

        {ids?.length ? <p className="text-sm text-text-dim">{ids.length} productos seleccionados.</p> : null}

        <div className="grid grid-cols-2 gap-3">
          <select className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className={campo} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <select className={campo} value={tamano} onChange={(e) => setTamano(e.target.value as "CHICA" | "MEDIANA")}>
            <option value="CHICA">Chica (24 por hoja)</option>
            <option value="MEDIANA">Mediana (10 por hoja)</option>
          </select>
          <select className={campo} value={tipoPrecio} onChange={(e) => setTipoPrecio(e.target.value as "MINORISTA" | "MAYORISTA")}>
            <option value="MINORISTA">Precio minorista</option>
            <option value="MAYORISTA">Precio mayorista</option>
          </select>
        </div>

        <div className="space-y-2">
          <select className={campo} value={cambio} onChange={(e) => setCambio(e.target.value as Cambio)}>
            <option value="NO">Todos los productos</option>
            <option value="FECHA">Solo con precio cambiado desde una fecha</option>
            <option value="ULTIMA">Solo con precio cambiado desde la última impresión</option>
          </select>
          {cambio === "FECHA" && <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />}
          {cambio === "ULTIMA" && (
            <p className="text-xs text-text-dim">
              {ultima ? `Última impresión: ${new Date(ultima).toLocaleString("es-AR")}` : "Sin impresiones previas en este navegador."}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={codigo} onChange={(e) => setCodigo(e.target.checked)} />
          Mostrar código de barras (número)
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-border px-4 py-2 text-sm text-text">Cancelar</button>
          <button type="button" onClick={generar} disabled={generando} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {generando ? "Generando…" : "Generar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}