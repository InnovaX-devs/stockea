export default function ResumenCards({
  resumen,
}: {
  resumen: { totalClientes: number; totalMayoristas: number; deudaTotal: number };
}) {
  const cards = [
    { label: "Total clientes", value: String(resumen.totalClientes) },
    { label: "Mayoristas", value: String(resumen.totalMayoristas) },
    {
      label: "Deuda total",
      value: `$${resumen.deudaTotal.toLocaleString("es-AR")}`,
      destacado: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-2xl p-5 border border-border shadow-[0_4px_20px_rgba(26,43,86,0.04)]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
            {c.label}
          </p>
          <p
            className={`mt-2 text-2xl font-semibold ${
              c.destacado ? "text-danger" : "text-text"
            }`}
          >
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}