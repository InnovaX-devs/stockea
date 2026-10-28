"use client";

import { useState } from "react";
import { Minus, Plus, Pencil, Trash2, Check } from "lucide-react";
import type { ItemCarrito, TipoPrecioLinea } from "@/types/item-carrito";
import { formatCurrency } from "@/lib/currency";
import { detallePromocion } from "@/lib/promociones-comun";
import { MiniaturaProducto, VisorFoto, type FotoAmpliada } from "@/components/ventas/miniatura-producto";

/** Nombre de la línea; las promociones (#114) llevan la etiqueta "Promo" y lo que incluyen. */
function NombreLinea({ item }: { item: ItemCarrito }) {
  const { producto } = item;
  return (
    <span className="min-w-0">
      <span className="font-medium text-text">{producto.nombre}</span>
      {producto.esPromocion && (
        <>
          <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase text-primary">
            Promo
          </span>
          {producto.componentes && producto.componentes.length > 0 && (
            <span className="block text-xs text-text-dim">{detallePromocion(producto.componentes)}</span>
          )}
        </>
      )}
    </span>
  );
}

interface Props {
  items: ItemCarrito[];
  onCambiarCantidad: (id: string, cantidad: number) => void;
  onCambiarPrecio: (id: string, precioArs: number) => void;
  onCambiarTipoPrecio: (id: string, tipo: TipoPrecioLinea) => void;
  onEliminar: (id: string) => void;
}

interface FilaProps {
  item: ItemCarrito;
  onCambiarCantidad: (id: string, cantidad: number) => void;
  onCambiarPrecio: (id: string, precioArs: number) => void;
  onCambiarTipoPrecio: (id: string, tipo: TipoPrecioLinea) => void;
  onEliminar: (id: string) => void;
  onAmpliar: (foto: FotoAmpliada) => void;
}

export function TablaCarrito(props: Props) {
  // Foto agrandada (#108). Va antes del return temprano (reglas de los hooks).
  const [foto, setFoto] = useState<FotoAmpliada | null>(null);

  if (props.items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-dim">
        Carrito vacío. Buscá un producto para agregarlo.
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet: tabla */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-left text-xs font-semibold uppercase tracking-wider text-white">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-center">Cantidad</th>
              <th className="px-4 py-3 text-right">Precio unit.</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => (
              <FilaCarrito key={item.id} item={item} {...props} onAmpliar={setFoto} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: tarjetas */}
      <div className="space-y-3 md:hidden">
        {props.items.map((item) => (
          <TarjetaCarrito key={item.id} item={item} {...props} onAmpliar={setFoto} />
        ))}
      </div>

      <VisorFoto foto={foto} onCerrar={() => setFoto(null)} />
    </>
  );
}

function TogglePrecioLinea({
  item,
  onCambiarTipoPrecio,
}: {
  item: ItemCarrito;
  onCambiarTipoPrecio: (id: string, tipo: TipoPrecioLinea) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-xs font-medium">
      <button
        type="button"
        onClick={() => onCambiarTipoPrecio(item.id, "MINORISTA")}
        className={`px-2 py-1 transition-colors ${
          item.tipoPrecio === "MINORISTA" ? "bg-primary text-white" : "bg-surface text-text-dim hover:bg-surface-hover"
        }`}
      >
        Minorista
      </button>
      <button
        type="button"
        onClick={() => onCambiarTipoPrecio(item.id, "MAYORISTA")}
        className={`px-2 py-1 transition-colors ${
          item.tipoPrecio === "MAYORISTA" ? "bg-warning text-white" : "bg-surface text-text-dim hover:bg-surface-hover"
        }`}
      >
        Mayorista
      </button>
    </div>
  );
}

function usePrecioEditable(item: ItemCarrito, onCambiarPrecio: (id: string, precioArs: number) => void) {
  const [editando, setEditando] = useState(false);
  const [temp, setTemp] = useState(String(item.precioUnitarioArs));

  function abrir() {
    setTemp(String(item.precioUnitarioArs));
    setEditando(true);
  }

  function confirmar() {
    const valor = Number(temp);
    if (!Number.isNaN(valor) && valor >= 0) {
      onCambiarPrecio(item.id, valor);
    } else {
      setTemp(String(item.precioUnitarioArs));
    }
    setEditando(false);
  }

  return { editando, temp, setTemp, abrir, confirmar };
}

function FilaCarrito({ item, onCambiarCantidad, onCambiarPrecio, onCambiarTipoPrecio, onEliminar, onAmpliar }: FilaProps) {
  const { editando, temp, setTemp, abrir, confirmar } = usePrecioEditable(item, onCambiarPrecio);
  const total = item.cantidad * item.precioUnitarioArs;

  return (
    <tr className="border-b border-border bg-surface last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MiniaturaProducto fotoUrl={item.producto.fotoUrl} nombre={item.producto.nombre} onAmpliar={onAmpliar} />
          {!item.producto.precioAbierto && !item.producto.esPromocion && (
            <TogglePrecioLinea item={item} onCambiarTipoPrecio={onCambiarTipoPrecio} />
          )}
          <NombreLinea item={item} />
        </div>
      </td>

      <td className="px-4 py-3">
        {item.producto.precioAbierto ? (
          // Precio abierto: una línea por monto cargado (cantidad 1); para sumar más, se vuelve a agregar.
          <div className="text-center font-medium text-text">{item.cantidad}</div>
        ) : (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onCambiarCantidad(item.id, Math.max(1, item.cantidad - 1))}
            className="rounded-md border border-border p-1 text-text-dim hover:bg-surface-hover hover:text-text"
          >
            <Minus size={14} />
          </button>
          <span className="w-6 text-center font-medium text-text">{item.cantidad}</span>
          <button
            type="button"
            onClick={() => onCambiarCantidad(item.id, item.cantidad + 1)}
            disabled={(item.producto.controlaStock !== false || item.producto.esPromocion) && item.cantidad >= item.producto.stockActual}
            className="rounded-md border border-border p-1 text-text-dim hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>
        )}
      </td>

      <td className="px-4 py-3 text-right">
        {editando ? (
          <div className="flex items-center justify-end gap-1">
            <input
              autoFocus
              type="number"
              step="0.01"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
              onBlur={confirmar}
              className="w-28 rounded-md border border-primary bg-surface px-2 py-1 text-right text-sm text-text focus:outline-none"
            />
            <button type="button" onClick={confirmar} className="text-success">
              <Check size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={abrir}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <Pencil size={12} />
            {formatCurrency(item.precioUnitarioArs, "ARS")}
          </button>
        )}
      </td>

      <td className="px-4 py-3 text-right font-semibold text-text">{formatCurrency(total, "ARS")}</td>

      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onEliminar(item.id)}
          className="rounded-lg p-1.5 text-text-dim hover:bg-danger/10 hover:text-danger"
          title="Eliminar"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}

function TarjetaCarrito({ item, onCambiarCantidad, onCambiarPrecio, onCambiarTipoPrecio, onEliminar, onAmpliar }: FilaProps) {
  const { editando, temp, setTemp, abrir, confirmar } = usePrecioEditable(item, onCambiarPrecio);
  const total = item.cantidad * item.precioUnitarioArs;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <MiniaturaProducto fotoUrl={item.producto.fotoUrl} nombre={item.producto.nombre} onAmpliar={onAmpliar} />
          <NombreLinea item={item} />
        </div>
        <button
          type="button"
          onClick={() => onEliminar(item.id)}
          className="shrink-0 rounded-lg p-1.5 text-text-dim hover:bg-danger/10 hover:text-danger"
          title="Eliminar"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {!item.producto.precioAbierto && !item.producto.esPromocion && (
        <div className="mt-2">
          <TogglePrecioLinea item={item} onCambiarTipoPrecio={onCambiarTipoPrecio} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        {item.producto.precioAbierto ? (
          <span className="text-sm text-text-dim">Precio abierto</span>
        ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCambiarCantidad(item.id, Math.max(1, item.cantidad - 1))}
            className="rounded-md border border-border p-1.5 text-text-dim hover:bg-surface-hover hover:text-text"
          >
            <Minus size={14} />
          </button>
          <span className="w-6 text-center font-medium text-text">{item.cantidad}</span>
          <button
            type="button"
            onClick={() => onCambiarCantidad(item.id, item.cantidad + 1)}
            disabled={(item.producto.controlaStock !== false || item.producto.esPromocion) && item.cantidad >= item.producto.stockActual}
            className="rounded-md border border-border p-1.5 text-text-dim hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>
        )}

        {editando ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              step="0.01"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
              onBlur={confirmar}
              className="w-24 rounded-md border border-primary bg-surface px-2 py-1 text-right text-sm text-text focus:outline-none"
            />
            <button type="button" onClick={confirmar} className="text-success">
              <Check size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={abrir}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Pencil size={12} />
            {formatCurrency(item.precioUnitarioArs, "ARS")}
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
        <span className="text-text-dim">Total línea</span>
        <span className="font-semibold text-text">{formatCurrency(total, "ARS")}</span>
      </div>
    </div>
  );
}