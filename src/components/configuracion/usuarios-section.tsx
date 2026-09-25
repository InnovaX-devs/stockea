"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Eye, EyeOff, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { PASSWORD_REQUIREMENTS, isPasswordValid } from "@/lib/password-validation";
import {
  crearEmpleado,
  eliminarEmpleado,
  restablecerPasswordEmpleado,
  type UsuarioResumen,
} from "@/app/(dashboard)/configuracion/usuarios-actions";

const INPUT =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary";
const BOTON_SECUNDARIO =
  "rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-50 cursor-pointer";

function CampoPassword({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          className={cn(INPUT, "pr-9")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {value && (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {PASSWORD_REQUIREMENTS.map((r) => (
            <li key={r.id} className={cn("flex items-center gap-1.5 text-xs", r.test(value) ? "text-success" : "text-text-dim")}>
              <Check className={cn("h-3 w-3", !r.test(value) && "opacity-30")} /> {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UsuariosSection({ usuarios, premium }: { usuarios: UsuarioResumen[]; premium: boolean }) {
  const admin = usuarios.find((u) => u.rol === "ADMIN");
  const empleado = usuarios.find((u) => u.rol === "EMPLEADO");
  const [pendiente, startTransition] = useTransition();

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [nuevaPassword, setNuevaPassword] = useState("");

  function crear() {
    startTransition(async () => {
      const r = await crearEmpleado({ nombre, email, password });
      if (!r.success) return void toast.error(r.error);
      toast.success("Empleado creado. Ya puede entrar con su email y contraseña.");
      setCreando(false);
      setNombre("");
      setEmail("");
      setPassword("");
    });
  }

  function guardarPassword() {
    startTransition(async () => {
      const r = await restablecerPasswordEmpleado(nuevaPassword);
      if (!r.success) return void toast.error(r.error);
      toast.success("Contraseña del empleado cambiada.");
      setCambiandoPassword(false);
      setNuevaPassword("");
    });
  }

  function eliminar() {
    if (!empleado) return;
    if (!confirm(`¿Eliminar a ${empleado.nombre}? Va a dejar de poder entrar al sistema en el momento.`)) return;
    startTransition(async () => {
      const r = await eliminarEmpleado();
      if (!r.success) return void toast.error(r.error);
      toast.success("Empleado eliminado.");
    });
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white p-6">
      <h2 className="text-base font-semibold text-text">Usuarios</h2>
      <p className="mb-4 text-sm text-text-dim">
        El empleado puede hacer ventas, manejar pedidos, cargar clientes y cobrarles, y ver los productos sin costos.
        No ve finanzas, compras, reportes ni configuración.
      </p>

      <div className="divide-y divide-border rounded-xl border border-border">
        {admin && (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{admin.nombre}</p>
              <p className="truncate text-xs text-text-dim">{admin.email}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Administrador</span>
          </div>
        )}

        {empleado && (
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{empleado.nombre}</p>
                <p className="truncate text-xs text-text-dim">{empleado.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-dim">Empleado</span>
            </div>

            {premium && !cambiandoPassword && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCambiandoPassword(true)} className={BOTON_SECUNDARIO}>
                  Cambiar su contraseña
                </button>
                <button
                  type="button"
                  onClick={eliminar}
                  disabled={pendiente}
                  className={cn(BOTON_SECUNDARIO, "text-danger hover:bg-danger/5")}
                >
                  Eliminar empleado
                </button>
              </div>
            )}

            {!premium && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-text-dim">Con el plan actual el empleado no puede entrar.</p>
                <button
                  type="button"
                  onClick={eliminar}
                  disabled={pendiente}
                  className={cn(BOTON_SECUNDARIO, "text-danger hover:bg-danger/5")}
                >
                  Eliminar empleado
                </button>
              </div>
            )}

            {cambiandoPassword && (
              <div className="space-y-2">
                <label className="block text-sm text-text-dim">Nueva contraseña para {empleado.nombre}</label>
                <CampoPassword value={nuevaPassword} onChange={setNuevaPassword} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={guardarPassword}
                    disabled={pendiente || !isPasswordValid(nuevaPassword)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {pendiente ? "Guardando..." : "Guardar contraseña"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCambiandoPassword(false);
                      setNuevaPassword("");
                    }}
                    className={BOTON_SECUNDARIO}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!empleado && !premium && (
        <p className="mt-4 text-sm text-text-dim">Sumar un usuario empleado está disponible en el plan Premium.</p>
      )}

      {!empleado && premium && !creando && (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" /> Agregar empleado
        </button>
      )}

      {!empleado && premium && creando && (
        <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
          <div>
            <label className="mb-1 block text-sm text-text-dim">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-dim">Email (lo usa para entrar)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-dim">Contraseña</label>
            <CampoPassword value={password} onChange={setPassword} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={crear}
              disabled={pendiente || !nombre.trim() || !email.trim() || !isPasswordValid(password)}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pendiente ? "Creando..." : "Crear empleado"}
            </button>
            <button type="button" onClick={() => setCreando(false)} className={BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
