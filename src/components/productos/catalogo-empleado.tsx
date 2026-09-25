"use client";

// Catálogo de productos para el EMPLEADO: solo lectura, sin costos ni
// ganancias. La API ya no le manda el costo (ver /api/productos), así que
// esto es solo la vista. El admin ve productos-admin.tsx.

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search, ImageIcon } from "lucide-react";
import Select from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatCurrency, toArs } from "@/lib/currency";

interface ProductoCatalogo {
  id: number;
  nombre: string;
  codigoBarras?: string | null;
  fotoUrl?: string | null;
  contenidoMl?: number | null;
  stockActual: number;
  stockMinimo?: number;
  monedaPrecio: "USD" | "ARS";
  precioVenta: number;
  precioMayorista?: number | null;
  precioOferta?: number | null;
  activo: boolean;
  marcaId?: number | null;
  categoriaId?: number | null;
  marca?: { nombre: string } | null;
  categoria?: { nombre: string } | null;
}

interface Opcion {
  id: number;
  nombre: string;
}

const POR_PAGINA = 20;

function stockEstado(p: ProductoCatalogo) {
  if (p.stockActual <= 0) return { texto: "Sin stock", clase: "bg-danger/10 text-danger" };
  if (p.stockMinimo != null && p.stockActual <= p.stockMinimo) {
    return { texto: `${p.stockActual} (bajo)`, clase: "bg-warning/10 text-warning" };
  }
  return { texto: String(p.stockActual), clase: "bg-success/10 text-success" };
}

export default function CatalogoEmpleado() {
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [cotizacion, setCotizacion] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [soloConStock, setSoloConStock] = useState(false);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    Promise.all([
      fetch("/api/productos?all=true").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/configuracion").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/marcas").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/categorias").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([dataProductos, config, dataMarcas, dataCategorias]) => {
        setProductos((dataProductos.items ?? []).filter((p: ProductoCatalogo) => p.activo));
        setCotizacion(Number(config?.cotizacionUSD) || 1);
        setMarcas(Array.isArray(dataMarcas) ? dataMarcas : dataMarcas?.items ?? []);
        setCategorias(Array.isArray(dataCategorias) ? dataCategorias : dataCategorias?.items ?? []);
      })
      .catch(() => setError("No se pudieron cargar los productos. Recargá la página."))
      .finally(() => setCargando(false));
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (q) {
        const texto = `${p.nombre} ${p.marca?.nombre ?? ""} ${p.codigoBarras ?? ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      if (marcaId && String(p.marcaId) !== marcaId) return false;
      if (categoriaId && String(p.categoriaId) !== categoriaId) return false;
      if (soloConStock && p.stockActual <= 0) return false;
      return true;
    });
  }, [productos, busqueda, marcaId, categoriaId, soloConStock]);

  useEffect(() => setPagina(1), [busqueda, marcaId, categoriaId, soloConStock]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visibles = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const precio = (valor: number | null | undefined, p: ProductoCatalogo) =>
    valor != null && valor > 0 ? formatCurrency(toArs(valor, p.monedaPrecio, cotizacion), "ARS") : "—";

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Productos</h1>
        <p className="text-sm text-text-dim">Precios y stock para atender a los clientes</p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-3 md:flex-row md:items-center">
        <div className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Buscar por nombre, marca o código"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <Select
          value={marcaId}
          onChange={setMarcaId}
          options={[{ value: "", label: "Todas las marcas" }, ...marcas.map((m) => ({ value: String(m.id), label: m.nombre }))]}
        />
        <Select
          value={categoriaId}
          onChange={setCategoriaId}
          options={[
            { value: "", label: "Todas las categorías" },
            ...categorias.map((c) => ({ value: String(c.id), label: c.nombre })),
          ]}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-dim">
          <input
            type="checkbox"
            checked={soloConStock}
            onChange={(e) => setSoloConStock(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Solo con stock
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {cargando ? (
          <p className="px-4 py-10 text-center text-sm text-text-dim">Cargando productos...</p>
        ) : visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-dim">
            No hay productos que coincidan. Probá con otra búsqueda o sacá algún filtro.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visibles.map((p) => {
              const stock = stockEstado(p);
              const hayOferta = p.precioOferta != null && p.precioOferta > 0;
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
                    {p.fotoUrl ? (
                      <Image src={p.fotoUrl} alt={p.nombre} width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-text-dim" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{p.nombre}</p>
                    <p className="truncate text-xs text-text-dim">
                      {[p.marca?.nombre, p.categoria?.nombre, p.contenidoMl ? `${p.contenidoMl} ml` : null]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>

                  <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline", stock.clase)}>
                    {stock.texto}
                  </span>

                  <div className="shrink-0 text-right">
                    {hayOferta ? (
                      <>
                        <p className="text-sm font-semibold text-success">{precio(p.precioOferta, p)}</p>
                        <p className="text-xs text-text-dim line-through">{precio(p.precioVenta, p)}</p>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-text">{precio(p.precioVenta, p)}</p>
                    )}
                    {p.precioMayorista != null && p.precioMayorista > 0 && (
                      <p className="text-xs text-text-dim">Mayorista {precio(p.precioMayorista, p)}</p>
                    )}
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium sm:hidden", stock.clase)}>
                      Stock {stock.texto}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-text-dim">
          <span>
            {filtrados.length} productos, página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagina === 1}
              onClick={() => setPagina((n) => n - 1)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 hover:bg-surface-hover disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((n) => n + 1)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 hover:bg-surface-hover disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
