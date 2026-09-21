"use client";

import { useState } from "react";

interface ProveedorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  nombre: string;
  personaContacto: string;
  telefono: string;
  email: string;
  notas: string;
}

const FORM_VACIO: FormData = {
  nombre: "",
  personaContacto: "",
  telefono: "",
  email: "",
  notas: "",
};

export function ProveedorFormModal({ isOpen, onClose, onSuccess }: ProveedorFormModalProps) {
  const [formData, setFormData] = useState<FormData>(FORM_VACIO);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!formData.nombre.trim()) {
      setErrorMsg("El nombre es obligatorio");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al guardar el proveedor");
      }

      onSuccess();
      setFormData(FORM_VACIO);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-xl font-semibold text-text">Nuevo Proveedor</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg bg-danger/10 p-3 text-xs text-danger">{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-dim">Nombre *</label>
            <input
              type="text"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-text-dim">Persona de contacto</label>
              <input
                type="text"
                value={formData.personaContacto}
                onChange={(e) => setFormData({ ...formData, personaContacto: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim">Teléfono</label>
              <input
                type="text"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-dim">Correo electrónico</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-dim">Notas</label>
            <textarea
              rows={3}
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover sm:w-auto cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto cursor-pointer"
            >
              {loading ? "Guardando..." : "Guardar Proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}