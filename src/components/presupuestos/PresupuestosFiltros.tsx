"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useTransition } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import DateInput from "@/components/ui/date-input";

const ESTADOS = [
  { value: "TODOS", label: "Todos" },
  { value: "BORRADOR", label: "Borrador" },
  { value: "VENCIDO", label: "Vencido" },
  { value: "CONVERTIDO", label: "Convertido" },
] as const;

export default function PresupuestosFiltros() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const estadoActual = searchParams.get("estado") ?? "TODOS";
  const [clienteQuery, setClienteQuery] = useState(searchParams.get("clienteQuery") ?? "");
  const [desde, setDesde] = useState(searchParams.get("desde") ?? "");
  const [hasta, setHasta] = useState(searchParams.get("hasta") ?? "");

  function aplicarFiltros(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    const nuevos = { estado: estadoActual, clienteQuery, desde, hasta, ...overrides };

    Object.entries(nuevos).forEach(([key, value]) => {
      if (!value || value === "TODOS") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Debounce del buscador de cliente para no navegar en cada tecla
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (clienteQuery !== (searchParams.get("clienteQuery") ?? "")) {
        aplicarFiltros({ clienteQuery });
      }
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteQuery]);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => aplicarFiltros({ estado: e.value })}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                estadoActual === e.value
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-text-dim hover:bg-surface-hover"
              )}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-text-dim">Desde</label>
            <DateInput
              value={desde}
              max={hasta || undefined}
              onChange={(valor) => {
                setDesde(valor);
                aplicarFiltros({ desde: valor });
              }}
              className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-dim">Hasta</label>
            <DateInput
              value={hasta}
              min={desde || undefined}
              onChange={(valor) => {
                setHasta(valor);
                aplicarFiltros({ hasta: valor });
              }}
              className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="min-w-[200px] flex-1">
            <label className="block text-xs font-medium text-text-dim">Cliente</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
              <input
                type="text"
                value={clienteQuery}
                onChange={(e) => setClienteQuery(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {isPending && <span className="pb-2 text-xs text-text-dim">Filtrando...</span>}
        </div>
      </div>
    </div>
  );
}