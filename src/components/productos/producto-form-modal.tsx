"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BarcodeInput } from "@/components/ui/barcode-input";
import Select from "@/components/ui/select";

function calcularPorcentaje(costo: number, precio: number): number {
  if (!costo || costo <= 0) return 0;
  return ((precio - costo) / costo) * 100;
}

function calcularPrecioDesdePorcentaje(costo: number, porcentaje: number): number {
  return costo * (1 + porcentaje / 100);
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface ProductoFormData {
  id?: string;
  nombre: string;
  codigoBarras: string;
  ubicacion: string;
  marcaId: string;
  categoriaId: string;
  contenidoMl: number | "";
  stockActual: number | "";
  stockMinimo: number | "";
  destacado: boolean;
  monedaPrecio: "ARS" | "USD";
  precioCosto: number | "";
  precioVenta: number | "";
  precioMayorista: number | "";
  precioOferta: number | "";
  fotoUrl?: string | null;
}

interface Marca {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface ProductoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productoEditar?: ProductoFormData | null;
  onSuccess: () => void;
  marcasIniciales?: Marca[];
  categoriasIniciales?: Categoria[];
  usaCotizacionUSD?: boolean;
}

export function ProductoFormModal({
  isOpen,
  onClose,
  productoEditar,
  onSuccess,
  marcasIniciales = [],
  categoriasIniciales = [],
  usaCotizacionUSD = false,
}: ProductoFormModalProps) {
  const [formData, setFormData] = useState<ProductoFormData>({
    nombre: "",
    codigoBarras: "",
    ubicacion: "",
    marcaId: "",
    categoriaId: "",
    contenidoMl: "",
    stockActual: "",
    stockMinimo: "",
    destacado: false,
    monedaPrecio: "ARS",
    precioCosto: "",
    precioVenta: "",
    precioMayorista: "",
    precioOferta: "",
  });

  const [marcas, setMarcas] = useState<Marca[]>(marcasIniciales);
  const [categorias, setCategorias] = useState<Categoria[]>(categoriasIniciales);

  // Estados para alta rápida
  const [mostrarAltaMarca, setMostrarAltaMarca] = useState(false);
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState("");
  const [guardandoSubitem, setGuardandoSubitem] = useState(false);

  const [mostrarAltaCategoria, setMostrarAltaCategoria] = useState(false);
  const [nuevaCategoriaNombre, setNuevaCategoriaNombre] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [productoInactivoId, setProductoInactivoId] = useState<string | null>(null);
  const [reactivando, setReactivando] = useState(false);

  const [porcentajeVenta, setPorcentajeVenta] = useState<number | "">("");
  const [porcentajeMayorista, setPorcentajeMayorista] = useState<number | "">("");

  const fetchAuxiliares = useCallback(async () => {
    try {
      const [resMarcas, resCategorias] = await Promise.all([
        fetch("/api/marcas"),
        fetch("/api/categorias"),
      ]);

      if (resMarcas.ok) {
        const dataM = await resMarcas.json();
        setMarcas(Array.isArray(dataM) ? dataM : dataM.items || []);
      }
      if (resCategorias.ok) {
        const dataC = await resCategorias.json();
        setCategorias(Array.isArray(dataC) ? dataC : dataC.items || []);
      }
    } catch (err) {
      console.error("Error al obtener marcas o categorías:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchAuxiliares();

      if (productoEditar) {
        setFormData({
          ...productoEditar,
          nombre: productoEditar.nombre ?? "",
          codigoBarras: productoEditar.codigoBarras ?? "",
          ubicacion: productoEditar.ubicacion ?? "",
          marcaId: productoEditar.marcaId ?? "",
          categoriaId: productoEditar.categoriaId ?? "",
          contenidoMl: productoEditar.contenidoMl ?? "",
          stockActual: productoEditar.stockActual ?? "",
          stockMinimo: productoEditar.stockMinimo ?? "",
          destacado: productoEditar.destacado ?? false,
          monedaPrecio: usaCotizacionUSD ? productoEditar.monedaPrecio ?? "USD" : "ARS",
          precioCosto: productoEditar.precioCosto ?? "",
          precioVenta: productoEditar.precioVenta ?? "",
          precioMayorista: productoEditar.precioMayorista ?? "",
          precioOferta: productoEditar.precioOferta ?? "",
          id: productoEditar.id,
          fotoUrl: productoEditar.fotoUrl ?? "",
        });
        setPreviewUrl(productoEditar.fotoUrl || null);

        const costoInicial = Number(productoEditar.precioCosto) || 0;
        setPorcentajeVenta(
          costoInicial > 0 && productoEditar.precioVenta !== ""
            ? redondear2(calcularPorcentaje(costoInicial, Number(productoEditar.precioVenta)))
            : ""
        );
        setPorcentajeMayorista(
          costoInicial > 0 && productoEditar.precioMayorista !== "" && productoEditar.precioMayorista != null
            ? redondear2(calcularPorcentaje(costoInicial, Number(productoEditar.precioMayorista)))
            : ""
        );
      } else {
        setFormData({
          nombre: "",
          codigoBarras: "",
          ubicacion: "",
          marcaId: "",
          categoriaId: "",
          contenidoMl: "",
          stockActual: 0,
          stockMinimo: 0,
          destacado: false,
          monedaPrecio: "ARS",
          precioCosto: "",
          precioVenta: "",
          precioMayorista: "",
          precioOferta: "",
          fotoUrl: "",
        });
        setPreviewUrl(null);
        setPorcentajeVenta("");
        setPorcentajeMayorista("");
      }
      setSelectedFile(null);
      setErrorMsg("");
      setProductoInactivoId(null);
    }
  }, [productoEditar, isOpen, fetchAuxiliares]);

  if (!isOpen) return null;

  // Alta rápida de marca
  const handleCrearMarcaRapida = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!nuevaMarcaNombre.trim()) return;

    try {
      setGuardandoSubitem(true);
      const res = await fetch("/api/marcas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaMarcaNombre.trim() }),
      });

      if (res.ok) {
        const marcaCreada = await res.json();
        setMarcas((prev) => [...prev, marcaCreada]);
        setFormData((prev) => ({ ...prev, marcaId: marcaCreada.id }));
        setNuevaMarcaNombre("");
        setMostrarAltaMarca(false);
      } else {
        const errData = await res.json();
        alert(errData.message || "Error al crear la marca");
      }
    } catch (err) {
      console.error("Error al crear marca rápida:", err);
      alert("Error de conexión al guardar la marca");
    } finally {
      setGuardandoSubitem(false);
    }
  };

  // Alta rápida de categoría
  const handleCrearCategoriaRapida = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!nuevaCategoriaNombre.trim()) return;

    try {
      setGuardandoSubitem(true);
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaCategoriaNombre.trim() }),
      });

      if (res.ok) {
        const catCreada = await res.json();
        setCategorias((prev) => [...prev, catCreada]);
        setFormData((prev) => ({ ...prev, categoriaId: catCreada.id }));
        setNuevaCategoriaNombre("");
        setMostrarAltaCategoria(false);
      } else {
        const errData = await res.json();
        alert(errData.message || "Error al crear la categoría");
      }
    } catch (err) {
      console.error("Error al crear categoría rápida:", err);
      alert("Error de conexión al guardar la categoría");
    } finally {
      setGuardandoSubitem(false);
    }
  };

  // Alta de imagen
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setErrorMsg("Por favor selecciona una imagen válida (JPG o PNG).");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg("");
  };

  function handleCostoChange(valorStr: string) {
    const nuevoCosto = valorStr === "" ? "" : Number(valorStr);
    const costoNumerico = nuevoCosto === "" ? 0 : nuevoCosto;

    setFormData((prev) => {
      const nuevoPrecioVenta =
        porcentajeVenta !== "" && costoNumerico > 0
          ? redondear2(calcularPrecioDesdePorcentaje(costoNumerico, porcentajeVenta))
          : prev.precioVenta;

      const nuevoPrecioMayorista =
        porcentajeMayorista !== "" && costoNumerico > 0
          ? redondear2(calcularPrecioDesdePorcentaje(costoNumerico, porcentajeMayorista))
          : prev.precioMayorista;

      return {
        ...prev,
        precioCosto: nuevoCosto,
        precioVenta: nuevoPrecioVenta,
        precioMayorista: nuevoPrecioMayorista,
      };
    });
  }

  function handleCostoBlur() {
    const costo = Number(formData.precioCosto) || 0;
    if (costo <= 0) return;

    if (porcentajeVenta === "" && formData.precioVenta !== "") {
      setPorcentajeVenta(redondear2(calcularPorcentaje(costo, Number(formData.precioVenta))));
    }
    if (porcentajeMayorista === "" && formData.precioMayorista !== "") {
      setPorcentajeMayorista(redondear2(calcularPorcentaje(costo, Number(formData.precioMayorista))));
    }
  }

  function handlePrecioVentaChange(valorStr: string) {
    const nuevoPrecio = valorStr === "" ? "" : Number(valorStr);
    setFormData((prev) => ({ ...prev, precioVenta: nuevoPrecio }));

    const costo = Number(formData.precioCosto) || 0;
    setPorcentajeVenta(
      nuevoPrecio !== "" && costo > 0 ? redondear2(calcularPorcentaje(costo, nuevoPrecio)) : ""
    );
  }

  function handlePorcentajeVentaChange(valorStr: string) {
    const nuevoPorcentaje = valorStr === "" ? "" : Number(valorStr);
    setPorcentajeVenta(nuevoPorcentaje);

    const costo = Number(formData.precioCosto) || 0;
    if (nuevoPorcentaje !== "" && costo > 0) {
      setFormData((prev) => ({
        ...prev,
        precioVenta: redondear2(calcularPrecioDesdePorcentaje(costo, nuevoPorcentaje)),
      }));
    }
  }

  function handlePrecioMayoristaChange(valorStr: string) {
    const nuevoPrecio = valorStr === "" ? "" : Number(valorStr);
    setFormData((prev) => ({ ...prev, precioMayorista: nuevoPrecio }));

    const costo = Number(formData.precioCosto) || 0;
    setPorcentajeMayorista(
      nuevoPrecio !== "" && costo > 0 ? redondear2(calcularPorcentaje(costo, nuevoPrecio)) : ""
    );
  }

  function handlePorcentajeMayoristaChange(valorStr: string) {
    const nuevoPorcentaje = valorStr === "" ? "" : Number(valorStr);
    setPorcentajeMayorista(nuevoPorcentaje);

    const costo = Number(formData.precioCosto) || 0;
    if (nuevoPorcentaje !== "" && costo > 0) {
      setFormData((prev) => ({
        ...prev,
        precioMayorista: redondear2(calcularPrecioDesdePorcentaje(costo, nuevoPorcentaje)),
      }));
    }
  }

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormData((prev) => ({ ...prev, fotoUrl: "" }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setProductoInactivoId(null);

    // Validaciones de obligatorios
    if (
      !formData.nombre.trim() ||
      formData.stockActual === "" ||
      formData.precioCosto === "" ||
      formData.precioVenta === ""
    ) {
      setErrorMsg("Por favor completa los campos obligatorios (*)");
      return;
    }

    setLoading(true);

    try {
      let finalFotoUrl = formData.fotoUrl || null;

      // Si el usuario seleccionó un archivo nuevo
      if (selectedFile) {
        const uploadData = new FormData();
        uploadData.append("file", selectedFile);

        // Si se está editando y el producto tenía una foto anterior, la enviamos para que el servidor la elimine
        if (productoEditar?.fotoUrl) {
          uploadData.append("fotoUrlAnterior", productoEditar.fotoUrl);
        }

        const resUpload = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
        });

        if (!resUpload.ok) {
          const errData = await resUpload.json();
          throw new Error(errData.error || "Error al subir la imagen");
        }

        const { url } = await resUpload.json();
        finalFotoUrl = url;
      }

      // Formateo del payload
      const payload = {
        ...formData,
        nombre: formData.nombre?.trim() || "",
        codigoBarras: formData.codigoBarras?.trim() || null,
        ubicacion: formData.ubicacion?.trim() || null,
        marcaId: formData.marcaId ? Number(formData.marcaId) : null,
        categoriaId: formData.categoriaId ? Number(formData.categoriaId) : null,
        contenidoMl: formData.contenidoMl === "" ? null : Number(formData.contenidoMl),
        stockActual: Number(formData.stockActual),
        stockMinimo: formData.stockMinimo === "" ? 0 : Number(formData.stockMinimo),
        precioCosto: Number(formData.precioCosto),
        precioVenta: Number(formData.precioVenta),
        precioMayorista:
          formData.precioMayorista === "" || formData.precioMayorista === null
            ? null
            : Number(formData.precioMayorista),
        precioOferta:
          formData.precioOferta === "" || formData.precioOferta === null
            ? null
            : Number(formData.precioOferta),
        fotoUrl: finalFotoUrl,
      };

      // IMPORTANTE: URL absoluta con "/" al inicio
      const url = productoEditar?.id
        ? `/api/productos/${productoEditar.id}`
        : "/api/productos";
      const method = productoEditar?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setProductoInactivoId(data.productoInactivoId ? String(data.productoInactivoId) : null);
        throw new Error(data.error || data.message || "Error al guardar el producto");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.warn("Error submit producto:", err);
      setErrorMsg(err.message || "Ocurrió un error inesperado al guardar el producto");
    } finally {
      setLoading(false);
    }
  };

  async function handleReactivar() {
    if (!productoInactivoId) return;
    setReactivando(true);
    try {      const res = await fetch(`/api/productos/${productoInactivoId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo reactivar el producto");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "No se pudo reactivar el producto");
    } finally {
      setReactivando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl sm:rounded-2xl border-0 sm:border border-border bg-surface p-4 sm:p-6 shadow-2xl my-0 sm:my-8 max-h-full sm:max-h-[95vh] min-h-screen sm:min-h-0 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-text">
            {productoEditar ? "Editar Producto" : "Nuevo Producto"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 space-y-2 rounded-lg bg-danger/10 p-3 text-xs text-danger">
            <p>{errorMsg}</p>
            {productoInactivoId && (
              <button
                type="button"
                onClick={handleReactivar}
                disabled={reactivando}
                className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {reactivando ? "Reactivando..." : "Reactivar producto existente"}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Nombre y Código de Barras */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Nombre del Producto *
              </label>
              <input
                type="text"
                required
                value={formData.nombre}
                onChange={(e) =>
                  setFormData({ ...formData, nombre: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Código de Barras
              </label>
              <BarcodeInput
                value={formData.codigoBarras}
                onChange={(value) =>
                  setFormData({ ...formData, codigoBarras: value })
                }
                placeholder="Escaneá o tipeá el código..."
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Ubicación, Contenido, Marca y Categoría */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Ubicación en depósito
              </label>
              <input
                type="text"
                value={formData.ubicacion}
                onChange={(e) =>
                  setFormData({ ...formData, ubicacion: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-dim">
                Contenido (ml)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Ej: 100"
                value={formData.contenidoMl ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contenidoMl: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>

            {/* Marca */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-text-dim">
                  Marca
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarAltaMarca(true)}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Nueva
                </button>
              </div>
              <Select
                value={formData.marcaId}
                onChange={(v) => setFormData({ ...formData, marcaId: v })}
                options={[
                  { value: "", label: "Seleccionar marca..." },
                  ...marcas.map((m) => ({ value: m.id, label: m.nombre })),
                ]}
                className="mt-1"
              />
            </div>

            {/* Categoría */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-text-dim">
                  Categoría
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarAltaCategoria(true)}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Nueva
                </button>
              </div>
              <Select
                value={formData.categoriaId}
                onChange={(v) => setFormData({ ...formData, categoriaId: v })}
                options={[
                  { value: "", label: "Seleccionar categoría..." },
                  ...categorias.map((c) => ({ value: c.id, label: c.nombre })),
                ]}
                className="mt-1"
              />
            </div>
          </div>

          {/* Stocks */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Stock Actual *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.stockActual}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    stockActual:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Stock Mínimo
              </label>
              <input
                type="number"
                min="0"
                value={formData.stockMinimo}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    stockMinimo:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Precios */}
          <div className="rounded-xl border border-border bg-surface-hover/30 p-4 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
                Precios
              </span>
              {usaCotizacionUSD && (
                <div className="flex items-center gap-2">
                  <label className="whitespace-nowrap text-xs text-text-dim">Moneda:</label>
                  <Select
                    value={formData.monedaPrecio}
                    onChange={(v) =>
                      setFormData({ ...formData, monedaPrecio: v as "ARS" | "USD" })
                    }
                    options={[
                      { value: "ARS", label: "ARS ($)" },
                      { value: "USD", label: "USD ($)" },
                    ]}
                    className="w-36 shrink-0"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-text-dim">
                  Costo *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.precioCosto}
                  onChange={(e) => handleCostoChange(e.target.value)}
                  onBlur={handleCostoBlur}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">
                  Oferta
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.precioOferta}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      precioOferta:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">
                  Venta (Minorista) *
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.precioVenta}
                    onChange={(e) => handlePrecioVentaChange(e.target.value)}
                    className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                  <div className="relative w-20 shrink-0">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={porcentajeVenta}
                      onChange={(e) => handlePorcentajeVentaChange(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface py-2 pl-2 pr-6 text-sm text-text focus:border-primary focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-dim">
                      %
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-dim">
                  Mayorista (opcional)
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Sin precio mayorista"
                    value={formData.precioMayorista}
                    onChange={(e) => handlePrecioMayoristaChange(e.target.value)}
                    className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                  <div className="relative w-20 shrink-0">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={porcentajeMayorista}
                      onChange={(e) => handlePorcentajeMayoristaChange(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface py-2 pl-2 pr-6 text-sm text-text focus:border-primary focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-dim">
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input
                type="checkbox"
                checked={formData.destacado}
                onChange={(e) =>
                  setFormData({ ...formData, destacado: e.target.checked })
                }
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Producto Destacado
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">
              Imagen del Producto
            </label>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Previsualización */}
              {previewUrl ? (
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                  <img
                    src={previewUrl}
                    alt="Previsualización"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={loading}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white opacity-80 hover:opacity-100 disabled:opacity-50"
                    title="Quitar imagen"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface text-xs text-text/50">
                  Sin imagen
                </div>
              )}

              {/* Input oculto e invocación desde el Botón */}
              <div className="w-full sm:w-auto">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg, image/png, image/jpg, image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-sm hover:bg-surface/80 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {previewUrl ? "Cambiar imagen" : "Cargar imagen"}
                </button>

                <p className="mt-1 text-xs text-text/60">
                  Formatos permitidos: JPG, PNG o WEBP.
                </p>
              </div>
            </div>
          </div>

          {/* Botones de acción principal */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto rounded-lg border cursor-pointer border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto rounded-lg bg-primary cursor-pointer px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar Producto"}
            </button>
          </div>
        </form>
      </div>

      {/* Pop-up Alta Rápida Marca */}
      {mostrarAltaMarca && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text">Nueva Marca</h3>
            <input
              type="text"
              placeholder="Nombre de la marca"
              value={nuevaMarcaNombre}
              onChange={(e) => setNuevaMarcaNombre(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarAltaMarca(false)}
                className="px-3 py-1 text-xs text-text-dim hover:underline"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoSubitem}
                onClick={handleCrearMarcaRapida}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {guardandoSubitem ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Alta Rápida Categoría */}
      {mostrarAltaCategoria && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text">Nueva Categoría</h3>
            <input
              type="text"
              placeholder="Nombre de la categoría"
              value={nuevaCategoriaNombre}
              onChange={(e) => setNuevaCategoriaNombre(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarAltaCategoria(false)}
                className="px-3 py-1 text-xs text-text-dim hover:underline"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoSubitem}
                onClick={handleCrearCategoriaRapida}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {guardandoSubitem ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}