"use client";

// Pantalla de Productos del ADMIN (con costos, ganancias y edición).
// El empleado ve src/components/productos/catalogo-empleado.tsx.

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { ProductoFormModal, type ProductoFormData } from "@/components/productos/producto-form-modal";
import { PdfGeneratorModal } from "@/components/productos/pdf-generator-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileText, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Pencil, ImageIcon, Ban, CheckCircle, X } from "lucide-react";
import { toArs, toUsd, formatCurrency } from "@/lib/currency";
import Select from "@/components/ui/select";
import { ProductoDetalleModal } from "@/components/productos/producto-detalle-modal";



interface Producto {
  id: string;
  nombre: string;
  codigoBarras?: string | null;
  ubicacionDeposito?: string | null;
  fotoUrl?: string | null;
  contenidoMl?: number | null;
  marca?: { nombre: string } | null;
  marcaId?: number | null;
  categoriaId?: number | null;
  stockActual: number;
  stockMinimo?: number;
  destacado?: boolean;
  precioCosto: number;
  precioVenta: number;
  precioMayorista?: number | null;
  precioOferta?: number | null;
  monedaPrecio: "USD" | "ARS";
  activo: boolean;
}

interface Marca {
  id: string | number;
  nombre: string;
}

interface Categoria {
  id: string | number;
  nombre: string;
}

type FiltroStock = "todos" | "sin_stock" | "stock_bajo";
type FiltroFoto = "todas" | "con_foto" | "sin_foto";
type FiltroEstado = "activos" | "inactivos" | "todos";
type OrdenarPor =
  | ""
  | "nombre_asc"
  | "nombre_desc"
  | "stock_asc"
  | "stock_desc"
  | "ganancia_asc"
  | "ganancia_desc";

export default function ProductosAdmin() {
  const [busqueda, setBusqueda] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const elementosPorPagina = 15;

  // Estados para manejo del Modal y la API
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productoEditar, setProductoEditar] = useState<ProductoFormData | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);

  // Estados para filtros auxiliares (marca / categoría)
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  // Estados del panel de filtros
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroMarcaId, setFiltroMarcaId] = useState("");
  const [filtroCategoriaId, setFiltroCategoriaId] = useState("");
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
  const [filtroFoto, setFiltroFoto] = useState<FiltroFoto>("todas");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("activos");
  const [ordenarPor, setOrdenarPor] = useState<OrdenarPor>("");

  const [monedaVista, setMonedaVista] = useState<"USD" | "ARS">("ARS");

  // junto a los demás useState:
  const [productoDetalle, setProductoDetalle] = useState<Producto | null>(null);

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [desactivandoId, setDesactivandoId] = useState<string | null>(null);
  const [productoADesactivar, setProductoADesactivar] = useState<Producto | null>(null);
  const [configProducto, setConfigProducto] = useState({
    cotizacionUSD: 1200,
    usaCotizacionUSD: false,
  });
  const cotizacion = configProducto.cotizacionUSD;

  useEffect(() => {
    fetch("/api/configuracion")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setConfigProducto({
            cotizacionUSD: data.cotizacionUSD ?? 1200,
            usaCotizacionUSD: data.usaCotizacionUSD ?? false,
          });
          setMonedaVista(data.usaCotizacionUSD ? "USD" : "ARS");
        }
      })
      .catch((error) => console.error("Error al cargar configuración:", error));
  }, []);

  // Cargar marcas y categorías para los selects de filtro
  useEffect(() => {
    Promise.all([fetch("/api/marcas"), fetch("/api/categorias")])
      .then(async ([resMarcas, resCategorias]) => {
        if (resMarcas.ok) {
          const dataM = await resMarcas.json();
          setMarcas(Array.isArray(dataM) ? dataM : dataM.items || []);
        }
        if (resCategorias.ok) {
          const dataC = await resCategorias.json();
          setCategorias(Array.isArray(dataC) ? dataC : dataC.items || []);
        }
      })
      .catch((error) => console.error("Error al cargar marcas/categorías:", error));
  }, []);

  // Cargar productos desde la API
  const cargarProductos = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch("/api/productos?all=true");
      if (res.ok) {
        const data = await res.json();
        // Si la API devuelve un objeto paginado { items, total }, tomamos items
        setProductos(data.items || data);
      }
    } catch (error) {
      console.error("Error al cargar productos:", error);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  // Reiniciar a la página 1 cuando cambia cualquier filtro
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroMarcaId, filtroCategoriaId, filtroStock, filtroFoto, filtroEstado, ordenarPor]);

  // 1. Filtrar por búsqueda de texto (nombre o marca)
  const productosBusqueda = useMemo(() => {
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.marca?.nombre.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [busqueda, productos]);

  // Conteos para los accesos rápidos (sobre productos activos + búsqueda, sin aplicar filtro de stock)
  const conteoSinStock = useMemo(
    () => productosBusqueda.filter((p) => p.activo && p.stockActual <= 0).length,
    [productosBusqueda]
  );
  // Ahora
  const conteoStockBajo = useMemo(
    () =>
      productosBusqueda.filter(
        (p) =>
          p.activo &&
          p.stockActual > 0 &&
          p.stockMinimo != null &&
          p.stockActual <= p.stockMinimo
      ).length,
    [productosBusqueda]
  );

  // 2. Aplicar filtros del panel + orden
  const productosFiltrados = useMemo(() => {
    let resultado = productosBusqueda.filter((p) => {
      if (filtroEstado === "activos" && !p.activo) return false;
      if (filtroEstado === "inactivos" && p.activo) return false;

      if (filtroMarcaId && String(p.marcaId ?? "") !== filtroMarcaId) return false;
      if (filtroCategoriaId && String(p.categoriaId ?? "") !== filtroCategoriaId) return false;

      if (filtroStock === "sin_stock" && p.stockActual > 0) return false;
      if (
        filtroStock === "stock_bajo" &&
        !(
          p.stockActual > 0 &&
          p.stockMinimo != null &&
          p.stockActual <= p.stockMinimo
        )
      )
        return false;

      if (filtroFoto === "con_foto" && !p.fotoUrl) return false;
      if (filtroFoto === "sin_foto" && p.fotoUrl) return false;

      return true;
    });

    if (ordenarPor) {
      resultado = [...resultado].sort((a, b) => {
        switch (ordenarPor) {
          case "nombre_asc":
            return a.nombre.localeCompare(b.nombre);
          case "nombre_desc":
            return b.nombre.localeCompare(a.nombre);
          case "stock_asc":
            return a.stockActual - b.stockActual;
          case "stock_desc":
            return b.stockActual - a.stockActual;
          case "ganancia_asc":
          case "ganancia_desc": {
            const gananciaA =
              a.precioCosto > 0 ? (a.precioVenta - a.precioCosto) / a.precioCosto : 0;
            const gananciaB =
              b.precioCosto > 0 ? (b.precioVenta - b.precioCosto) / b.precioCosto : 0;
            return ordenarPor === "ganancia_asc" ? gananciaA - gananciaB : gananciaB - gananciaA;
          }
          default:
            return 0;
        }
      });
    }

    return resultado;
  }, [
    productosBusqueda,
    filtroEstado,
    filtroMarcaId,
    filtroCategoriaId,
    filtroStock,
    filtroFoto,
    ordenarPor,
  ]);

  // Cantidad de filtros activos (para el badge del botón y "Limpiar filtros")
  const filtrosActivosCount = useMemo(() => {
    let count = 0;
    if (filtroMarcaId) count++;
    if (filtroCategoriaId) count++;
    if (filtroStock !== "todos") count++;
    if (filtroFoto !== "todas") count++;
    if (filtroEstado !== "activos") count++;
    if (ordenarPor) count++;
    return count;
  }, [filtroMarcaId, filtroCategoriaId, filtroStock, filtroFoto, filtroEstado, ordenarPor]);

  const limpiarFiltros = () => {
    setFiltroMarcaId("");
    setFiltroCategoriaId("");
    setFiltroStock("todos");
    setFiltroFoto("todas");
    setFiltroEstado("activos");
    setOrdenarPor("");
  };

  // 3. Cálculos para las 3 Tarjetas Resumen (ARS y USD) — sobre el resultado ya filtrado
  const resumen = useMemo(() => {
    let costoTotalUSD = 0;
    let ventaTotalUSD = 0;

    productosFiltrados.forEach((p) => {
      const costoEnUSD =
        p.monedaPrecio === "USD" ? p.precioCosto : p.precioCosto / configProducto.cotizacionUSD;
      const ventaEnUSD =
        p.monedaPrecio === "USD" ? p.precioVenta : p.precioVenta / configProducto.cotizacionUSD;

      costoTotalUSD += costoEnUSD * p.stockActual;
      ventaTotalUSD += ventaEnUSD * p.stockActual;
    });

    const gananciaTotalUSD = ventaTotalUSD - costoTotalUSD;

    return {
      costoUSD: costoTotalUSD,
      costoARS: costoTotalUSD * configProducto.cotizacionUSD,
      ventaUSD: ventaTotalUSD,
      ventaARS: ventaTotalUSD * configProducto.cotizacionUSD,
      gananciaUSD: gananciaTotalUSD,
      gananciaARS: gananciaTotalUSD * configProducto.cotizacionUSD,
    };
  }, [productosFiltrados, configProducto.cotizacionUSD]);

  // 4. Paginación
  const totalPaginas = Math.ceil(productosFiltrados.length / elementosPorPagina) || 1;
  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * elementosPorPagina;
    return productosFiltrados.slice(inicio, inicio + elementosPorPagina);
  }, [productosFiltrados, paginaActual]);

  const formatMoney = (amount: number, currency: "USD" | "ARS") => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleAbrirCrear = () => {
    setProductoEditar(null);
    setIsModalOpen(true);
  };

  function mapProductoToFormData(producto: Producto): ProductoFormData {
    return {
      id: String(producto.id),
      nombre: producto.nombre ?? "",
      codigoBarras: producto.codigoBarras ?? "",
      ubicacion: producto.ubicacionDeposito ?? "",
      marcaId: producto.marcaId ? String(producto.marcaId) : "",
      categoriaId: producto.categoriaId ? String(producto.categoriaId) : "",
      contenidoMl: producto.contenidoMl ?? "",
      stockActual: producto.stockActual ?? "",
      stockMinimo: producto.stockMinimo ?? "",
      destacado: producto.destacado ?? false,
      monedaPrecio: producto.monedaPrecio ?? "USD",
      precioCosto: producto.precioCosto ?? "",
      precioVenta: producto.precioVenta ?? "",
      precioMayorista: producto.precioMayorista ?? "",
      precioOferta: producto.precioOferta ?? "",
      fotoUrl: producto.fotoUrl ?? "",
    };
  }

  const handleAbrirEditar = (producto: Producto) => {
    setProductoEditar(mapProductoToFormData(producto));
    setIsModalOpen(true);
  };

  function handleCambiarEstado(producto: Producto) {
    setProductoADesactivar(producto);
  }

  async function confirmarCambiarEstado() {
    if (!productoADesactivar) return;

    const nuevoEstado = !productoADesactivar.activo;

    setDesactivandoId(productoADesactivar.id);

    try {
      const res = await fetch(`/api/productos/${productoADesactivar.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: nuevoEstado }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo cambiar el estado del producto");
      }

      await cargarProductos();
      setProductoADesactivar(null);
    } catch (err) {
      console.warn("Error al cambiar estado del producto:", err);
      alert(
        err instanceof Error
          ? err.message
          : "No se pudo cambiar el estado del producto"
      );
    } finally {
      setDesactivandoId(null);
    }
  }

  const inicioRango = productosFiltrados.length === 0 ? 0 : (paginaActual - 1) * elementosPorPagina + 1;
  const finRango = Math.min(paginaActual * elementosPorPagina, productosFiltrados.length);

  return (
    <div className="p-4 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">
            Catálogo de Productos
          </h1>
          <p className="text-sm text-text-dim">
            Gestión de inventario y valores de venta
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
          <button
            type="button"
            onClick={() => setIsPdfModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover cursor-pointer"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">Generar PDF</span>
          </button>
          <Link
            href="/productos/actualizar-precios"
            className="bg-grad inline-flex items-center justify-center rounded-full px-4 py-2 text-center text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 cursor-pointer"
          >
            + Actualizar Precios
          </Link>
          <button
            type="button"
            onClick={handleAbrirCrear}
            className="bg-grad inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 cursor-pointer"
          >
            + Nuevo Producto
          </button>
        </div>
      </div>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">
            Stock a Costo
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-text sm:text-2xl">
            {formatMoney(resumen.costoARS, "ARS")}
          </p>
          {configProducto.usaCotizacionUSD && (
            <p className="mt-1 truncate text-xs font-medium text-text-dim">
              {formatMoney(resumen.costoUSD, "USD")}
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">
            Stock a Precio Venta
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-text sm:text-2xl">
            {formatMoney(resumen.ventaARS, "ARS")}
          </p>
          {configProducto.usaCotizacionUSD && (
            <p className="mt-1 text-xs font-medium text-text-dim">
              {formatMoney(resumen.ventaUSD, "USD")}
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">
            Ganancia Potencial
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-success sm:text-2xl">
            {formatMoney(resumen.gananciaARS, "ARS")}
          </p>
          {configProducto.usaCotizacionUSD && (
            <p className="mt-1 truncate text-xs font-medium text-success opacity-80">
              {formatMoney(resumen.gananciaUSD, "USD")}
            </p>
          )}
        </div>
      </div>

      {/* Búsqueda + Filtros */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center lg:flex-1">
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
              <input
                type="text"
                placeholder="Buscar por nombre o marca..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="button"
              onClick={() => setMostrarFiltros((prev) => !prev)}
              className={cn(
                "inline-flex items-center cursor-pointer justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                mostrarFiltros
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-text-dim hover:bg-surface-hover"
              )}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" />
              Filtros
              {filtrosActivosCount > 0 && (
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    mostrarFiltros ? "bg-white text-primary" : "bg-primary text-white"
                  )}
                >
                  {filtrosActivosCount}
                </span>
              )}
            </button>

            {configProducto.usaCotizacionUSD && (
            <div className="flex overflow-hidden rounded-lg border border-border md:hidden">
              <button
                type="button"
                onClick={() => setMonedaVista("USD")}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium transition-colors",
                  monedaVista === "USD"
                    ? "bg-primary text-white"
                    : "bg-white text-text-dim hover:bg-surface-hover"
                )}
              >
                USD
              </button>
              <button
                type="button"
                onClick={() => setMonedaVista("ARS")}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium transition-colors",
                  monedaVista === "ARS"
                    ? "bg-primary text-white"
                    : "bg-white text-text-dim hover:bg-surface-hover"
                )}
              >
                ARS
              </button>
            </div>
            )}

          </div>

          <p className="text-xs text-text-dim lg:text-right">
            Mostrando {inicioRango}–{finRango} de {productosFiltrados.length} productos
          </p>
        </div>

        {/* Panel de filtros — solo visible si mostrarFiltros es true */}
        {mostrarFiltros && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div>
                <label className="block text-xs font-medium text-text-dim">Marca</label>
                <Select
                    value={filtroMarcaId}
                    onChange={setFiltroMarcaId}
                    options={[
                      { value: "", label: "Todas las marcas" },
                      ...marcas.map((m) => ({ value: String(m.id), label: m.nombre })),
                    ]}
                    className="mt-1"
                  /> 
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">Categoría</label>
                <Select
                  value={filtroCategoriaId}
                  onChange={setFiltroCategoriaId}
                  options={[
                    { value: "", label: "Todas las categorías" },
                    ...categorias.map((c) => ({ value: String(c.id), label: c.nombre })),
                  ]}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">Stock</label>
                <Select
                  value={filtroStock}
                  onChange={(v) => setFiltroStock(v as FiltroStock)}
                  options={[
                    { value: "todos", label: "Todos" },
                    { value: "sin_stock", label: "Sin stock" },
                    { value: "stock_bajo", label: "Stock bajo" },
                  ]}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">Foto</label>
                <Select
                  value={filtroFoto}
                  onChange={(v) => setFiltroFoto(v as FiltroFoto)}
                  options={[
                    { value: "todas", label: "Todas" },
                    { value: "con_foto", label: "Con foto" },
                    { value: "sin_foto", label: "Sin foto" },
                  ]}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">Estado</label>
                <Select
                  value={filtroEstado}
                  onChange={(v) => setFiltroEstado(v as FiltroEstado)}
                  options={[
                    { value: "activos", label: "Activos" },
                    { value: "inactivos", label: "Inactivos" },
                    { value: "todos", label: "Todos" },
                  ]}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">Ordenar por</label>
                <Select
                  value={ordenarPor}
                  onChange={(v) => setOrdenarPor(v as OrdenarPor)}
                  options={[
                    { value: "", label: "Sin ordenar" },
                    { value: "nombre_asc", label: "Nombre (A-Z)" },
                    { value: "nombre_desc", label: "Nombre (Z-A)" },
                    { value: "stock_asc", label: "Stock (menor a mayor)" },
                    { value: "stock_desc", label: "Stock (mayor a menor)" },
                    { value: "ganancia_asc", label: "% Ganancia (menor a mayor)" },
                    { value: "ganancia_desc", label: "% Ganancia (mayor a menor)" },
                  ]}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Acceso rápido por stock */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-medium uppercase tracking-wide text-text-dim">
                Acceso rápido:
              </span>
              <button
                type="button"
                onClick={() => setFiltroStock(filtroStock === "sin_stock" ? "todos" : "sin_stock")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filtroStock === "sin_stock"
                    ? "border-[#ba1a1a] bg-danger text-white"
                    : "border-[#f5c2c2] bg-danger/10 text-danger hover:bg-[#f8d7d7]"
                )}
              >
                Sin stock
                <span className="rounded-full bg-black/10 px-1.5">{conteoSinStock}</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroStock(filtroStock === "stock_bajo" ? "todos" : "stock_bajo")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filtroStock === "stock_bajo"
                    ? "border-[#a15c00] bg-[#a15c00] text-white"
                    : "border-[#f2dca3] bg-[#fdf3dc] text-warning hover:bg-[#f9ecc7]"
                )}
              >
                Stock bajo
                <span className="rounded-full bg-black/10 px-1.5">{conteoStockBajo}</span>
              </button>

              {filtrosActivosCount > 0 && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {cargando ? (
          <p className="p-8 text-center text-sm text-text-dim">Cargando...</p>
        ) : productosPaginados.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-dim">
            No se encontraron productos que coincidan con la búsqueda.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-topbar">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Costo</th>
                    <th className="px-4 py-3 text-primary-soft">Venta</th>
                    <th className="px-4 py-3">Gan. Min.</th>
                    <th className="px-4 py-3">Mayorista</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productosPaginados.map((p) => {
                    const cotizacion = configProducto.cotizacionUSD;
                    const costo = {
                      usd: toUsd(p.precioCosto, p.monedaPrecio, cotizacion),
                      ars: toArs(p.precioCosto, p.monedaPrecio, cotizacion),
                    };
                    const venta = {
                      usd: toUsd(p.precioVenta, p.monedaPrecio, cotizacion),
                      ars: toArs(p.precioVenta, p.monedaPrecio, cotizacion),
                    };
                    const mayorista =
                      p.precioMayorista != null
                        ? {
                            usd: toUsd(p.precioMayorista, p.monedaPrecio, cotizacion),
                            ars: toArs(p.precioMayorista, p.monedaPrecio, cotizacion),
                          }
                        : null;

                    const gananciaPct =
                      p.precioCosto > 0 ? ((p.precioVenta - p.precioCosto) / p.precioCosto) * 100 : 0;

                    const stockColor =
                      p.stockActual <= 0
                        ? "bg-danger"
                        : p.stockMinimo != null && p.stockActual <= p.stockMinimo
                        ? "bg-[#d97706]"
                        : "bg-success";

                    return (
                      <tr
                        key={p.id}
                        onClick={() => setProductoDetalle(p)}
                        className="cursor-pointer border-t border-border hover:bg-surface"
                      >
                        <td className="px-4 py-3 font-semibold text-text">{p.nombre}</td>
                        <td className="px-4 py-3 text-text-dim">{p.marca?.nombre ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-text">
                            <span className={cn("h-2 w-2 rounded-full", stockColor)} />
                            {p.stockActual}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {configProducto.usaCotizacionUSD ? (
                            <>
                              <div className="font-semibold text-text">
                                {formatCurrency(costo.usd, "USD")}{" "}
                                <span className="text-[10px] font-medium text-text-dim">USD</span>
                              </div>
                              <div className="text-xs text-text-dim">{formatCurrency(costo.ars, "ARS")}</div>
                            </>
                          ) : (
                            <div className="font-semibold text-text">{formatCurrency(costo.ars, "ARS")}</div>
                          )}
                        </td>
                        <td className="bg-success/10 px-4 py-3">
                          {configProducto.usaCotizacionUSD ? (
                            <>
                              <div className="font-bold text-primary">
                                {formatCurrency(venta.usd, "USD")}{" "}
                                <span className="text-[10px] font-medium text-[#4ADE80]">USD</span>
                              </div>
                              <div className="text-xs text-[#86D89C]">{formatCurrency(venta.ars, "ARS")}</div>
                            </>
                          ) : (
                            <div className="font-bold text-primary">{formatCurrency(venta.ars, "ARS")}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("font-bold", gananciaPct >= 0 ? "text-primary" : "text-danger")}>
                            {gananciaPct >= 0 ? "+" : ""}
                            {gananciaPct.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {mayorista ? (
                            configProducto.usaCotizacionUSD ? (
                              <>
                                <div className="font-bold text-primary">
                                  {formatCurrency(mayorista.usd, "USD")}{" "}
                                  <span className="text-[10px] font-medium text-primary">USD</span>
                                </div>
                                <div className="text-xs text-primary">{formatCurrency(mayorista.ars, "ARS")}</div>
                              </>
                            ) : (
                              <div className="font-bold text-primary">{formatCurrency(mayorista.ars, "ARS")}</div>
                            )
                          ) : (
                            <span className="text-text-dim">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleAbrirEditar(p)}
                              className="rounded-lg p-1.5 text-primary hover:bg-surface-hover"
                              title="Editar producto"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => p.fotoUrl && setImagenPreview(p.fotoUrl)}
                              disabled={!p.fotoUrl}
                              className="rounded-lg p-1.5 text-[#16A34A] hover:bg-success/10 disabled:opacity-30"
                              title={p.fotoUrl ? "Ver foto" : "Sin foto cargada"}
                            >
                              <ImageIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCambiarEstado(p)}
                              disabled={desactivandoId === p.id}
                              className={cn(
                                "rounded-lg p-1.5 disabled:opacity-40",
                                p.activo
                                  ? "text-text-dim hover:bg-danger/10 hover:text-danger"
                                  : "text-success hover:bg-success/10"
                              )}
                              title={p.activo ? "Desactivar producto" : "Activar producto"}
                            >
                              {p.activo ? (
                                <Ban className="h-4 w-4" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {productosPaginados.map((p) => {
                const porcentajeGanancia =
                  p.precioCosto > 0
                    ? ((p.precioVenta - p.precioCosto) / p.precioCosto) * 100
                    : 0;

                const cotizacion = configProducto.cotizacionUSD;
                const convertir = (valor: number) =>
                  monedaVista === "USD"
                    ? toUsd(valor, p.monedaPrecio, cotizacion)
                    : toArs(valor, p.monedaPrecio, cotizacion);

                return (
                  <div key={p.id} className="p-4">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setProductoDetalle(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setProductoDetalle(p);
                      }}
                      className="cursor-pointer active:opacity-80"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text">{p.nombre}</p>
                          <p className="truncate text-xs text-text-dim">{p.marca?.nombre ?? "-"}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                          +{porcentajeGanancia.toFixed(1)}%
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                        <div>
                          <p className="text-xs text-text-dim">Stock</p>
                          <p
                            className={cn(
                              "font-medium",
                              p.stockMinimo != null && p.stockActual <= p.stockMinimo
                                ? "text-danger"
                                : "text-text"
                            )}
                          >
                            {p.stockActual} u.
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-dim">Costo</p>
                          <p className="font-mono text-text-dim">
                            {formatCurrency(convertir(p.precioCosto), monedaVista)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-dim">Venta</p>
                          <p className="font-mono font-medium text-text">
                            {formatCurrency(convertir(p.precioVenta), monedaVista)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-dim">Mayorista</p>
                          <p className="font-mono text-text-dim">
                            {p.precioMayorista != null
                              ? formatCurrency(convertir(p.precioMayorista), monedaVista)
                              : "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAbrirEditar(p);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (p.fotoUrl) setImagenPreview(p.fotoUrl);
                        }}
                        disabled={!p.fotoUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#16A34A] hover:bg-success/10 disabled:opacity-30"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Foto
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCambiarEstado(p);
                        }}
                        disabled={desactivandoId === p.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40",
                          p.activo
                            ? "text-text-dim hover:bg-danger/10 hover:text-danger"
                            : "text-success hover:bg-success/10"
                        )}
                      >
                        {p.activo ? (
                          <Ban className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Paginación */}
      {productosFiltrados.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>
            {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={paginaActual === 1}
              onClick={() => setPaginaActual((prev) => prev - 1)}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              Anterior
            </button>
            <span>
              Página {paginaActual} de {totalPaginas}
            </span>
            <button
              disabled={paginaActual === totalPaginas}
              onClick={() => setPaginaActual((prev) => prev + 1)}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <ProductoFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productoEditar={productoEditar}
        onSuccess={cargarProductos}
        usaCotizacionUSD={configProducto.usaCotizacionUSD}
      />

      <PdfGeneratorModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        usaCotizacionUSD={configProducto.usaCotizacionUSD}
      />

      <ConfirmDialog
        isOpen={!!productoADesactivar}
        onClose={() => setProductoADesactivar(null)}
        onConfirm={confirmarCambiarEstado}
        title={
          productoADesactivar?.activo
            ? `¿Desactivar "${productoADesactivar?.nombre}"?`
            : `¿Activar "${productoADesactivar?.nombre}"?`
        }
        description={
          productoADesactivar?.activo
            ? "Va a dejar de aparecer en el catálogo, listas de precios y PDFs."
            : "El producto volverá a aparecer en el catálogo, listas de precios y PDFs."
        }
        confirmLabel={productoADesactivar?.activo ? "Desactivar" : "Activar"}
        variant={productoADesactivar?.activo ? "danger" : "default"}
        loading={desactivandoId === productoADesactivar?.id}
      />
      <ProductoDetalleModal
        isOpen={!!productoDetalle}
        producto={productoDetalle}
        configProducto={configProducto}
        onClose={() => setProductoDetalle(null)}
        onEditar={() => {
          if (productoDetalle) handleAbrirEditar(productoDetalle);
          setProductoDetalle(null);
        }}
        onDesactivar={() => {
          if (productoDetalle) handleCambiarEstado(productoDetalle);
          setProductoDetalle(null);
        }}
      />

      {imagenPreview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setImagenPreview(null)}
        >
          <div className="relative max-h-[80vh] max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImagenPreview(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-text shadow-lg"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={imagenPreview}
              alt="Foto del producto"
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}