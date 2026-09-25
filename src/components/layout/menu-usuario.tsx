"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { ChevronDown, Eye, EyeOff, KeyRound, Lock, LogOut, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { cambiarAAdmin, cambiarAEmpleado } from "@/app/(dashboard)/cambio-usuario-actions";
import { CambiarPasswordModal } from "@/components/layout/cambiar-password-modal";
import type { Rol } from "@/lib/permisos";

/**
 * Menú de usuario de la barra superior: muestra quién está usando el
 * sistema y junta el cambio rápido admin ⇄ empleado, el cambio de
 * contraseña y el cierre de sesión. Las reglas del cambio de usuario están
 * en cambio-usuario-actions.ts (acá es solo la vista).
 */

const ETIQUETA_ROL: Record<Rol, string> = { ADMIN: "Administrador", EMPLEADO: "Empleado" };

function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

// El admin lleva el degradé de la marca; el empleado, un tono neutro. Así
// de un vistazo se ve con qué usuario está abierta la caja.
function Avatar({ nombre, rol, tamaño = "md" }: { nombre: string; rol: Rol; tamaño?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display font-bold",
        tamaño === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs",
        rol === "ADMIN" ? "bg-grad text-[#050507]" : "bg-white/15 text-white ring-1 ring-inset ring-white/25"
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

// En el panel (fondo claro) el avatar del empleado necesita otro contraste.
function AvatarPanel({ nombre, rol }: { nombre: string; rol: Rol }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold",
        rol === "ADMIN" ? "bg-grad text-[#050507]" : "bg-surface-hover text-text ring-1 ring-inset ring-border"
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function MenuUsuario({
  nombre,
  rol,
  otroUsuario,
}: {
  nombre: string;
  rol: Rol;
  /** Usuario al que se puede pasar (admin ⇄ empleado), o null. */
  otroUsuario: { nombre: string; rol: Rol } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modalPassword, setModalPassword] = useState(false);
  const [modalCambio, setModalCambio] = useState(false);
  const [cambiandoA, setCambiandoA] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  function irA(destino: string, nombreDestino: string) {
    setCambiandoA(nombreDestino);
    // Recarga completa: menú, permisos y carrito arrancan de cero.
    window.location.assign(destino);
  }

  function elegirOtroUsuario() {
    if (!otroUsuario) return;
    setAbierto(false);
    if (rol === "EMPLEADO") {
      setModalCambio(true);
      return;
    }
    setCambiandoA(otroUsuario.nombre);
    startTransition(async () => {
      const r = await cambiarAEmpleado();
      if (!r.success) {
        setCambiandoA(null);
        toast.error(r.error);
        return;
      }
      irA(r.destino, otroUsuario.nombre);
    });
  }

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      toast.error("No se pudo cerrar la sesión. Intentá de nuevo.");
      setCerrandoSesion(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={cn(
          "flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors sm:pr-3",
          abierto ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
        )}
      >
        <Avatar nombre={nombre} rol={rol} />
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-[9rem] truncate text-[13px] font-medium text-white">{nombre}</span>
          <span className="block text-[11px] text-white/55">{ETIQUETA_ROL[rol]}</span>
        </span>
        <ChevronDown
          className={cn("hidden h-3.5 w-3.5 text-white/55 transition-transform sm:block", abierto && "rotate-180")}
        />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-72 overflow-hidden rounded-xl border border-border bg-bg shadow-xl"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <AvatarPanel nombre={nombre} rol={rol} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{nombre}</p>
              <p className="text-xs text-text-dim">{ETIQUETA_ROL[rol]}</p>
            </div>
          </div>

          {otroUsuario && (
            <div className="border-t border-border px-2 py-2">
              <p className="px-2 pb-1.5 pt-0.5 text-xs text-text-dim">Cambiar de usuario</p>
              <button
                type="button"
                role="menuitem"
                onClick={elegirOtroUsuario}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <AvatarPanel nombre={otroUsuario.nombre} rol={otroUsuario.rol} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{otroUsuario.nombre}</span>
                  <span className="block text-xs text-text-dim">{ETIQUETA_ROL[otroUsuario.rol]}</span>
                </span>
                {rol === "EMPLEADO" && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-text-dim" aria-label="Pide contraseña" />
                )}
              </button>
            </div>
          )}

          <div className="border-t border-border px-2 py-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                setModalPassword(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-hover"
            >
              <KeyRound className="h-4 w-4 text-text-dim" /> Cambiar mi contraseña
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={cerrarSesion}
              disabled={cerrandoSesion}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-clay transition-colors hover:bg-clay-soft disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> {cerrandoSesion ? "Cerrando sesión..." : "Cerrar sesión"}
            </button>
          </div>
        </div>
      )}

      <CambiarPasswordModal open={modalPassword} onClose={() => setModalPassword(false)} />

      {modalCambio && otroUsuario && (
        <ModalPasswordAdmin
          admin={otroUsuario}
          onCerrar={() => setModalCambio(false)}
          onListo={(destino) => {
            setModalCambio(false);
            irA(destino, otroUsuario.nombre);
          }}
        />
      )}

      {cambiandoA &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-bg/95 backdrop-blur-sm">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" />
            <p className="text-sm text-text">Cambiando a {cambiandoA}...</p>
          </div>,
          document.body
        )}
    </div>
  );
}

function ModalPasswordAdmin({
  admin,
  onCerrar,
  onListo,
}: {
  admin: { nombre: string; rol: Rol };
  onCerrar: () => void;
  onListo: (destino: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await cambiarAAdmin(password);
      if (!r.success) {
        setError(r.error);
        setPassword("");
        return;
      }
      onListo(r.destino);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4" onClick={onCerrar}>
      <div
        className="relative w-full max-w-sm rounded-xl border border-border bg-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCerrar}
          className="absolute right-3 top-3 rounded p-1 text-text/60 hover:bg-surface-hover"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex flex-col items-center text-center">
          <span className="relative">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-grad font-display text-lg font-bold text-[#050507]">
              {iniciales(admin.nombre)}
            </span>
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-text text-bg">
              <Lock className="h-3 w-3" />
            </span>
          </span>
          <h2 className="mt-3 font-display text-base font-semibold text-text">{admin.nombre}</h2>
          <p className="text-sm text-text-dim">Ingresá la contraseña del administrador</p>
        </div>

        <form onSubmit={enviar} className="space-y-3">
          <div className="relative">
            <input
              type={ver ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="off"
              disabled={pendiente}
              aria-label="Contraseña del administrador"
              className={cn(
                "w-full rounded-lg border bg-white px-3 py-2.5 pr-9 text-sm text-text focus:outline-none focus:ring-1",
                error ? "border-danger focus:ring-danger" : "border-border focus:ring-primary"
              )}
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
              aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={pendiente || !password}
            className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pendiente ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
