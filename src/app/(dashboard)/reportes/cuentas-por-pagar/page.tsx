import Link from "next/link";
import { obtenerCuentasPorPagar } from "./queries";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const COLOR_BUCKET: Record<string, string> = {
  "0-30": "text-success",
  "31-60": "text-warning",
  "61-90": "text-[#c2410c]",
  "90+": "text-danger",
};

export default async function CuentasPorPagarPage() {
  const data = await obtenerCuentasPorPagar();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-text-dim">Total pendiente de pago a proveedores</p>
        <p className="mt-1 text-2xl font-semibold text-text">{formatCurrency(data.totalPendienteARS, "ARS")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.buckets.map((b) => (
          <div key={b.label} className="rounded-2xl border border-border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-text-dim">{b.label} días</p>
            <p className={cn("mt-1 text-lg font-semibold", COLOR_BUCKET[b.label])}>{formatCurrency(b.totalARS, "ARS")}</p>
            <p className="text-xs text-text-dim">
              {b.cantidad} proveedor{b.cantidad !== 1 ? "es" : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Detalle por proveedor</h2>
          <p className="text-xs text-text-dim">Incluye deuda inicial, compras con saldo y gastos pendientes. La antigüedad cuenta desde la deuda más vieja sin pagar.</p>
        </div>
        {data.proveedores.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-dim">No hay deuda con proveedores pendiente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-[11px] uppercase tracking-wide text-text-dim">
                <tr className="text-left">
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2">Teléfono</th>
                  <th className="px-4 py-2">Antigüedad</th>
                  <th className="px-4 py-2 text-right">Pendiente</th>
                  <th className="px-4 py-2 text-right">Cuenta</th>
                </tr>
              </thead>
              <tbody>
                {data.proveedores.map((p) => (
                  <tr key={p.proveedorId} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-text">{p.nombre}</td>
                    <td className="px-4 py-2 text-text-dim">{p.telefono ?? "-"}</td>
                    <td className={cn("px-4 py-2 font-medium", COLOR_BUCKET[p.bucket])}>
                      {p.diasDesdeMasVieja} días ({p.bucket})
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-text">{formatCurrency(p.pendienteARS, "ARS")}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href="/compras/proveedores" className="text-primary hover:underline">
                        Ver / pagar
                      </Link>
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
