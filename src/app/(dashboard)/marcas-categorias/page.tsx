"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";

interface Elemento {
  id: number;
  nombre: string;
  activa: boolean;
  cantidadProductos: number;
}

interface SeccionProps {
  titulo: string;
  singular: string;
  endpoint: string; // ej: "/api/marcas"
}

function TablaSeccion({ titulo, singular, endpoint }: SeccionProps) {
  const [items, setItems] = useState<Elemento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemEditar, setItemEditar] = useState<Elemento | null>(null);
  const [nombreForm, setNombreForm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Cargar lista
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Error al cargar ${titulo}`);
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, titulo]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Filtrado por buscador
  const itemsFiltrados = items.filter((item) =>
    item.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Abrir Modal Crear
  const handleOpenCrear = () => {
    setItemEditar(null);
    setNombreForm("");
    setErrorMsg("");
    setIsModalOpen(true);
  };

  // Abrir Modal Editar
  const handleOpenEditar = (item: Elemento) => {
    setItemEditar(item);
    setNombreForm(item.nombre);
    setErrorMsg("");
    setIsModalOpen(true);
  };

  // Guardar (Crear / Editar)
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreForm.trim()) {
      setErrorMsg("El nombre es requerido");
      return;
    }

    setIsSaving(true);
    setErrorMsg("");

    try {
      const url = itemEditar ? `${endpoint}/${itemEditar.id}` : endpoint;
      const method = itemEditar ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreForm.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      setIsModalOpen(false);
      fetchItems();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Activa / Desactivar
  const handleToggleEstado = async (item: Elemento) => {
    try {
      const res = await fetch(`${endpoint}/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !item.activa }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Error al cambiar el estado");
        return;
      }

      fetchItems();
    } catch (err) {
      alert("Error al conectar con el servidor");
    }
  };

  // Eliminar
  const handleEliminar = async (item: Elemento) => {
    if (item.cantidadProductos > 0) {
      alert(
        `⚠️ No se puede eliminar "${item.nombre}" porque tiene ${item.cantidadProductos} producto(s) asociado(s).\n\nPuedes desactivarla en su lugar.`
      );
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar "${item.nombre}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${endpoint}/${item.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Error al eliminar");
        return;
      }

      fetchItems();
    } catch (err) {
      alert("Error al intentar eliminar");
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
      {/* Encabezado y Botón Nuevo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">{titulo}</h2>
          <p className="text-sm text-text-dim">
            Total registrados: {items.length}
          </p>
        </div>
        <button
          onClick={handleOpenCrear}
          className="bg-grad inline-flex items-center justify-center gap-1.5 self-start rounded-full px-4 py-2 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 sm:self-auto cursor-pointer"
        >
          <span>+</span> Nueva {singular}
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
        <input
          type="text"
          placeholder={`Buscar ${singular.toLowerCase()}...`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Tabla */}
      <div className="overflow-hidden overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-topbar">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-center">Productos</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-dim">
                  Cargando {titulo.toLowerCase()}...
                </td>
              </tr>
            ) : itemsFiltrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-dim">
                  No se encontraron {titulo.toLowerCase()}.
                </td>
              </tr>
            ) : (
              itemsFiltrados.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-text">
                    {item.nombre}
                  </td>

                  {/* Cantidad de productos asociados real */}
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-semibold text-text-dim">
                      {item.cantidadProductos}
                    </span>
                  </td>

                  {/* Estado Activa / Inactiva */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleEstado(item)}
                      title={item.activa ? "Clic para desactivar" : "Clic para activar"}
                      className={`inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        item.activa
                          ? "bg-success/10 text-success hover:opacity-80"
                          : "bg-danger/10 text-danger hover:opacity-80"
                      }`}
                    >
                      {item.activa ? "Activa" : "Inactiva"}
                    </button>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleOpenEditar(item)}
                        className="text-sm cursor-pointer text-primary hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleEliminar(item)}
                        className="text-sm text-danger cursor-pointer hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal para Crear / Editar (Un solo campo: nombre) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text">
              {itemEditar ? `Editar ${singular}` : `Nueva ${singular}`}
            </h3>

            {errorMsg && (
              <div className="rounded-lg border border-[#f3b4b4] bg-danger/10 p-3 text-sm text-danger">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleGuardar} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-text-dim">
                  Nombre de {singular} *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={`Ej: ${singular === "Marca" ? "Chanel" : "Perfumes"}`}
                  value={nombreForm}
                  onChange={(e) => setNombreForm(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarcasCategoriasPage() {
  return (
    <div className="p-4 space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">
          Marcas y Categorías
        </h1>
        <p className="text-sm text-text-dim">
          Administra las marcas y categorías disponibles para los productos
        </p>
      </div>

      {/* Dos Tablas Independientes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 sm:gap-6">
        <TablaSeccion
          titulo="Marcas"
          singular="Marca"
          endpoint="/api/marcas"
        />
        <TablaSeccion
          titulo="Categorías"
          singular="Categoría"
          endpoint="/api/categorias"
        />
      </div>
    </div>
  );
}