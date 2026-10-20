"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import Select from "@/components/ui/select";
import { ConfirmarCompraModal } from "@/components/compras/confirmar-compra-modal";
import { GrillaCantidades, cantidadDe, sumarCantidades } from "@/components/ui/grilla-cantidades";
import { agruparResultados } from "@/lib/agrupar-variantes";
import type { ProductoBusquedaDTO } from "@/types/producto";

interface Proveedor {
  id: number;
  nombre: string;
}

interface CuentaOpcion {
  id: number;
  nombre: string;
  tipo: "EFECTIVO_ARS" | "EFECTIVO_USD" | "BANCO_ARS" | "BANCO_USD";
}

interface ItemCarrito {
  productoId: number;
  nombre: string;
  cantidad: number;
  costoUnitarioUSD: number;
}

/** Un modelo de ropa cargado con su grilla talle × color (RV-6, #65). */
interface BloqueModelo {
  modeloId: number;
  nombre: string;
  variantes: ProductoBusquedaDTO[];
  /** Costo para todo el modelo (texto, para poder editarlo con libertad). */
  costo: string;
  /** Si está activo, cada combinación puede tener su propio costo. */
  porCombinacion: boolean;
  /** Costos propios por productoId (vacío = usa el del modelo). */
  costos: Record<number, string>;
  /** Cantidades por productoId. */
  cantidades: Record<number, string>;
}

const TIPO_CUENTA_LABEL: Record<CuentaOpcion["tipo"], string> = {
  EFECTIVO_ARS: "Efectivo ARS",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Banco ARS",
  BANCO_USD: "Banco USD",
};

// Límites de validación para cantidad y costo unitario
const CANTIDAD_MIN = 1;
const CANTIDAD_MAX = 99999;
const COSTO_MIN = 0;
const COSTO_MAX = 1_000_000;

const INPUT_COSTO =
  "w-full rounded-md border border-border bg-white px-2 py-1 text-center font-mono text-xs text-text placeholder:text-text-dim/60 focus:outline-none focus:ring-1 focus:ring-primary";

/** Costo propio de la combinación si lo tiene; si no, el del modelo. NaN si es inválido. */
function costoDe(b: BloqueModelo, productoId: number): number {
  const propio = b.porCombinacion ? b.costos[productoId] : undefined;
  const texto = propio !== undefined && propio.trim() !== "" ? propio : b.costo;
  return texto.trim() === "" ? NaN : Number(texto);
}

const costoValido = (n: number) => Number.isFinite(n) && n >= COSTO_MIN && n <= COSTO_MAX;

export default function NuevaCompraPage() {
  const router = useRouter();

  // Proveedor
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState<string>("");
  const [altaRapidaAbierta, setAltaRapidaAbierta] = useState(false);
  const [nombreProveedorNuevo, setNombreProveedorNuevo] = useState("");
  const [creandoProveedor, setCreandoProveedor] = useState(false);

  // Cuenta de pago
  const [cuentas, setCuentas] = useState<CuentaOpcion[]>([]);
  const [cuentaId, setCuentaId] = useState<string>("");

  // Cotización
  const [cotizacion, setCotizacion] = useState<number>(1000);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);

  // Buscador de producto
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoBusquedaDTO[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputBusquedaRef = useRef<HTMLInputElement>(null);

  // Carrito: productos sueltos + modelos con grilla
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [bloques, setBloques] = useState<BloqueModelo[]>([]);

  // Envío
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [compraCreada, setCompraCreada] = useState<{ id: number; numero: number } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proveedores")
      .then((r) => r.json())
      .then((data) => setProveedores(data.items ?? data))
      .catch(() => setProveedores([]));

    fetch("/api/cuentas")
      .then((r) => r.json())
      .then((data) => setCuentas(data.items ?? []))
      .catch(() => setCuentas([]));

    fetch("/api/configuracion")
      .then((r) => r.json())
      .then((data) => {
        if (data?.cotizacionUSD) setCotizacion(Number(data.cotizacionUSD));
        setUsaCotizacionUSD(data?.usaCotizacionUSD ?? false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const timeout = setTimeout(async () => {
      try {
        // agrupar=1: trae más resultados para poder juntar las combinaciones de cada modelo en una fila.
        const res = await fetch(`/api/productos/buscar?agrupar=1&q=${encodeURIComponent(busqueda.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResultados(data.items ?? []);
        }
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  const filas = useMemo(() => agruparResultados(resultados, 10), [resultados]);

  /** Costo de lista del producto, expresado en la moneda en la que se carga la compra. */
  const costoInicial = useCallback(
    (producto: { precioCosto: number; monedaPrecio: "USD" | "ARS" }) =>
      !usaCotizacionUSD
        ? producto.precioCosto
        : producto.monedaPrecio === "ARS"
        ? Number((producto.precioCosto / cotizacion).toFixed(2))
        : producto.precioCosto,
    [cotizacion, usaCotizacionUSD]
  );

  const limpiarBusqueda = () => {
    setBusqueda("");
    setResultados([]);
    inputBusquedaRef.current?.focus();
  };

  const agregarAlCarrito = useCallback(
    (producto: ProductoBusquedaDTO) => {
      const costoUnitarioUSD = costoInicial(producto);
      setCarrito((prev) => {
        const existente = prev.find((it) => it.productoId === producto.id);
        if (existente) {
          return prev.map((it) =>
            it.productoId === producto.id ? { ...it, cantidad: it.cantidad + 1 } : it
          );
        }
        return [...prev, { productoId: producto.id, nombre: producto.nombre, cantidad: 1, costoUnitarioUSD }];
      });
      limpiarBusqueda();
    },
    [costoInicial]
  );

  /**
   * Agrega un modelo con su grilla. Trae TODAS las combinaciones del modelo
   * (no solo las que coincidieron con la búsqueda). Si `sumarA` viene (lector de
   * código de barras de una combinación), suma 1 en esa celda.
   */
  const agregarModelo = useCallback(
    async (modeloId: number, nombre: string, sumarA?: number) => {
      limpiarBusqueda();
      setError(null);

      const yaCargado = bloques.some((b) => b.modeloId === modeloId);
      if (yaCargado) {
        if (sumarA != null) {
          setBloques((prev) =>
            prev.map((b) =>
              b.modeloId === modeloId
                ? { ...b, cantidades: { ...b.cantidades, [sumarA]: String(Math.min(cantidadDe(b.cantidades, sumarA) + 1, CANTIDAD_MAX)) } }
                : b
            )
          );
        } else {
          setError(`"${nombre}" ya está cargado: completá su grilla más abajo.`);
        }
        return;
      }

      try {
        const res = await fetch(`/api/productos/buscar?modeloId=${modeloId}`);
        const data = await res.json();
        const variantes: ProductoBusquedaDTO[] = res.ok ? data.items ?? [] : [];
        if (variantes.length === 0) {
          setError(`"${nombre}" no tiene combinaciones de talle y color. Crealas desde Productos.`);
          return;
        }
        const costo = costoInicial(variantes[0]);
        setBloques((prev) => [
          ...prev,
          {
            modeloId,
            nombre,
            variantes,
            costo: String(costo),
            porCombinacion: false,
            costos: {},
            cantidades: sumarA != null ? { [sumarA]: "1" } : {},
          },
        ]);
      } catch {
        setError("No se pudo cargar el modelo. Probá de nuevo.");
      }
    },
    [bloques, costoInicial]
  );

  const handleKeyDownBusqueda = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || filas.length === 0) return;
    e.preventDefault();
    // Código de barras exacto: va directo a esa combinación / producto.
    const exacto = resultados.find((r) => r.codigoBarras && r.codigoBarras === busqueda.trim());
    if (exacto) {
      if (exacto.modeloId != null) {
        void agregarModelo(exacto.modeloId, exacto.modeloNombre?.trim() || exacto.nombre, exacto.id);
      } else {
        agregarAlCarrito(exacto);
      }
      return;
    }
    const primera = filas[0];
    if (primera.tipo === "producto") agregarAlCarrito(primera.producto);
    else void agregarModelo(primera.modeloId, primera.nombre);
  };

  // --- Productos sueltos ---

  // Actualiza un campo del carrito mientras el usuario tipea.
  // No fuerza el MÍNIMO acá (para poder borrar y escribir un número nuevo con libertad),
  // pero sí recorta el MÁXIMO en el momento, para que no se puedan tipear números absurdos.
  const actualizarItem = (productoId: number, campo: "cantidad" | "costoUnitarioUSD", valor: number) => {
    const max = campo === "cantidad" ? CANTIDAD_MAX : COSTO_MAX;
    const valorClampeado = Number.isFinite(valor) && valor > max ? max : valor;
    setCarrito((prev) => prev.map((it) => (it.productoId === productoId ? { ...it, [campo]: valorClampeado } : it)));
  };

  // Normaliza (clampea) un campo al salir del input (onBlur), evitando valores
  // vacíos, negativos, cero (para cantidad) o por encima del máximo permitido.
  const normalizarItem = (productoId: number, campo: "cantidad" | "costoUnitarioUSD", valorCrudo: number) => {
    const min = campo === "cantidad" ? CANTIDAD_MIN : COSTO_MIN;
    const max = campo === "cantidad" ? CANTIDAD_MAX : COSTO_MAX;

    let normalizado = valorCrudo;
    if (!Number.isFinite(normalizado) || normalizado < min) {
      normalizado = min;
    } else if (normalizado > max) {
      normalizado = max;
    }
    if (campo === "costoUnitarioUSD") {
      normalizado = Number(normalizado.toFixed(2));
    }

    setCarrito((prev) => prev.map((it) => (it.productoId === productoId ? { ...it, [campo]: normalizado } : it)));
  };

  const quitarItem = (productoId: number) => {
    setCarrito((prev) => prev.filter((it) => it.productoId !== productoId));
  };

  // --- Modelos con grilla ---

  const actualizarBloque = (modeloId: number, cambios: (b: BloqueModelo) => Partial<BloqueModelo>) =>
    setBloques((prev) => prev.map((b) => (b.modeloId === modeloId ? { ...b, ...cambios(b) } : b)));

  const quitarBloque = (modeloId: number) => setBloques((prev) => prev.filter((b) => b.modeloId !== modeloId));

  /** Deja el costo con 2 decimales y dentro de los límites al salir del input. */
  const normalizarCostoTexto = (texto: string): string => {
    if (texto.trim() === "") return "";
    const n = Number(texto);
    if (!Number.isFinite(n)) return "";
    return String(Number(Math.min(Math.max(n, COSTO_MIN), COSTO_MAX).toFixed(2)));
  };

  const unidadesBloque = (b: BloqueModelo) => sumarCantidades(b.cantidades);
  const subtotalBloque = (b: BloqueModelo) =>
    b.variantes.reduce((acc, v) => {
      const cant = cantidadDe(b.cantidades, v.id);
      const costo = costoDe(b, v.id);
      return cant > 0 && Number.isFinite(costo) ? acc + cant * costo : acc;
    }, 0);

  const totalUSD = useMemo(
    () =>
      carrito.reduce((acc, it) => acc + it.cantidad * it.costoUnitarioUSD, 0) +
      bloques.reduce((acc, b) => acc + subtotalBloque(b), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carrito, bloques]
  );
  const totalARS = totalUSD * cotizacion;
  const totalUnidades = carrito.reduce((acc, it) => acc + (Number.isFinite(it.cantidad) ? it.cantidad : 0), 0) +
    bloques.reduce((acc, b) => acc + unidadesBloque(b), 0);
  const hayItems = carrito.length > 0 || bloques.some((b) => unidadesBloque(b) > 0);

  const cuentaSeleccionada = cuentas.find((c) => String(c.id) === cuentaId);

  const crearProveedorRapido = async () => {
    if (!nombreProveedorNuevo.trim()) return;
    setCreandoProveedor(true);
    try {
      const res = await fetch("/api/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreProveedorNuevo.trim() }),
      });
      if (res.ok) {
        const nuevo = await res.json();
        setProveedores((prev) => [...prev, nuevo]);
        setProveedorId(String(nuevo.id));
        setNombreProveedorNuevo("");
        setAltaRapidaAbierta(false);
      }
    } finally {
      setCreandoProveedor(false);
    }
  };

  const guardarCompra = async () => {
    if (!hayItems) {
      setError("Agregá al menos un producto a la compra (con cantidad mayor a 0).");
      return;
    }

    // Validación de productos sueltos: cantidad >= 1 y costo no negativo.
    const itemInvalido = carrito.find(
      (it) =>
        !Number.isFinite(it.cantidad) ||
        it.cantidad < CANTIDAD_MIN ||
        !Number.isFinite(it.costoUnitarioUSD) ||
        it.costoUnitarioUSD < COSTO_MIN
    );
    if (itemInvalido) {
      setError(
        `Revisá "${itemInvalido.nombre}": la cantidad debe ser al menos ${CANTIDAD_MIN} y el costo no puede ser negativo.`
      );
      return;
    }

    // Una línea por combinación con cantidad > 0, con el costo propio o el del modelo.
    const itemsGrilla: { productoId: number; cantidad: number; costoUnitarioUSD: number }[] = [];
    for (const b of bloques) {
      for (const v of b.variantes) {
        const cantidad = cantidadDe(b.cantidades, v.id);
        if (cantidad === 0) continue;
        const costo = costoDe(b, v.id);
        if (!costoValido(costo)) {
          setError(`Revisá el costo de "${v.nombre}": tiene que ser un número entre ${COSTO_MIN} y ${COSTO_MAX}.`);
          return;
        }
        itemsGrilla.push({ productoId: v.id, cantidad, costoUnitarioUSD: Number(costo.toFixed(2)) });
      }
    }

    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: proveedorId || null,
          // Opcional: queda sugerida al confirmar (ahí se decide cuánto se paga).
          cuentaId: cuentaId ? Number(cuentaId) : null,
          items: [
            ...carrito.map((it) => ({
              productoId: it.productoId,
              cantidad: it.cantidad,
              costoUnitarioUSD: it.costoUnitarioUSD,
            })),
            ...itemsGrilla,
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear la compra");
      setCompraCreada({ id: data.id, numero: data.numero });
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al guardar la compra");
    } finally {
      setEnviando(false);
    }
  };

  // Confirmar abre la ventana con el paso "¿Actualizar precios?".
  const confirmarCompra = () => {
    if (!compraCreada) return;
    setErrorConfirmar(null);
    setConfirmando(true);
  };

  if (compraCreada) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-4 text-center">
        <div className="rounded-2xl border border-border bg-white p-8">
          <p className="text-lg font-semibold text-text">Compra #{compraCreada.numero} guardada</p>
          <p className="mt-2 text-sm text-text-dim">
            Todavía no impactó en stock, costo ni caja. Confirmala para actualizar el
            inventario y registrar el pago (todo, una parte o nada), o hacelo más tarde desde el listado.
          </p>

          {errorConfirmar && <p className="mt-3 text-sm text-danger">{errorConfirmar}</p>}
          {confirmando && (
            <ConfirmarCompraModal
              compraId={compraCreada.id}
              onCerrar={() => setConfirmando(false)}
              onConfirmada={() => router.push("/compras")}
            />
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              disabled={confirmando}
              onClick={confirmarCompra}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium cursor-pointer text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirmar compra ahora
            </button>
            <button
              type="button"
              onClick={() => router.push("/compras")}
              className="rounded-lg border border-border bg-white cursor-pointer px-4 py-2.5 text-sm text-text-dim hover:bg-surface-hover"
            >
              Confirmar más tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  const etiquetaCosto = usaCotizacionUSD ? "Costo unit. (USD)" : "Costo unitario";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Nueva Compra</h1>
        <p className="text-sm text-text-dim">Cargá los productos y revisá el total</p>
      </div>

      {/* Proveedor */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-text-dim">Proveedor (opcional)</p>
        {!altaRapidaAbierta ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={proveedorId}
              onChange={(value) => setProveedorId(value)}
              options={[
                { value: "", label: "Sin especificar" },
                ...proveedores.map((p) => ({ value: String(p.id), label: p.nombre })),
              ]}
              className="w-full min-w-0 sm:flex-1"
            />
            <button
              type="button"
              onClick={() => setAltaRapidaAbierta(true)}
              className="whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-dim hover:bg-surface-hover"
            >
              + Nuevo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              autoFocus
              placeholder="Nombre del proveedor"
              value={nombreProveedorNuevo}
              onChange={(e) => setNombreProveedorNuevo(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary sm:flex-1"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={creandoProveedor || !nombreProveedorNuevo.trim()}
                onClick={crearProveedorRapido}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:flex-none"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setAltaRapidaAbierta(false)}
                className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-dim hover:bg-surface-hover sm:flex-none"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cuenta de pago */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-text-dim">Cuenta desde la que se paga (opcional)</p>
        <Select
          value={cuentaId}
          onChange={(value) => setCuentaId(value)}
          options={[
            { value: "", label: "Decidir al confirmar" },
            ...cuentas.map((c) => ({
              value: String(c.id),
              label: `${c.nombre} — ${TIPO_CUENTA_LABEL[c.tipo]}`,
            })),
          ]}
          className="w-full"
        />
        <p className="text-xs text-text-dim">
          Al confirmar la compra elegís si la pagás completa, una parte o nada. Lo que no pagues queda como deuda con el proveedor.
        </p>
      </div>

      {/* Buscador de producto */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-text-dim">Buscar producto / modelo / código de barras</p>
        <div className="relative">
          <input
            ref={inputBusquedaRef}
            type="text"
            autoFocus
            placeholder="Nombre o código de barras..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={handleKeyDownBusqueda}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {(filas.length > 0 || buscando) && (
            <div className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-white shadow-lg">
              {buscando ? (
                <p className="px-3 py-2 text-sm text-text-dim">Buscando...</p>
              ) : (
                filas.map((fila) =>
                  fila.tipo === "producto" ? (
                    <button
                      key={`p-${fila.producto.id}`}
                      type="button"
                      onClick={() => agregarAlCarrito(fila.producto)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                    >
                      <span className="truncate text-text">
                        {fila.producto.nombre}
                        {fila.producto.marca?.nombre ? ` — ${fila.producto.marca.nombre}` : ""}
                      </span>
                      <span className="shrink-0 text-xs text-text-dim">
                        Stock: {fila.producto.stockActual} · Costo: {fila.producto.precioCosto} {fila.producto.monedaPrecio}
                      </span>
                    </button>
                  ) : (
                    <button
                      key={`m-${fila.modeloId}`}
                      type="button"
                      onClick={() => void agregarModelo(fila.modeloId, fila.nombre)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                    >
                      <span className="truncate text-text">
                        {fila.nombre}
                        {fila.marca ? ` — ${fila.marca}` : ""}
                      </span>
                      <span className="shrink-0 text-xs text-text-dim">
                        {fila.variantes.length} {fila.variantes.length === 1 ? "combinación" : "combinaciones"} · Stock: {fila.stock} · Cargar con grilla
                      </span>
                    </button>
                  )
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modelos con grilla talle × color */}
      {bloques.map((b) => {
        const unidades = unidadesBloque(b);
        const costoModeloInvalido = !costoValido(Number(b.costo)) || b.costo.trim() === "";
        return (
          <div key={b.modeloId} className="space-y-3 rounded-2xl border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text">{b.nombre}</p>
                <p className="text-xs text-text-dim">
                  {unidades} {unidades === 1 ? "unidad" : "unidades"} · Subtotal{" "}
                  <span className="font-mono text-text">
                    {usaCotizacionUSD ? "USD " : "$"}
                    {subtotalBloque(b).toFixed(2)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => quitarBloque(b.modeloId)}
                aria-label={`Quitar ${b.nombre}`}
                className="shrink-0 cursor-pointer text-text-dim hover:text-danger"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:w-48">
                <label className="block text-[11px] text-text-dim">
                  {etiquetaCosto} · todo el modelo
                </label>
                <input
                  type="number"
                  min={COSTO_MIN}
                  max={COSTO_MAX}
                  step="0.01"
                  value={b.costo}
                  onChange={(e) => actualizarBloque(b.modeloId, () => ({ costo: e.target.value }))}
                  onBlur={(e) => actualizarBloque(b.modeloId, () => ({ costo: normalizarCostoTexto(e.target.value) }))}
                  aria-invalid={costoModeloInvalido}
                  className="mt-0.5 w-full rounded-md border border-border bg-white px-2 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-text-dim">
                <input
                  type="checkbox"
                  checked={b.porCombinacion}
                  onChange={(e) => actualizarBloque(b.modeloId, () => ({ porCombinacion: e.target.checked }))}
                  className="h-4 w-4 cursor-pointer"
                />
                Costo distinto por combinación
              </label>
            </div>

            <GrillaCantidades
              variantes={b.variantes}
              cantidades={b.cantidades}
              onCambiar={(id, valor) =>
                actualizarBloque(b.modeloId, (actual) => ({ cantidades: { ...actual.cantidades, [id]: valor } }))
              }
              detalle={(v) => (b.porCombinacion ? null : <>Stock {v.stockActual}</>)}
              extra={
                b.porCombinacion
                  ? (v) => (
                      <input
                        type="number"
                        min={COSTO_MIN}
                        max={COSTO_MAX}
                        step="0.01"
                        value={b.costos[v.id] ?? ""}
                        placeholder={b.costo || "costo"}
                        onChange={(e) =>
                          actualizarBloque(b.modeloId, (actual) => ({ costos: { ...actual.costos, [v.id]: e.target.value } }))
                        }
                        onBlur={(e) =>
                          actualizarBloque(b.modeloId, (actual) => ({
                            costos: { ...actual.costos, [v.id]: normalizarCostoTexto(e.target.value) },
                          }))
                        }
                        aria-label={`Costo de ${v.nombre}`}
                        className={INPUT_COSTO}
                      />
                    )
                  : undefined
              }
            />
            {b.porCombinacion && (
              <p className="text-[11px] text-text-dim">
                Las celdas de costo vacías usan el costo del modelo ({b.costo || "—"}).
              </p>
            )}
          </div>
        );
      })}

      {/* Productos sueltos */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-text-dim">
          {bloques.length > 0 ? "Otros productos de la compra" : "Ítems de la compra"}
        </p>
        {carrito.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-dim">
            {bloques.length > 0 ? "Sin otros productos." : "Todavía no agregaste productos."}
          </p>
        ) : (
          <>
            {/* Desktop / tablet: tabla */}
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-topbar">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Cantidad</th>
                    <th className="px-4 py-3">{etiquetaCosto}</th>
                    <th className="px-4 py-3">{usaCotizacionUSD ? "Subtotal USD" : "Subtotal"}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((it) => (
                    <tr key={it.productoId} className="border-t border-border">
                      <td className="px-4 py-3 text-text">{it.nombre}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={CANTIDAD_MIN}
                          max={CANTIDAD_MAX}
                          value={it.cantidad}
                          onChange={(e) => {
                            const raw = e.target.value;
                            actualizarItem(it.productoId, "cantidad", raw === "" ? ("" as unknown as number) : Number(raw));
                          }}
                          onBlur={(e) => normalizarItem(it.productoId, "cantidad", Number(e.target.value))}
                          className="w-20 rounded-md border border-border bg-white px-2 py-1 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={COSTO_MIN}
                          max={COSTO_MAX}
                          step="0.01"
                          value={it.costoUnitarioUSD}
                          onChange={(e) => {
                            const raw = e.target.value;
                            actualizarItem(it.productoId, "costoUnitarioUSD", raw === "" ? ("" as unknown as number) : Number(raw));
                          }}
                          onBlur={(e) => normalizarItem(it.productoId, "costoUnitarioUSD", Number(e.target.value))}
                          className="w-24 rounded-md border border-border bg-white px-2 py-1 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-text">
                        {usaCotizacionUSD ? "" : "$"}{(it.cantidad * it.costoUnitarioUSD).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => quitarItem(it.productoId)} className="text-text-dim hover:text-danger">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: tarjetas */}
            <div className="space-y-2 md:hidden">
              {carrito.map((it) => (
                <div key={it.productoId} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-text">{it.nombre}</span>
                    <button
                      type="button"
                      onClick={() => quitarItem(it.productoId)}
                      className="shrink-0 text-text-dim hover:text-danger"
                      aria-label="Quitar producto"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-text-dim">Cantidad</label>
                      <input
                        type="number"
                        min={CANTIDAD_MIN}
                        max={CANTIDAD_MAX}
                        value={it.cantidad}
                        onChange={(e) => {
                          const raw = e.target.value;
                          actualizarItem(it.productoId, "cantidad", raw === "" ? ("" as unknown as number) : Number(raw));
                        }}
                        onBlur={(e) => normalizarItem(it.productoId, "cantidad", Number(e.target.value))}
                        className="mt-0.5 w-full rounded-md border border-border bg-white px-2 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-text-dim">{etiquetaCosto}</label>
                      <input
                        type="number"
                        min={COSTO_MIN}
                        max={COSTO_MAX}
                        step="0.01"
                        value={it.costoUnitarioUSD}
                        onChange={(e) => {
                          const raw = e.target.value;
                          actualizarItem(it.productoId, "costoUnitarioUSD", raw === "" ? ("" as unknown as number) : Number(raw));
                        }}
                        onBlur={(e) => normalizarItem(it.productoId, "costoUnitarioUSD", Number(e.target.value))}
                        className="mt-0.5 w-full rounded-md border border-border bg-white px-2 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-right text-sm">
                    <span className="text-text-dim">Subtotal: </span>
                    <span className="font-medium text-text">
                      {usaCotizacionUSD ? `USD ${(it.cantidad * it.costoUnitarioUSD).toFixed(2)}` : `$${(it.cantidad * it.costoUnitarioUSD).toFixed(2)}`}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Total + guardar */}
      <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dim">
              Total · {totalUnidades} {totalUnidades === 1 ? "unidad" : "unidades"}
            </p>
            {usaCotizacionUSD ? (
              <>
                <p className="text-2xl font-semibold text-text">USD {totalUSD.toFixed(2)}</p>
                <p className="text-sm text-text-dim">
                  ≈ ARS {totalARS.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                  {cuentaSeleccionada && (
                    <span> · se pagaría desde {TIPO_CUENTA_LABEL[cuentaSeleccionada.tipo]} al confirmar</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold text-text">
                  {totalUSD.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 })}
                </p>
                {cuentaSeleccionada && (
                  <p className="text-sm text-text-dim">
                    Se pagaría desde {TIPO_CUENTA_LABEL[cuentaSeleccionada.tipo]} al confirmar
                  </p>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            disabled={enviando || !hayItems}
            onClick={guardarCompra}
            className="w-full rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer sm:w-auto"
          >
            {enviando ? "Guardando..." : "Guardar Compra"}
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}