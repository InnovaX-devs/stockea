"use client";

import { useState } from "react";
import CobrarDeudaModal, { type CuentaOption } from "./CobrarDeudaModal";
import { formatearPesosLimite } from "@/lib/limite-cuenta-corriente";

interface DeudaCellProps {
  cliente: { id: number; nombre: string };
  deuda: number;
  /** Límite de cuenta corriente que le aplica (null = sin límite). */
  limite?: number | null;
  umbralAlDia: number;
  cuentas: CuentaOption[];
}

export default function DeudaCell({ cliente, deuda, limite = null, umbralAlDia, cuentas }: DeudaCellProps) {
  const [abierto, setAbierto] = useState(false);
  const textoLimite =
    limite == null ? null : (
      <span className={`block text-xs ${deuda > limite + 0.5 ? "font-semibold text-danger" : "text-text-dim"}`}>
        {deuda > limite + 0.5 ? "Supera el límite de " : "de "}
        {formatearPesosLimite(limite)}
      </span>
    );

  if (deuda <= umbralAlDia) {
    return (
      <span className="font-medium text-green-600">
        Al día
        {limite != null && <span className="block text-xs font-normal text-text-dim">Límite {formatearPesosLimite(limite)}</span>}
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-red-600 font-medium">
          ${deuda.toLocaleString("es-AR")}
          {textoLimite}
        </span>
        <button
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-2.5-2.5h-1a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-1a2.5 2.5 0 0 1-2.5-2.5" />
          </svg>
          Cobrar
        </button>
      </div>

      {abierto && (
        <CobrarDeudaModal
          cliente={cliente}
          deudaTotal={deuda}
          cuentas={cuentas}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}