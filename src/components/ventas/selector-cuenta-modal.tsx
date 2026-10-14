"use client";

import { useEffect, useState } from "react";
import { Search, X, Landmark, Wallet } from "lucide-react";
import type { CuentaOption } from "@/types/pago";
import { cargarCuentas } from "@/lib/offline/buscar";

interface Props {
  onSeleccionar: (cuenta: CuentaOption) => void;
  onClose: () => void;
}

const ETIQUETAS_TIPO_CUENTA: Record<string, string> = {
  EFECTIVO_ARS: "Efectivo ARS",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Banco ARS",
  BANCO_USD: "Banco USD",
};

export function SelectorCuentaModal({ onSeleccionar, onClose }: Props) {
  const [cuentas, setCuentas] = useState<CuentaOption[]>([]);
  const [query, setQuery] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Red primero (ya filtra activa: true); sin red, copia local de Dexie.
    cargarCuentas()
      .then((items) => setCuentas(items as CuentaOption[]))
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  const filtradas = cuentas.filter((c) => c.nombre.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-8 sm:pt-20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-base font-semibold text-text">Seleccionar cuenta</h3>
          <button onClick={onClose} className="text-text-dim hover:text-text" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cuenta..."
              className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {cargando && <div className="py-6 text-center text-sm text-text-dim">Cargando...</div>}
          {!cargando && filtradas.length === 0 && (
            <div className="py-6 text-center text-sm text-text-dim">Sin resultados</div>
          )}
          {filtradas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSeleccionar(c)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-hover"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {c.tipo.startsWith("EFECTIVO") ? <Wallet size={16} /> : <Landmark size={16} />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-text">{c.nombre}</span>
                <span className="text-xs text-text-dim">{ETIQUETAS_TIPO_CUENTA[c.tipo] ?? c.tipo}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}