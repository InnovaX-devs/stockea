import { formatCurrency } from "@/lib/currency";

type Fila = { clave: string; titulo: string; cantidad: number; montoARS: number };

export function RankingRopa({ titulo, filas, vacio }: { titulo: string; filas: Fila[]; vacio: string }) {
  const max = Math.max(1, ...filas.map((f) => f.cantidad));
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="text-sm text-text-dim">{vacio}</p>
      ) : (
        <ol className="space-y-3">
          {filas.map((f, i) => (
            <li key={f.clave} className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-xs font-medium text-text-dim">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{f.titulo}</p>
                  <p className="text-xs text-text-dim">{f.cantidad} vendidas</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-text">{formatCurrency(f.montoARS, "ARS")}</span>
              </div>
              <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(f.cantidad / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}