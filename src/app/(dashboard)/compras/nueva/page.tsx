"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import Select from "@/components/ui/select";

interface Proveedor {
  id: number;
  nombre: string;
}

interface CuentaOpcion {
  id: number;
  nombre: string;
  tipo: "EFECTIVO_ARS" | "EFECTIVO_USD" | "BANCO_ARS" | "BANCO_USD";
}

interface ProductoBusqueda {
  id: number;
  nombre: string;
  codigoBarras: string | null;
  stockActual: number;
  precioCosto: number;
  monedaPrecio: "USD" | "ARS";
  marca?: { nombre: string } | null;
}

interface ItemCarrito {
  productoId: number;
  nombre: string;
  cantidad: number;
  costoUnitarioUSD: number;
}

const TIPO_CUENTA_LABEL: Record<CuentaOpcion["tipo"], string> = {
  EFECTIVO_ARS: "Efectivo ARS",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Banco ARS",
  BANCO_USD: "Banco USD",
};

const esTipoCuentaUSD = (tipo: CuentaOpcion["tipo"]) =>
  tipo === "EFECTIVO_USD" || tipo === "BANCO_USD";

// Límites de validación para cantidad y costo unitario
const CANTIDAD_MIN = 1;
const CANTIDAD_MAX = 99999;
const COSTO_MIN = 0;
const COSTO_MAX = 1_000_000;

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
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputBusquedaRef = useRef<HTMLInputElement>(null);

  // Carrito
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  // Envío
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [compraCreada, setCompraCreada] = useState<{ id: number } | null>(null);
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
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(busqueda.trim())}`);
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

  const agregarAlCarrito = useCallback(
    (producto: ProductoBusqueda) => {
      const costoUnitarioUSD = !usaCotizacionUSD
        ? producto.precioCosto
        : producto.monedaPrecio === "ARS"
        ? Number((producto.precioCosto / cotizacion).toFixed(2))
        : producto.precioCosto;

      setCarrito((prev) => {
        const existente = prev.find((it) => it.productoId === producto.id);
        if (existente) {
          return prev.map((it) =>
            it.productoId === producto.id ? { ...it, cantidad: it.cantidad + 1 } : it
          );
        }
        return [
          ...prev,
          {
            productoId: producto.id,
            nombre: producto.nombre,
            cantidad: 1,
            costoUnitarioUSD,
          },
        ];
      });
      setBusqueda("");
      setResultados([]);
      inputBusquedaRef.current?.focus();
    },
    [cotizacion, usaCotizacionUSD]
  );

  const handleKeyDownBusqueda = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && resultados.length > 0) {
      e.preventDefault();
      const exacto = resultados.find((r) => r.codigoBarras === busqueda.trim());
      agregarAlCarrito(exacto ?? resultados[0]);
    }
  };

  // Actualiza un campo del carrito mientras el usuario tipea.
  // No fuerza el MÍNIMO acá (para poder borrar y escribir un número nuevo con libertad),
  // pero sí recorta el MÁXIMO en el momento, para que no se puedan tipear números absurdos.
  const actualizarItem = (
    productoId: number,
    campo: "cantidad" | "costoUnitarioUSD",
    valor: number
  ) => {
    const max = campo === "cantidad" ? CANTIDAD_MAX : COSTO_MAX;
    const valorClampeado = Number.isFinite(valor) && valor > max ? max : valor;
    setCarrito((prev) =>
      prev.map((it) => (it.productoId === productoId ? { ...it, [campo]: valorClampeado } : it))
    );
  };

  // Normaliza (clampea) un campo al salir del input (onBlur), evitando valores
  // vacíos, negativos, cero (para cantidad) o por encima del máximo permitido.
  const normalizarItem = (
    productoId: number,
    campo: "cantidad" | "costoUnitarioUSD",
    valorCrudo: number
  ) => {
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

    setCarrito((prev) =>
      prev.map((it) => (it.productoId === productoId ? { ...it, [campo]: normalizado } : it))
    );
  };

  const quitarItem = (productoId: number) => {
    setCarrito((prev) => prev.filter((it) => it.productoId !== productoId));
  };

  const totalUSD = useMemo(
    () => carrito.reduce((acc, it) => acc + it.cantidad * it.costoUnitarioUSD, 0),
    [carrito]
  );
  const totalARS = totalUSD * cotizacion;

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
    if (carrito.length === 0) {
      setError("Agregá al menos un producto a la compra.");
      return;
    }
    if (!cuentaId) {
      setError("Elegí la cuenta desde la que se va a pagar la compra.");
      return;
    }

    // Validación de ítems: cantidad debe ser >= 1 y costo no puede ser negativo.
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

    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: proveedorId || null,
          cuentaId: Number(cuentaId),
          items: carrito.map((it) => ({
            productoId: it.productoId,
            cantidad: it.cantidad,
            costoUnitarioUSD: it.costoUnitarioUSD,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear la compra");
      setCompraCreada({ id: data.id });
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al guardar la compra");
    } finally {
      setEnviando(false);
    }
  };

  const confirmarCompra = async () => {
    if (!compraCreada) return;
    setConfirmando(true);
    setErrorConfirmar(null);
    try {
      const res = await fetch(`/api/compras/${compraCreada.id}/confirmar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al confirmar la compra");
      router.push("/compras");
    } catch (err: any) {
      setErrorConfirmar(err.message || "Ocurrió un error al confirmar la compra");
    } finally {
      setConfirmando(false);
    }
  };

  if (compraCreada) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-4 text-center">
        <div className="rounded-2xl border border-border bg-white p-8">
          <p className="text-lg font-semibold text-text">Compra #{compraCreada.id} guardada</p>
          <p className="mt-2 text-sm text-text-dim">
            Todavía no impactó en stock, costo ni caja. Confirmala para actualizar el
            inventario y descontar el saldo de la cuenta, o hacelo más tarde desde el listado.
          </p>

          {errorConfirmar && <p className="mt-3 text-sm text-danger">{errorConfirmar}</p>}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              disabled={confirmando}
              onClick={confirmarCompra}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium cursor-pointer text-white hover:opacity-90 disabled:opacity-50"
            >
              {confirmando ? "Confirmando..." : "Confirmar compra ahora"}
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
        <p className="text-xs uppercase tracking-wide text-text-dim">
          Cuenta desde la que se paga
        </p>
        <Select
          value={cuentaId}
          onChange={(value) => setCuentaId(value)}
          options={[
            { value: "", label: "Elegí una cuenta..." },
            ...cuentas.map((c) => ({
              value: String(c.id),
              label: `${c.nombre} — ${TIPO_CUENTA_LABEL[c.tipo]}`,
            })),
          ]}
          className="w-full"
        />
        {cuentas.length === 0 && (
          <p className="text-xs text-text-dim">
            No hay cuentas activas registradas. Creá una desde Caja/Cuentas antes de comprar.
          </p>
        )}
      </div>

      {/* Buscador de producto */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-text-dim">
          Buscar producto / código de barras
        </p>
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
          {(resultados.length > 0 || buscando) && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
              {buscando ? (
                <p className="px-3 py-2 text-sm text-text-dim">Buscando...</p>
              ) : (
                resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregarAlCarrito(p)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                  >
                    <span className="truncate text-text">
                      {p.nombre}
                      {p.marca?.nombre ? ` — ${p.marca.nombre}` : ""}
                    </span>
                    <span className="shrink-0 text-xs text-text-dim">
                      Stock: {p.stockActual} · Costo: {p.precioCosto} {p.monedaPrecio}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Carrito */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-text-dim">Ítems de la compra</p>
        {carrito.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-dim">Todavía no agregaste productos.</p>
        ) : (
          <>
            {/* Desktop / tablet: tabla */}
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-topbar">
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Cantidad</th>
                    <th className="px-4 py-3">{usaCotizacionUSD ? "Costo unit. (USD)" : "Costo unitario"}</th>
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
                            actualizarItem(
                              it.productoId,
                              "cantidad",
                              raw === "" ? ("" as unknown as number) : Number(raw)
                            );
                          }}
                          onBlur={(e) =>
                            normalizarItem(it.productoId, "cantidad", Number(e.target.value))
                          }
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
                            actualizarItem(
                              it.productoId,
                              "costoUnitarioUSD",
                              raw === "" ? ("" as unknown as number) : Number(raw)
                            );
                          }}
                          onBlur={(e) =>
                            normalizarItem(it.productoId, "costoUnitarioUSD", Number(e.target.value))
                          }
                          className="w-24 rounded-md border border-border bg-white px-2 py-1 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-text">
                        {usaCotizacionUSD ? "" : "$"}{(it.cantidad * it.costoUnitarioUSD).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => quitarItem(it.productoId)}
                          className="text-text-dim hover:text-danger"
                        >
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
                          actualizarItem(
                            it.productoId,
                            "cantidad",
                            raw === "" ? ("" as unknown as number) : Number(raw)
                          );
                        }}
                        onBlur={(e) =>
                          normalizarItem(it.productoId, "cantidad", Number(e.target.value))
                        }
                        className="mt-0.5 w-full rounded-md border border-border bg-white px-2 py-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-text-dim">
                        {usaCotizacionUSD ? "Costo unit. (USD)" : "Costo unitario"}
                      </label>
                      <input
                        type="number"
                        min={COSTO_MIN}
                        max={COSTO_MAX}
                        step="0.01"
                        value={it.costoUnitarioUSD}
                        onChange={(e) => {
                          const raw = e.target.value;
                          actualizarItem(
                            it.productoId,
                            "costoUnitarioUSD",
                            raw === "" ? ("" as unknown as number) : Number(raw)
                          );
                        }}
                        onBlur={(e) =>
                          normalizarItem(it.productoId, "costoUnitarioUSD", Number(e.target.value))
                        }
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
            <p className="text-xs uppercase tracking-wide text-text-dim">Total</p>
            {usaCotizacionUSD ? (
              <>
                <p className="text-2xl font-semibold text-text">USD {totalUSD.toFixed(2)}</p>
                <p className="text-sm text-text-dim">
                  ≈ ARS {totalARS.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                  {cuentaSeleccionada && (
                    <span> · se debitará en {TIPO_CUENTA_LABEL[cuentaSeleccionada.tipo]} al confirmar</span>
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
                    Se debitará en {TIPO_CUENTA_LABEL[cuentaSeleccionada.tipo]} al confirmar
                  </p>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            disabled={enviando || carrito.length === 0}
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