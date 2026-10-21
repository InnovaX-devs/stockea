"use client";

import { useEffect, useState } from "react";

interface ProveedorDetalle {
  id: string;
  nombre: string;
  personaContacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  cantidadCompras: number;
  totalComprado: number;
  deuda?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  proveedor: ProveedorDetalle | null;
  onSuccess: () => void;
  /** Accesos directos a Pagar y Cuenta corriente (CP-2). */
  onPagar?: () => void;
  onCuentaCorriente?: () => void;
}

type CampoEditable = "nombre" | "personaContacto" | "telefono" | "email" | "notas";

const LABELS: Record<CampoEditable, string> = {
  nombre: "Nombre",
  personaContacto: "Persona de contacto",
  telefono: "Teléfono",
  email: "Correo electrónico",
  notas: "Notas",
};

const CAMPOS = Object.keys(LABELS) as CampoEditable[];

export function ProveedorDetalleModal({ isOpen, onClose, proveedor, onSuccess, onPagar, onCuentaCorriente }: Props) {
  const [valores, setValores] = useState<Record<CampoEditable, string>>({
    nombre: "",
    personaContacto: "",
    telefono: "",
    email: "",
    notas: "",
  });
  const [campoEditando, setCampoEditando] = useState<CampoEditable | null>(null);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (proveedor) {
      setValores({
        nombre: proveedor.nombre,
        personaContacto: proveedor.personaContacto ?? "",
        telefono: proveedor.telefono ?? "",
        email: proveedor.email ?? "",
        notas: proveedor.notas ?? "",
      });
    }
    setCampoEditando(null);
    setError("");
  }, [proveedor, isOpen]);

  if (!isOpen || !proveedor) return null;

  const empezarEdicion = (campo: CampoEditable) => {
    setBorrador(valores[campo]);
    setCampoEditando(campo);
    setError("");
  };

  const guardarCampo = async () => {
    if (!campoEditando) return;
    if (campoEditando === "nombre" && !borrador.trim()) {
      setError("El nombre no puede quedar vacío");
      return;
    }

    const actualizados = { ...valores, [campoEditando]: borrador };
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/proveedores/${proveedor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actualizados),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar el cambio");
      }
      setValores(actualizados);
      setCampoEditando(null);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <h2 className="min-w-0 truncate text-lg sm:text-xl font-semibold text-text">
            {valores.nombre}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-text-dim hover:bg-surface-hover hover:text-text cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</div>
        )}

        <div className="mt-2 divide-y divide-border">
          {CAMPOS.map((campo) => (
            <div key={campo} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-text-dim">{LABELS[campo]}</p>
                {campoEditando === campo ? (
                  campo === "notas" ? (
                    <textarea
                      autoFocus
                      rows={3}
                      value={borrador}
                      onChange={(e) => setBorrador(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-primary bg-surface px-2 py-1.5 text-sm text-text focus:outline-none"
                    />
                  ) : (
                    <input
                      autoFocus
                      type={campo === "email" ? "email" : "text"}
                      value={borrador}
                      onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && guardarCampo()}
                      className="mt-1 w-full rounded-lg border border-primary bg-surface px-2 py-1.5 text-sm text-text focus:outline-none"
                    />
                  )
                ) : (
                  <p className="mt-1 truncate text-sm text-text">{valores[campo] || "—"}</p>
                )}
              </div>

              {campoEditando === campo ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={guardarCampo}
                    title="Guardar"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => setCampoEditando(null)}
                    title="Cancelar"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-dim hover:text-text disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => empezarEdicion(campo)}
                  title={`Editar ${LABELS[campo].toLowerCase()}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-dim hover:bg-surface-hover hover:text-text"
                >
                  ✎
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dim">Compras</p>
            <p className="mt-1 text-sm font-medium text-text">{proveedor.cantidadCompras}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dim">Total comprado</p>
            <p className="mt-1 text-sm font-medium text-text">
              {formatMoney(proveedor.totalComprado)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wide text-text-dim">Deuda</p>
            <p className={`mt-1 text-sm font-medium ${(proveedor.deuda ?? 0) > 0.5 ? "text-danger" : "text-text"}`}>
              {(proveedor.deuda ?? 0) > 0.5 ? formatMoney(proveedor.deuda ?? 0) : "Al día"}
            </p>
          </div>
        </div>

        {(onPagar || onCuentaCorriente) && (
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            {onCuentaCorriente && (
              <button
                type="button"
                onClick={onCuentaCorriente}
                className="rounded-full border border-border px-4 py-2 text-sm text-primary hover:bg-surface-hover cursor-pointer"
              >
                Cuenta corriente
              </button>
            )}
            {onPagar && (proveedor.deuda ?? 0) > 0.5 && (
              <button
                type="button"
                onClick={onPagar}
                className="bg-grad rounded-full px-4 py-2 text-sm font-semibold text-[#050507] cursor-pointer"
              >
                Pagar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}