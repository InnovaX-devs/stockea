"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X, KeyRound, Eye, EyeOff, Check } from "lucide-react";
import { toast } from "sonner";
import { cambiarPassword } from "@/app/(dashboard)/configuracion/actions"; // ⚠️ ajustar si tu ruta real es otra
import { PASSWORD_REQUIREMENTS, isPasswordValid } from "@/lib/password-validation";
import { cn } from "@/lib/cn";

interface CambiarPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete,
  hasError,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  autoComplete: string;
  hasError?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-text/60">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          className={cn(
            "w-full rounded-lg border bg-surface px-3 py-2 pr-9 text-sm text-text focus:outline-none",
            hasError ? "border-danger focus:border-danger" : "border-border focus:border-primary"
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text/50 hover:text-text disabled:opacity-50"
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function CambiarPasswordModal({ open, onClose }: CambiarPasswordModalProps) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [pendiente, startTransition] = useTransition();

  const requisitosCumplidos = useMemo(
    () =>
      PASSWORD_REQUIREMENTS.map((req) => ({
        ...req,
        cumplido: req.test(passwordNueva),
      })),
    [passwordNueva]
  );

  const nuevaEsValida = isPasswordValid(passwordNueva);
  const confirmarTocado = confirmarPassword.length > 0;
  const contrasenasCoinciden = passwordNueva === confirmarPassword;

  function limpiarYCerrar() {
    setPasswordActual("");
    setPasswordNueva("");
    setConfirmarPassword("");
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!passwordActual || !passwordNueva || !confirmarPassword) {
      toast.error("Completá todos los campos");
      return;
    }

    if (!nuevaEsValida) {
      toast.error("La nueva contraseña tiene que tener al menos 6 caracteres");
      return;
    }

    if (!contrasenasCoinciden) {
      toast.error("Las contraseñas nuevas no coinciden");
      return;
    }

    startTransition(async () => {
      try {
        await cambiarPassword(passwordActual, passwordNueva);
        toast.success("Contraseña actualizada correctamente");
        limpiarYCerrar();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
      }
    });
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      onClick={limpiarYCerrar}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold text-text">Cambiar contraseña</h2>
          </div>
          <button
            type="button"
            onClick={limpiarYCerrar}
            className="rounded p-1 text-text/60 hover:bg-surface-hover"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <PasswordInput
            id="password-actual"
            label="Contraseña actual"
            value={passwordActual}
            onChange={setPasswordActual}
            disabled={pendiente}
            autoComplete="current-password"
          />

          <div>
            <PasswordInput
              id="password-nueva"
              label="Contraseña nueva"
              value={passwordNueva}
              onChange={setPasswordNueva}
              disabled={pendiente}
              autoComplete="new-password"
            />

            {passwordNueva.length > 0 && (
              <ul className="mt-2 space-y-1">
                {requisitosCumplidos.map((req) => (
                  <li
                    key={req.id}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      req.cumplido ? "text-success" : "text-text/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                        req.cumplido ? "border-success bg-success/15" : "border-border"
                      )}
                    >
                      {req.cumplido && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    {req.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <PasswordInput
              id="password-confirmar"
              label="Confirmar contraseña nueva"
              value={confirmarPassword}
              onChange={setConfirmarPassword}
              disabled={pendiente}
              autoComplete="new-password"
              hasError={confirmarTocado && !contrasenasCoinciden}
            />
            {confirmarTocado && (
              <p className={cn("mt-1 text-xs", contrasenasCoinciden ? "text-success" : "text-danger")}>
                {contrasenasCoinciden ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={limpiarYCerrar}
              disabled={pendiente}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                pendiente ||
                !passwordActual ||
                !nuevaEsValida ||
                !contrasenasCoinciden ||
                confirmarPassword.length === 0
              }
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pendiente ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}