"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { VentaProvider, useVenta } from "@/components/ventas/venta-context";
import { TogglePrecio } from "@/components/ventas/toggle-precio";
import { BuscadorProducto } from "@/components/ventas/buscador-producto";
import { BuscadorCliente } from "@/components/ventas/buscador-cliente";
import { ModalConsultarPrecio } from "@/components/ventas/modal-consultar-precio";
import { TablaCarrito } from "@/components/ventas/tabla-carrito";
import { ResumenVenta } from "@/components/ventas/resumen-venta";
import { ModalDescuento, type Descuento } from "@/components/ventas/modal-descuento";
import { toArs } from "@/lib/currency";
import type { ProductoBusquedaDTO } from "@/types/producto";
import type { ItemCarrito, TipoPrecioLinea } from "@/types/item-carrito";
import { SelectorCobro } from "@/components/ventas/selector-cobro";
import { obtenerPresupuestoParaConvertir } from "@/app/(dashboard)/presupuestos/actions";
import { confirmarVenta, registrarPedido, descontarStockSinVenta, verificarStockDisponible, type StockDisponibilidad } from "./actions";
import { ModalStockComprometido } from "@/components/ventas/modal-stock-comprometido";
import { Tag, Gift } from "lucide-react";


export default function NuevaVentaPage() {
  return (
    <VentaProvider>
      {/* useSearchParams exige Suspense en Next 16 + Turbopack o rompe el build */}
      <Suspense fallback={null}>
        <NuevaVentaContenido />
      </Suspense>
    </VentaProvider>
  );
}

function NuevaVentaContenido() {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [modalPrecioAbierto, setModalPrecioAbierto] = useState(false);
  const [modalDescuentoAbierto, setModalDescuentoAbierto] = useState(false);
  const [descuento, setDescuento] = useState<Descuento>(null);

  // --- Prefill desde un Presupuesto ("Convertir a venta") ---
  const searchParams = useSearchParams();
  const presupuestoIdParam = searchParams.get("presupuestoId");
  const [presupuestoIdOrigen, setPresupuestoIdOrigen] = useState<number | null>(null);
  const yaPrecargado = useRef(false);

  const { tipoPrecio, cliente, setCliente, modoCobro, setModoCobro, pagos, setPagos, cotizacionUSD, usaCotizacionUSD } =
    useVenta();

  const [advertenciaStock, setAdvertenciaStock] = useState<{
    producto: ProductoBusquedaDTO;
    precioUnitarioArs: number;
    stock: StockDisponibilidad;
    unidadesQueriaVender: number;
  } | null>(null);

  useEffect(() => {
    if (!presupuestoIdParam || yaPrecargado.current) return;
    yaPrecargado.current = true;

    const id = Number(presupuestoIdParam);
    if (Number.isNaN(id)) return;

    (async () => {
      const resultado = await obtenerPresupuestoParaConvertir(id);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      const { data } = resultado;
      setPresupuestoIdOrigen(data.presupuestoId);
      setCarrito(
        data.items.map((item) => ({
          id: item.id,
          producto: item.producto,
          tipoPrecio: item.tipoPrecio,
          cantidad: item.cantidad,
          precioUnitarioArs: item.precioUnitarioArs,
        }))
      );
      setCliente(data.cliente);
      setDescuento(
        data.descuentoPorcentaje != null
          ? { tipo: "PORCENTAJE", valor: data.descuentoPorcentaje }
          : data.descuentoMonto != null
            ? { tipo: "MONTO", valor: data.descuentoMonto }
            : null
      );
      toast.success("Presupuesto cargado. Revisá los datos antes de confirmar.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presupuestoIdParam]);

  const subtotal = carrito.reduce((acc, it) => acc + it.cantidad * it.precioUnitarioArs, 0);

  const montoDescuento =
    descuento == null ? 0 : descuento.tipo === "PORCENTAJE" ? subtotal * (descuento.valor / 100) : Math.min(descuento.valor, subtotal);
  const total = Math.max(0, subtotal - montoDescuento);

  const [procesando, setProcesando] = useState(false);

  async function intentarAgregar(producto: ProductoBusquedaDTO, precioUnitarioArs: number) {
    const yaEnCarrito = carrito
      .filter((it) => it.producto.id === producto.id)
      .reduce((acc, it) => acc + it.cantidad, 0);

    const stock = await verificarStockDisponible(producto.id, yaEnCarrito + 1);

    if (stock.alcanza) {
      agregarAlCarrito(producto, precioUnitarioArs);
    } else {
      setAdvertenciaStock({ producto, precioUnitarioArs, stock, unidadesQueriaVender: yaEnCarrito + 1 });
    }
  }

  function agregarAlCarrito(producto: ProductoBusquedaDTO, precioUnitarioArs: number) {
    const nuevoItem: ItemCarrito = {
      id: `${producto.id}-${Date.now()}`,
      producto,
      tipoPrecio,
      cantidad: 1,
      precioUnitarioArs,
    };

    setCarrito((prev) => [...prev, nuevoItem]);
    toast.success(`${producto.nombre} agregado (${tipoPrecio === "MAYORISTA" ? "May" : "Min"})`);
  }

  function agregarProducto(producto: ProductoBusquedaDTO) {
    const precioBaseOriginal =
      tipoPrecio === "MAYORISTA" && producto.precioMayorista != null ? producto.precioMayorista : producto.precioVenta;
    const precioUnitarioArs = toArs(precioBaseOriginal, producto.monedaPrecio, cotizacionUSD);

    intentarAgregar(producto, precioUnitarioArs);
  }

  function cambiarCantidad(id: string, cantidad: number) {
    setCarrito((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (cantidad > it.producto.stockActual) {
          toast.warning(`Solo hay ${it.producto.stockActual} unidades de "${it.producto.nombre}" en stock`);
          return it;
        }
        return { ...it, cantidad };
      })
    );
  }

  function cambiarPrecio(id: string, precioArs: number) {
    setCarrito((prev) => prev.map((it) => (it.id === id ? { ...it, precioUnitarioArs: precioArs } : it)));
  }

  function cambiarTipoPrecio(id: string, tipo: TipoPrecioLinea) {
    setCarrito((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const precioBaseOriginal =
          tipo === "MAYORISTA" && it.producto.precioMayorista != null
            ? it.producto.precioMayorista
            : it.producto.precioVenta;
        return {
          ...it,
          tipoPrecio: tipo,
          precioUnitarioArs: toArs(precioBaseOriginal, it.producto.monedaPrecio, cotizacionUSD),
        };
      })
    );
  }

  function eliminarItem(id: string) {
    setCarrito((prev) => prev.filter((it) => it.id !== id));
  }

  function armarInput() {
    return {
      clienteId: cliente?.id ?? null,
      items: carrito.map((it) => ({
        productoId: it.producto.id,
        cantidad: it.cantidad,
        precioUnitarioArs: it.precioUnitarioArs,
        tipoPrecio: it.tipoPrecio,
      })),
      pagos: pagos.map((p) => ({
        cuentaId: p.cuentaId as number,
        monto: p.monto,
        montoUSD: p.esUSD ? p.montoUSD ?? null : null,
      })),
      descuentoMonto: descuento?.tipo === "MONTO" ? descuento.valor : null,
      descuentoPorcentaje: descuento?.tipo === "PORCENTAJE" ? descuento.valor : null,
      totalARS: total,
      cotizacionUSD: 0, // se completa abajo
      presupuestoId: presupuestoIdOrigen,
    };
  }

  function limpiarVenta() {
    setCarrito([]);
    setDescuento(null);
    setPagos([{ id: "pago-unica", cuentaId: null, monto: 0 }]);
    setModoCobro("UNICA");
    setCliente(null);
    setPresupuestoIdOrigen(null);
  }

  async function handleDescontarStock() {
    if (carrito.length === 0) {
      toast.error("El carrito está vacío.");
      return;
    }
    setProcesando(true);
    const resultado = await descontarStockSinVenta(
      carrito.map((it) => ({
        productoId: it.producto.id,
        cantidad: it.cantidad,
      }))
    );
    setProcesando(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }
    toast.success("Stock descontado");
    limpiarVenta();
  }

    async function handleRegistrarPedido() {
    if (carrito.length === 0) {
      toast.error("El carrito está vacío.");
      return;
    }
    setProcesando(true);
    const resultado = await registrarPedido({ ...armarInput(), cotizacionUSD });
    setProcesando(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }
    toast.success(`Pedido #${resultado.ventaId} registrado`);
    limpiarVenta();
  }

  async function handleConfirmarVenta() {
    if (carrito.length === 0) {
      toast.error("El carrito está vacío.");
      return;
    }
    // Pesos enteros: el total puede tener centavos (descuentos, conversión USD)
    // que no se cobran, igual que en SelectorCobro y en el backend.
    if (modoCobro !== "A_CUENTA" && Math.round(pagos.reduce((a, p) => a + p.monto, 0)) !== Math.round(total)) {
      toast.error("El monto cobrado no coincide con el total. Revisá el cobro.");
      return;
    }
    setProcesando(true);
    const resultado = await confirmarVenta({ ...armarInput(), cotizacionUSD });
    setProcesando(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }
    toast.success(`Venta #${resultado.ventaId} confirmada`);
    limpiarVenta();
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Nueva Venta</h1>
        <p className="text-sm text-text-dim">Buscá cliente y productos, y confirmá el cobro</p>
      </div>

      {presupuestoIdOrigen != null && (
        <div className="rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-primary">
          Convirtiendo el presupuesto #{presupuestoIdOrigen} — revisá los datos antes de confirmar.
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-1 sm:min-w-0">
          <div className="w-full sm:flex-1 sm:min-w-[180px]">
            <BuscadorCliente />
          </div>
          <div className="w-full sm:flex-[2] sm:min-w-[220px]">
            <BuscadorProducto onSeleccionar={agregarProducto} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-start sm:shrink-0">
          <TogglePrecio />
          <button
            type="button"
            onClick={() => setModalPrecioAbierto(true)}
            className="flex items-center gap-1.5 whitespace-nowrap cursor-pointer rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
          >
            <Tag size={14} /> <span className="hidden sm:inline">Consultar precio</span>
            <span className="sm:hidden">Precio</span>
          </button>
        </div>
      </div>

      <TablaCarrito
        items={carrito}
        onCambiarCantidad={cambiarCantidad}
        onCambiarPrecio={cambiarPrecio}
        onCambiarTipoPrecio={cambiarTipoPrecio}
        onEliminar={eliminarItem}
      />

      {carrito.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_220px]">
            <SelectorCobro
              total={total}
              tieneCliente={cliente != null}
              modo={modoCobro}
              pagos={pagos}
              onCambiarModo={setModoCobro}
              onCambiarPagos={setPagos}
              cotizacionUSD={usaCotizacionUSD ? cotizacionUSD : 1}
            />
            <ResumenVenta
              subtotal={subtotal}
              descuento={descuento}
              onAbrirDescuento={() => setModalDescuentoAbierto(true)}
            />
            <div className="flex flex-col justify-end gap-2">
              <button
                type="button"
                onClick={handleConfirmarVenta}
                disabled={procesando}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {procesando ? "Procesando..." : "Confirmar venta"}
              </button>
              <button
                type="button"
                onClick={handleRegistrarPedido}
                disabled={procesando}
                className="w-full rounded-lg border border-primary px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                Registrar pedido
              </button>
              <button
                type="button"
                onClick={handleDescontarStock}
                disabled={procesando}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-text-dim hover:bg-surface-hover disabled:opacity-50"
              >
                <Gift size={14} /> Solo descontar stock
              </button>
            </div>
          </div>
        </div>
      )}
      {modalPrecioAbierto && <ModalConsultarPrecio onClose={() => setModalPrecioAbierto(false)} />}
      {modalDescuentoAbierto && (
        <ModalDescuento
          descuentoActual={descuento}
          onAplicar={setDescuento}
          onClose={() => setModalDescuentoAbierto(false)}
        />
      )}
      {advertenciaStock && (
        <ModalStockComprometido
          nombreProducto={advertenciaStock.producto.nombre}
          stock={advertenciaStock.stock}
          unidadesQueriaVender={advertenciaStock.unidadesQueriaVender}
          onCancelar={() => setAdvertenciaStock(null)}
          onVenderIgual={() => {
            agregarAlCarrito(advertenciaStock.producto, advertenciaStock.precioUnitarioArs);
            setAdvertenciaStock(null);
          }}
        />
      )}
    </div>
  );
}