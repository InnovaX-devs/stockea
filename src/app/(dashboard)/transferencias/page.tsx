import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import { ListaTransferencias } from "@/components/transferencias/lista-transferencias";
import { listarHistorial, listarPorRecibir } from "./queries";

type Vista = "por-recibir" | "historial";

const PESTANAS: { key: Vista; label: string }[] = [
  { key: "por-recibir", label: "Por recibir" },
  { key: "historial", label: "Historial" },
];

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pagina?: string }>;
}) {
  const contexto = await obtenerContextoSucursal();
  // Con una sola sucursal no hay a dónde transferir.
  if (!contexto.multisucursal) notFound();

  const params = await searchParams;
  const vista: Vista = params.vista === "historial" ? "historial" : "por-recibir";

  const [porRecibir, historial] = await Promise.all([
    listarPorRecibir(),
    vista === "historial" ? listarHistorial(Number(params.pagina)) : null,
  ]);

  const lista = vista === "historial" ? historial!.items : porRecibir;
  const href = (v: Vista, pagina = 1) => `/transferencias?vista=${v}${pagina > 1 ? `&pagina=${pagina}` : ""}`;

  return (
    <div className="space-y-5 p-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">Transferencias</h1>
          <p className="mt-0.5 text-sm text-text-dim">
            {contexto.actual ? `Sucursal: ${contexto.actual.nombre}` : "Todas las sucursales (solo consulta)"}
          </p>
        </div>
        {contexto.actual ? (
          <Link
            href="/transferencias/nueva"
            className="bg-grad flex items-center justify-center gap-1.5 self-start rounded-full px-4 py-2 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 sm:self-auto"
          >
            <Plus className="h-4 w-4" /> Transferir a otra sucursal
          </Link>
        ) : (
          <p className="text-xs text-text-dim sm:max-w-[16rem] sm:text-right">
            Para transferir o recibir mercadería, elegí una sucursal en la barra superior.
          </p>
        )}
      </div>

      <div className="flex gap-1.5">
        {PESTANAS.map((p) => (
          <Link
            key={p.key}
            href={href(p.key)}
            aria-current={vista === p.key ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              vista === p.key ? "bg-primary text-white" : "border border-border bg-white text-text-dim hover:bg-surface-hover"
            )}
          >
            {p.label}
            {p.key === "por-recibir" && porRecibir.length > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold",
                  vista === p.key ? "bg-white/25 text-white" : "bg-primary/10 text-primary"
                )}
              >
                {porRecibir.length}
              </span>
            )}
          </Link>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-10 text-center">
          <ArrowRightLeft className="h-6 w-6 text-text-dim" />
          <p className="text-sm text-text-dim">
            {vista === "historial" ? "Todavía no hay transferencias." : "No hay mercadería en camino hacia esta sucursal."}
          </p>
        </div>
      ) : (
        <ListaTransferencias transferencias={lista} sucursalActualId={contexto.actual?.id ?? null} />
      )}

      {vista === "historial" && historial && historial.paginas > 1 && (
        <div className="flex items-center justify-between text-sm text-text-dim">
          {historial.pagina > 1 ? (
            <Link href={href("historial", historial.pagina - 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-hover">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span>
            Página {historial.pagina} de {historial.paginas} · {historial.total} transferencias
          </span>
          {historial.pagina < historial.paginas ? (
            <Link href={href("historial", historial.pagina + 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-hover">
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}