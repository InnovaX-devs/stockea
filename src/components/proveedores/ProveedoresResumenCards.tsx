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
  resumen: {
    totalProveedores: number;
    totalComprado: number;
    deudaTotal: number;
    topDeudas: { id: number; nombre: string; deuda: number }[];
  };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Total Proveedores</p>
        <p className="mt-1 text-2xl font-semibold text-text">{resumen.totalProveedores}</p>
      </div>
      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Total Comprado</p>
        <p className="mt-1 text-2xl font-semibold text-text">{formatMoney(resumen.totalComprado)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Deuda con proveedores</p>
        <p className="mt-1 text-2xl font-semibold text-danger">{formatMoney(resumen.deudaTotal)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-border p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">A quién más se le debe</p>
        {resumen.topDeudas.length === 0 ? (
          <p className="mt-2 text-sm text-text-dim">Sin deudas 🎉</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {resumen.topDeudas.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate text-text">{p.nombre}</span>
                <span className="shrink-0 font-medium text-text">{formatMoney(p.deuda)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
