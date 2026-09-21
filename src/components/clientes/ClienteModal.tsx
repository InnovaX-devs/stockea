"use client";

import ClienteForm, { type ClienteBasico } from "./ClienteForm";
import type { ClienteInput } from "@/app/(dashboard)/clientes/actions";

export default function ClienteModal({
  clienteInicial,
  onSaved,
  onClose,
}: {
  clienteInicial?: (Partial<ClienteInput> & { id?: number }) | null;
  onSaved: (cliente: ClienteBasico) => void;
  onClose: () => void;
}) {
  const esEdicion = Boolean(clienteInicial?.id);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">
            {esEdicion ? "Editar cliente" : "Nuevo cliente"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-text-dim cursor-pointer hover:text-text text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <ClienteForm
          clienteInicial={clienteInicial ?? undefined}
          onSuccess={onSaved}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}