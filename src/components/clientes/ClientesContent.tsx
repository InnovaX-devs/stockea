"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ClienteModal from "@/components/clientes/ClienteModal";
import ResumenCards from "./ResumenCards";
import ClientesFilters from "./ClientesFilters";
import type { ClienteConDeuda, Paginacion } from "@/lib/clientes";
import type { ClienteBasico } from "@/components/clientes/ClienteForm";
import ClientesTable from "./ClientesTable";
import type { CuentaOption } from "./CobrarDeudaModal";

export default function ClientesContent({
  clientes,
  resumen,
  cuentas,
  umbralAlDia,
  paginacion,
}: {
  clientes: ClienteConDeuda[];
  resumen: { totalClientes: number; totalMayoristas: number; deudaTotal: number };
  cuentas: CuentaOption[];
  umbralAlDia: number;
  paginacion: Paginacion;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [clienteEditar, setClienteEditar] = useState<ClienteConDeuda | null>(null);

  function abrirNuevo() {
    setClienteEditar(null);
    setModalAbierto(true);
  }

  function abrirEditar(cliente: ClienteConDeuda) {
    setClienteEditar(cliente);
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setClienteEditar(null);
  }

  function handleSaved(_cliente: ClienteBasico) {
    cerrarModal();
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
        <h1 className="text-xl sm:text-2xl font-semibold text-text">Clientes</h1>
        <button
          onClick={abrirNuevo}
          className="bg-grad cursor-pointer self-start rounded-full px-5 py-2.5 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 sm:self-auto"
        >
          + Nuevo cliente
        </button>
      </div>

      <ResumenCards resumen={resumen} />
      <ClientesFilters />
      <ClientesTable
        clientes={clientes}
        cuentas={cuentas}
        umbralAlDia={umbralAlDia}
        onEditar={abrirEditar}
      />

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

      {modalAbierto && (
        <ClienteModal
          clienteInicial={
            clienteEditar
              ? {
                  id: clienteEditar.id,
                  nombre: clienteEditar.nombre,
                  apellido: clienteEditar.apellido ?? "",
                  telefono: clienteEditar.telefono ?? "",
                  email: clienteEditar.email ?? "",
                  direccion: clienteEditar.direccion ?? "",
                  localidad: clienteEditar.localidad ?? "",
                  esMayorista: clienteEditar.esMayorista,
                }
              : null
          }
          onSaved={handleSaved}
          onClose={cerrarModal}
        />
      )}
    </div>
  );
}