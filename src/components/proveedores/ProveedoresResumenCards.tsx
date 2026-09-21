function formatMoney(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProveedoresResumenCards({
  resumen,
}: {
  resumen: { totalProveedores: number; totalComprado: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Total Proveedores
        </p>
        <p className="mt-1 text-2xl font-semibold text-text">{resumen.totalProveedores}</p>
      </div>
      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Total Comprado
        </p>
        <p className="mt-1 text-2xl font-semibold text-text">
          {formatMoney(resumen.totalComprado)}
        </p>
      </div>
    </div>
  );
}