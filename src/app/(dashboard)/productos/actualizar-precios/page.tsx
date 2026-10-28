"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/dialogos";
import { calcularNuevoPrecio, leerValorAjuste } from "@/lib/calculos/ajuste-precios";

interface Producto {
  id: number;
  nombre: string;
  marcaId?: number | null;
  categoriaId?: number | null;
  marca?: { id?: number; nombre: string } | null;
  categoria?: { id?: number; nombre: string } | null;
  precioCosto: number;
  precioVenta: number;
  precioMayorista?: number | null;
  precioOferta?: number | null;
  monedaPrecio?: "ARS" | "USD";
}

type TipoPrecio = "costo" | "minorista" | "mayorista" | "oferta";

/** Qué campo del producto es cada tipo de precio y cómo se llama en pantalla. */
const TIPOS_PRECIO: { id: TipoPrecio; label: string; corto: string; campo: "precioCosto" | "precioVenta" | "precioMayorista" | "precioOferta" }[] = [
  { id: "minorista", label: "Precio Venta (Minorista)", corto: "Venta", campo: "precioVenta" },
  { id: "costo", label: "Precio Costo", corto: "Costo", campo: "precioCosto" },
  { id: "mayorista", label: "Precio Mayorista", corto: "Mayorista", campo: "precioMayorista" },
  { id: "oferta", label: "Precio Oferta", corto: "Oferta", campo: "precioOferta" },
];

const dinero = (n: number, moneda: "ARS" | "USD" = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);

interface ItemFiltro {
  id: number;
  nombre: string;
}

export default function ActualizarPreciosPage() {
  const router = useRouter();

  // Estados de Datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [marcas, setMarcas] = useState<ItemFiltro[]>([]);
  const [categorias, setCategorias] = useState<ItemFiltro[]>([]);
  const [loading, setLoading] = useState(true);

  // Navegación de Pasos (1: Selección, 2: Configuración)
  const [paso, setPaso] = useState<1 | 2>(1);

  // Filtros del Paso 1
  const [busqueda, setBusqueda] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");

  // Selección
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Parámetros de Ajuste del Paso 2
  // Mismo ajuste para todos, o uno distinto por producto.
  const [modo, setModo] = useState<"TODOS" | "INDIVIDUAL">("TODOS");
  const [tipoAjuste, setTipoAjuste] = useState<"PORCENTAJE" | "VALOR_FIJO">("PORCENTAJE");
  const [valorAjuste, setValorAjuste] = useState<string>("");
  // Ajuste de cada producto (modo INDIVIDUAL), tal cual se escribió. Vacío = no se toca.
  const [valores, setValores] = useState<Record<number, string>>({});
  const [valorRapido, setValorRapido] = useState("");
  const [tiposPrecio, setTiposPrecio] = useState<TipoPrecio[]>([
    "minorista",
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Cargar todos los productos, marcas y categorías
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [resProd, resMar, resCat] = await Promise.all([
          fetch("/api/productos?all=true"), // Pide la totalidad de productos
          fetch("/api/marcas"),
          fetch("/api/categorias"),
        ]);

        if (resProd.ok) {
          const dataProd = await resProd.json();
          // Lee 'items' o se adapta a array directo
          const listaProductos = Array.isArray(dataProd)
            ? dataProd
            : Array.isArray(dataProd.items)
            ? dataProd.items
            : [];
          setProductos(listaProductos);
        }

        if (resMar.ok) {
          const dataMar = await resMar.json();
          const listaMar = Array.isArray(dataMar)
            ? dataMar
            : Array.isArray(dataMar.items)
            ? dataMar.items
            : Array.isArray(dataMar.marcas)
            ? dataMar.marcas
            : [];
          setMarcas(listaMar);
        }

        if (resCat.ok) {
          const dataCat = await resCat.json();
          const listaCat = Array.isArray(dataCat)
            ? dataCat
            : Array.isArray(dataCat.items)
            ? dataCat.items
            : Array.isArray(dataCat.categorias)
            ? dataCat.categorias
            : [];
          setCategorias(listaCat);
        }
      } catch (err) {
        console.error("Error al cargar datos:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filtrado reactivo en el cliente
  const productosFiltrados = useMemo(() => {
    if (!Array.isArray(productos) || productos.length === 0) return [];

    return productos.filter((p) => {
      // 1. Coincidencia por Texto
      const cumpleBusqueda =
        !busqueda.trim() ||
        (p.nombre && p.nombre.toLowerCase().includes(busqueda.toLowerCase().trim()));

      // 2. Coincidencia por Marca
      const mId = p.marcaId ?? p.marca?.id;
      const cumpleMarca =
        !filtroMarca ||
        (mId !== undefined && mId !== null && String(mId) === String(filtroMarca));

      // 3. Coincidencia por Categoría
      const cId = p.categoriaId ?? p.categoria?.id;
      const cumpleCat =
        !filtroCategoria ||
        (cId !== undefined && cId !== null && String(cId) === String(filtroCategoria));

      return cumpleBusqueda && cumpleMarca && cumpleCat;
    });
  }, [productos, busqueda, filtroMarca, filtroCategoria]);

  // Selección de Checkboxes
  const handleToggleSelectAll = () => {
    const idsVisibles = productosFiltrados.map((p) => p.id);
    const todosSeleccionados =
      idsVisibles.length > 0 && idsVisibles.every((id) => selectedIds.includes(id));

    if (todosSeleccionados) {
      setSelectedIds(selectedIds.filter((id) => !idsVisibles.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...idsVisibles])));
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleTipoPrecio = (tipo: TipoPrecio) => {
    setTiposPrecio((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]
    );
  };

  // Productos elegidos en el paso 1, en el orden de la lista.
  const productosSeleccionados = useMemo(
    () => productos.filter((p) => selectedIds.includes(p.id)),
    [productos, selectedIds]
  );

  // Modo INDIVIDUAL: cuántos tienen un ajuste cargado (los vacíos no se tocan).
  const cantidadConAjuste = useMemo(
    () => productosSeleccionados.filter((p) => typeof leerValorAjuste(valores[p.id] ?? "") === "number").length,
    [productosSeleccionados, valores]
  );

  // Enviar los cambios
  const handleConfirmarAjuste = async () => {
    setErrorMsg("");

    if (tiposPrecio.length === 0) {
      setErrorMsg("Selecciona al menos un tipo de precio para aplicar.");
      return;
    }

    let cuerpo: Record<string, unknown>;
    if (modo === "INDIVIDUAL") {
      const ajustes: { productoId: number; valor: number }[] = [];
      const invalidos: string[] = [];
      for (const p of productosSeleccionados) {
        const v = leerValorAjuste(valores[p.id] ?? "");
        if (v === undefined) invalidos.push(p.nombre);
        else if (v !== null) ajustes.push({ productoId: p.id, valor: v });
      }
      if (invalidos.length > 0) {
        const lista = invalidos.slice(0, 3).join(", ") + (invalidos.length > 3 ? ` y ${invalidos.length - 3} más` : "");
        setErrorMsg(`Revisá el ajuste de: ${lista}. Tiene que ser un número distinto de 0 (o dejalo vacío para no tocar ese producto).`);
        return;
      }
      if (ajustes.length === 0) {
        setErrorMsg("Ingresá el ajuste de al menos un producto.");
        return;
      }
      cuerpo = { ajustes, tipoAjuste, tiposPrecio };
    } else {
      const valorNum = parseFloat(valorAjuste);
      if (isNaN(valorNum) || valorNum === 0) {
        setErrorMsg("Ingresa un valor numérico válido y distinto de 0.");
        return;
      }
      cuerpo = { productoIds: selectedIds, tipoAjuste, valor: valorNum, tiposPrecio };
    }

    setIsSubmitting(true);

    try {
      // AJUSTA ESTA URL SEGÚN LA UBICACIÓN DE TU ROUTE.TS
      const res = await fetch("/api/productos/actualizar-precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });

      const contentType = res.headers.get("content-type");

      // Si la respuesta no es un JSON (devuelve un HTML de error como 404 o 500)
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("Respuesta inesperada del servidor (no JSON):", textError);
        throw new Error(
          `Ruta no encontrada o error de servidor. Código HTTP: ${res.status}`
        );
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Error en la solicitud (${res.status})`);
      }

      await avisar(`Se actualizaron los precios de ${data.cantidadAfectados} producto(s).`, { titulo: "Precios actualizados", variante: "exito" });
      router.push("/productos");
    } catch (err: any) {
      console.error("Error al actualizar precios:", err);
      setErrorMsg(err.message || "Ocurrió un error inesperado al conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">Cargando catálogo completo...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Actualizar Precios Masivamente</h1>
          <p className="text-sm text-slate-500">
            Modifica rápidamente costos y precios de lista para múltiples artículos.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className={`px-3 py-1 rounded-full ${
              paso === 1 ? "bg-primary text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            1. Selección ({selectedIds.length})
          </span>
          <span className="text-slate-400">→</span>
          <span
            className={`px-3 py-1 rounded-full ${
              paso === 2 ? "bg-primary text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            2. Configurar Ajuste
          </span>
        </div>
      </div>

      {/* ================= PASO 1: SELECCIÓN DE PRODUCTOS ================= */}
      {paso === 1 && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Búsqueda</label>
              <input
                type="text"
                placeholder="Nombre del producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Marca</label>
              <select
                value={filtroMarca}
                onChange={(e) => setFiltroMarca(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todas las Marcas</option>
                {marcas.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Categoría</label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todas las Categorías</option>
                {categorias.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabla de Resultados completos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
              <table className="w-full text-left text-sm relative">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold z-10">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          productosFiltrados.length > 0 &&
                          productosFiltrados.every((p) => selectedIds.includes(p.id))
                        }
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4">Marca</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4 text-right">P. Costo</th>
                    <th className="py-3 px-4 text-right">P. Venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No se encontraron productos que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    productosFiltrados.map((p) => {
                      const isSelected = selectedIds.includes(p.id);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => handleToggleSelect(p.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(p.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">{p.nombre}</td>
                          <td className="py-3 px-4 text-slate-600">{p.marca?.nombre || "-"}</td>
                          <td className="py-3 px-4 text-slate-600">{p.categoria?.nombre || "-"}</td>
                          <td className="py-3 px-4 text-right font-mono">${p.precioCosto ?? 0}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            ${p.precioVenta ?? 0}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-600 flex justify-between items-center">
              <span>
                Mostrando <strong>{productosFiltrados.length}</strong> de{" "}
                <strong>{productos.length}</strong> productos en total
              </span>
            </div>
          </div>

          {/* Botón Siguiente */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-sm text-slate-600">
              Productos seleccionados: <strong>{selectedIds.length}</strong>
            </span>
            <button
              disabled={selectedIds.length === 0}
              onClick={() => setPaso(2)}
              className="bg-primary hover:opacity-90 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              Siguiente (Paso 2) →
            </button>
          </div>
        </div>
      )}

      {/* ================= PASO 2: PARÁMETROS DEL AJUSTE ================= */}
      {paso === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-bold text-slate-800">Definir Parámetros del Ajuste</h2>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">¿Cómo querés ajustar?</label>
            <div className="flex flex-col sm:flex-row gap-3">
              {[
                { id: "TODOS", titulo: "El mismo ajuste para todos", detalle: "Un solo porcentaje o monto para los productos elegidos." },
                { id: "INDIVIDUAL", titulo: "Un ajuste distinto por producto", detalle: "Cargás el aumento de cada producto en una lista." },
              ].map((o) => (
                <label
                  key={o.id}
                  className={`flex flex-1 items-start gap-2 border p-3 rounded-lg cursor-pointer hover:bg-slate-50 ${
                    modo === o.id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="modoAjuste"
                    checked={modo === o.id}
                    onChange={() => setModo(o.id as "TODOS" | "INDIVIDUAL")}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{o.titulo}</span>
                    <span className="block text-xs text-slate-500">{o.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Ajuste</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 border p-3 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="tipoAjuste"
                  value="PORCENTAJE"
                  checked={tipoAjuste === "PORCENTAJE"}
                  onChange={() => setTipoAjuste("PORCENTAJE")}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-800">Porcentaje (%)</span>
              </label>

              <label className="flex items-center gap-2 border p-3 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="tipoAjuste"
                  value="VALOR_FIJO"
                  checked={tipoAjuste === "VALOR_FIJO"}
                  onChange={() => setTipoAjuste("VALOR_FIJO")}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-800">Valor Fijo ($)</span>
              </label>
            </div>
          </div>

          {modo === "TODOS" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Valor del Ajuste {tipoAjuste === "PORCENTAJE" ? "(%)" : "($)"}
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Ingresa valores positivos para incrementos (ej: <code>15</code>) o negativos para descuentos (ej: <code>-10</code>).
            </p>
            <input
              type="number"
              step="any"
              placeholder={tipoAjuste === "PORCENTAJE" ? "Ej: 10 o -5" : "Ej: 500 o -200"}
              value={valorAjuste}
              onChange={(e) => setValorAjuste(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Selecciona qué Precios se Modificarán:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TIPOS_PRECIO.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 border p-3 rounded-lg cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={tiposPrecio.includes(item.id as any)}
                    onChange={() => handleToggleTipoPrecio(item.id as any)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-800">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {modo === "INDIVIDUAL" && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Ajuste de cada producto</label>
                  <p className="text-xs text-slate-500">
                    Escribí el {tipoAjuste === "PORCENTAJE" ? "porcentaje (ej: 15, -10 o 7,5)" : "monto (ej: 500 o -200)"} de cada uno. Los que dejes vacíos no se modifican.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={tipoAjuste === "PORCENTAJE" ? "Ej: 10" : "Ej: 500"}
                    value={valorRapido}
                    onChange={(e) => setValorRapido(e.target.value)}
                    aria-label="Mismo valor para todos"
                    className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setValores(Object.fromEntries(productosSeleccionados.map((p) => [p.id, valorRapido])))}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Poner a todos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setValores({});
                      setValorRapido("");
                    }}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-auto max-h-[420px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold z-10">
                      <tr>
                        <th className="py-2 px-4">Producto</th>
                        <th className="py-2 px-4">Precio actual → nuevo</th>
                        <th className="py-2 px-4 w-36">Ajuste {tipoAjuste === "PORCENTAJE" ? "(%)" : "($)"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {productosSeleccionados.map((p) => {
                        const texto = valores[p.id] ?? "";
                        const v = leerValorAjuste(texto);
                        return (
                          <tr key={p.id} className="align-top">
                            <td className="py-2 px-4 font-medium text-slate-800">{p.nombre}</td>
                            <td className="py-2 px-4">
                              <ul className="space-y-0.5 text-xs">
                                {TIPOS_PRECIO.filter((t) => tiposPrecio.includes(t.id) && p[t.campo] != null).map((t) => {
                                  const actual = p[t.campo] as number;
                                  const nuevo = typeof v === "number" ? calcularNuevoPrecio(actual, tipoAjuste, v) : null;
                                  return (
                                    <li key={t.id} className="text-slate-500">
                                      {t.corto}: {dinero(actual, p.monedaPrecio)}
                                      {nuevo != null && (
                                        <>
                                          {" → "}
                                          <span className="font-semibold text-slate-900">{dinero(nuevo, p.monedaPrecio)}</span>
                                        </>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                            <td className="py-2 px-4">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={texto}
                                onChange={(e) => setValores((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                aria-label={`Ajuste de ${p.nombre}`}
                                aria-invalid={v === undefined}
                                className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                  v === undefined ? "border-rose-400 bg-rose-50" : "border-slate-300"
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {cantidadConAjuste} de {productosSeleccionados.length} producto(s) con ajuste.
              </p>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setPaso(1)}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Volver a Selección
            </button>

            <button
              type="button"
              onClick={handleConfirmarAjuste}
              disabled={isSubmitting}
              className="px-6 py-2 bg-primary hover:opacity-90 text-white rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting
                ? "Actualizando..."
                : `Aplicar Ajuste a ${modo === "INDIVIDUAL" ? cantidadConAjuste : selectedIds.length} Producto(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}