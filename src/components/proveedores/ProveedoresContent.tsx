"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProveedorFormModal } from "@/components/proveedores/proveedor-form-modal";
import { ProveedorDetalleModal } from "@/components/proveedores/proveedor-detalle-modal";
import ProveedoresResumenCards from "./ProveedoresResumenCards";
import ProveedoresFilters from "./ProveedoresFilters";
import ProveedoresTable from "./ProveedoresTable";
import type { ProveedorConCompras, Paginacion } from "@/lib/proveedores";

export default function ProveedoresContent({
  proveedores,
  resumen,
  paginacion,
}: {
  proveedores: ProveedorConCompras[];
  resumen: { totalProveedores: number; totalComprado: number };
  paginacion: Paginacion;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCrearOpen, setIsCrearOpen] = useState(false);
  const [proveedorDetalle, setProveedorDetalle] = useState<ProveedorConCompras | null>(null);

  function abrirDetalle(proveedor: ProveedorConCompras) {
    if (proveedor.esVirtual) return;
    setProveedorDetalle(proveedor);
  }

  function cerrarDetalle() {
    setProveedorDetalle(null);
  }

  function handleSuccess() {
    setIsCrearOpen(false);
    cerrarDetalle();
    router.refresh(); // vuelve a pedir los datos al server component
  }

  function irAPagina(pagina: number) {
    const nuevosParams = new URLSearchParams(searchParams.toString());
    nuevosParams.set("page", String(pagina));
    router.push(`?${nuevosParams.toString()}`);
  }

  const { pagina, totalPaginas, totalItems } = paginacion;

  return (
    <div className="p-4 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold text-text">Proveedores</h1>
        <button
          onClick={() => setIsCrearOpen(true)}
          className="bg-grad px-4 py-2 text-sm font-semibold rounded-full text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 self-start sm:self-auto cursor-pointer"
        >
          + Nuevo proveedor
        </button>
      </div>

      <ProveedoresResumenCards resumen={resumen} />
      <ProveedoresFilters />
      <ProveedoresTable proveedores={proveedores} onVerDetalle={abrirDetalle} />

      {totalItems > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-text-dim">
          <span>
            Mostrando {(pagina - 1) * paginacion.pageSize + 1}–
            {Math.min(pagina * paginacion.pageSize, totalItems)} de {totalItems}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => irAPagina(pagina - 1)}
              disabled={pagina <= 1}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <button
              onClick={() => irAPagina(pagina + 1)}
              disabled={pagina >= totalPaginas}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <ProveedorFormModal
        isOpen={isCrearOpen}
        onClose={() => setIsCrearOpen(false)}
        onSuccess={handleSuccess}
      />

      <ProveedorDetalleModal
        isOpen={proveedorDetalle !== null}
        onClose={cerrarDetalle}
        proveedor={proveedorDetalle}
        onSuccess={handleSuccess}
      />
    </div>
  );
}