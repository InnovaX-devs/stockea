"use client";

import type { ItemPresupuestoLocal } from "@/types/presupuesto";

export default function ItemsPresupuestoTable({
  items,
  onCambiarCantidad,
  onCambiarPrecio,
  onQuitar,
}: {
  items: ItemPresupuestoLocal[];
  onCambiarCantidad: (key: string, cantidad: number) => void;
  onCambiarPrecio: (key: string, precio: number) => void;
  onQuitar: (key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 text-text-dim">
        <p>Buscá productos arriba para agregarlos al presupuesto</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-surface-hover text-[11px] font-bold uppercase tracking-wider text-text-dim">
          <th className="text-left px-4 py-3">Producto</th>
          <th className="text-left px-4 py-3">Tipo</th>
          <th className="text-center px-4 py-3">Cantidad</th>
          <th className="text-right px-4 py-3">Precio unit.</th>
          <th className="text-right px-4 py-3">Subtotal</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.key} className="border-b border-border">
            <td className="px-4 py-3">{item.descripcion}</td>
            <td className="px-4 py-3">{item.tipoPrecio === "MAYORISTA" ? "May" : "Min"}</td>
            <td className="px-4 py-3 text-center">
              <input
                type="number"
                min={1}
                value={item.cantidad}
                onChange={(e) => onCambiarCantidad(item.key, Number(e.target.value))}
                className="w-16 text-center border border-border rounded px-1 py-1"
              />
            </td>
            <td className="px-4 py-3 text-right">
              <input
                type="number"
                step="0.01"
                value={item.precioUnitario}
                onChange={(e) => onCambiarPrecio(item.key, Number(e.target.value))}
                className="w-24 text-right border border-border rounded px-1 py-1"
              />
            </td>
            <td className="px-4 py-3 text-right font-medium">
              ${(item.cantidad * item.precioUnitario).toFixed(2)}
            </td>
            <td className="px-4 py-3 text-right">
              <button
                type="button"
                onClick={() => onQuitar(item.key)}
                className="text-danger text-xs"
              >
                Quitar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}