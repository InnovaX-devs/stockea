import type { ProveedorConCompras } from "@/lib/proveedores";

function formatMoney(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProveedoresTable({
  proveedores,
  onVerDetalle,
  onPagar,
  onCuentaCorriente,
}: {
  proveedores: ProveedorConCompras[];
  onVerDetalle: (proveedor: ProveedorConCompras) => void;
  onPagar: (proveedor: ProveedorConCompras) => void;
  onCuentaCorriente: (proveedor: ProveedorConCompras) => void;
}) {
  const acciones = (p: ProveedorConCompras) =>
    (
      <div className="flex items-center justify-end gap-3 not-italic" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onCuentaCorriente(p)} className="text-primary hover:underline text-sm cursor-pointer">
          Cuenta corriente
        </button>
        {p.deuda > 0.5 && (
          <button
            onClick={() => onPagar(p)}
            className="bg-grad rounded-full px-3 py-1 text-xs font-semibold text-[#050507] cursor-pointer"
          >
            Pagar
          </button>
        )}
      </div>
    );

  if (proveedores.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border px-4 py-8 text-center text-text-dim text-sm">
        No se encontraron proveedores que coincidan con la búsqueda.
      </div>
    );
  }

  return (
    <>
      {/* Desktop: tabla */}
      <div className="hidden md:block bg-white rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-topbar">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Compras</th>
              <th className="px-4 py-3">Total comprado</th>
              <th className="px-4 py-3">Deuda</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr
                key={p.id}
                onClick={() => onVerDetalle(p)}
                className={`border-t border-border ${
                  p.esVirtual ? "italic text-text-dim" : "cursor-pointer hover:bg-surface-hover/60"
                }`}
              >
                <td className="px-4 py-4 font-medium text-text">{p.nombre}</td>
                <td className="px-4 py-4 text-text-dim">
                  {p.personaContacto || p.telefono || p.email || "—"}
                </td>
                <td className="px-4 py-4 text-text-dim">{p.cantidadCompras}</td>
                <td className="px-4 py-4 text-text-dim">{formatMoney(p.totalComprado)}</td>
                <td className={`px-4 py-4 font-medium ${p.deuda > 0.5 ? "text-danger" : "text-text-dim"}`}>
                  {p.deuda > 0.5 ? formatMoney(p.deuda) : "Al día"}
                </td>
                <td className="px-4 py-4 text-right">{acciones(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: tarjetas */}
      <div className="md:hidden space-y-3">
        {proveedores.map((p) => (
          <div
            key={p.id}
            onClick={() => onVerDetalle(p)}
            className={`bg-white rounded-2xl border border-border p-4 shadow-[0_4px_20px_rgba(26,43,86,0.04)] ${
              p.esVirtual ? "italic text-text-dim" : "cursor-pointer"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-text truncate">{p.nombre}</p>
                <p className="text-sm text-text-dim truncate">
                  {p.personaContacto || p.telefono || p.email || "—"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-text-dim">{p.cantidadCompras} compras</span>
              <span className="font-medium text-text">{formatMoney(p.totalComprado)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className={p.deuda > 0.5 ? "font-medium text-danger" : "text-text-dim"}>
                {p.deuda > 0.5 ? `Debés ${formatMoney(p.deuda)}` : "Al día"}
              </span>
              {acciones(p)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}