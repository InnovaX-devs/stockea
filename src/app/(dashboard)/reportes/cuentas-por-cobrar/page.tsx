import { obtenerCuentasPorCobrar } from "./queries";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/cn";

const COLOR_BUCKET: Record<string, string> = {
  "0-30": "text-success",
  "31-60": "text-warning",
  "61-90": "text-[#c2410c]",
  "90+": "text-danger",
};

export default async function CuentasPorCobrarPage() {
  const data = await obtenerCuentasPorCobrar();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-text-dim">Total pendiente de cobro</p>
        <p className="mt-1 text-2xl font-semibold text-text">
          {formatCurrency(data.totalPendienteARS, "ARS")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.buckets.map((b) => (
          <div key={b.label} className="rounded-2xl border border-border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-text-dim">{b.label} días</p>
            <p className={cn("mt-1 text-lg font-semibold", COLOR_BUCKET[b.label])}>
              {formatCurrency(b.totalARS, "ARS")}
            </p>
            <p className="text-xs text-text-dim">{b.cantidad} cliente{b.cantidad !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Detalle por cliente</h2>
        </div>
        {data.clientes.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-dim">No hay deuda de clientes pendiente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-[11px] uppercase tracking-wide text-text-dim">
                <tr className="text-left">
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Teléfono</th>
                  <th className="px-4 py-2">Antigüedad</th>
                  <th className="px-4 py-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((c) => (
                  <tr key={c.clienteId} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-text">{c.nombre}</td>
                    <td className="px-4 py-2 text-text-dim">{c.telefono ?? "-"}</td>
                    <td className={cn("px-4 py-2 font-medium", COLOR_BUCKET[c.bucket])}>
                      {c.diasVencidoMax} días ({c.bucket})
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-text">
                      {formatCurrency(c.pendienteARS, "ARS")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
