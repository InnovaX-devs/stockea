"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Eye, EyeOff, MapPin, UserPlus } from "lucide-react";
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

type SucursalOpcion = { id: number; nombre: string };

/** Un empleado con sus acciones (cambiar contraseña, eliminar). */
function FilaEmpleado({
  empleado,
  premium,
  mostrarSucursal,
}: {
  empleado: UsuarioResumen;
  premium: boolean;
  mostrarSucursal: boolean;
}) {
  const [pendiente, startTransition] = useTransition();
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [nuevaPassword, setNuevaPassword] = useState("");

  function guardarPassword() {
    startTransition(async () => {
      const r = await restablecerPasswordEmpleado(empleado.id, nuevaPassword);
      if (!r.success) return void toast.error(r.error);
      toast.success(`Contraseña de ${empleado.nombre} cambiada.`);
      setCambiandoPassword(false);
      setNuevaPassword("");
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar a ${empleado.nombre}? Va a dejar de poder entrar al sistema en el momento.`)) return;
    startTransition(async () => {
      const r = await eliminarEmpleado(empleado.id);
      if (!r.success) return void toast.error(r.error);
      toast.success("Empleado eliminado.");
    });
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{empleado.nombre}</p>
          <p className="truncate text-xs text-text-dim">{empleado.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {mostrarSucursal && empleado.sucursalNombre && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-text-dim">
              <MapPin className="h-3 w-3" /> {empleado.sucursalNombre}
            </span>
          )}
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-dim">Empleado</span>
        </div>
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
  );
}

export function UsuariosSection({
  usuarios,
  premium,
  sucursales,
}: {
  usuarios: UsuarioResumen[];
  premium: boolean;
  /** Sucursales habilitadas de la empresa (una sola si no es multisucursal). */
  sucursales: SucursalOpcion[];
}) {
  const admin = usuarios.find((u) => u.rol === "ADMIN");
  const empleados = usuarios.filter((u) => u.rol === "EMPLEADO");
  const multisucursal = sucursales.length > 1;
  const principalId = sucursales[0]?.id;
  const [pendiente, startTransition] = useTransition();

  // Un empleado por sucursal: solo se ofrecen las que todavía no tienen.
  // Un empleado sin sucursal (de antes de las sucursales) cuenta como de la principal.
  const ocupadas = new Set(empleados.map((e) => e.sucursalId ?? principalId));
  const libres = sucursales.filter((s) => !ocupadas.has(s.id));

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const sucursalElegida = multisucursal ? (libres.find((s) => s.id === sucursalId) ?? libres[0]) : sucursales[0];

  function crear() {
    startTransition(async () => {
      const r = await crearEmpleado({ nombre, email, password, sucursalId: sucursalElegida?.id ?? null });
      if (!r.success) return void toast.error(r.error);
      toast.success("Empleado creado. Ya puede entrar con su email y contraseña.");
      setCreando(false);
      setNombre("");
      setEmail("");
      setPassword("");
      setSucursalId(null);
    });
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white p-6">
      <h2 className="text-base font-semibold text-text">Usuarios</h2>
      <p className="mb-4 text-sm text-text-dim">
        El empleado puede hacer ventas, manejar pedidos, cargar clientes y cobrarles, y ver los productos sin costos.
        No ve finanzas, compras, reportes ni configuración.
        {multisucursal && " Cada sucursal tiene su propio empleado, que solo ve y vende en esa sucursal."}
      </p>

      <div className="divide-y divide-border rounded-xl border border-border">
        {admin && (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{admin.nombre}</p>
              <p className="truncate text-xs text-text-dim">{admin.email}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Administrador{multisucursal ? " · todas las sucursales" : ""}
            </span>
          </div>
        )}

        {empleados.map((empleado) => (
          <FilaEmpleado key={empleado.id} empleado={empleado} premium={premium} mostrarSucursal={multisucursal} />
        ))}
      </div>

      {empleados.length === 0 && !premium && (
        <p className="mt-4 text-sm text-text-dim">Sumar un usuario empleado está disponible en el plan Premium.</p>
      )}

      {premium && libres.length > 0 && !creando && (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" /> Agregar empleado
        </button>
      )}

      {premium && libres.length > 0 && creando && (
        <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
          {multisucursal && (
            <div>
              <label htmlFor="empleado-sucursal" className="mb-1 block text-sm text-text-dim">Sucursal</label>
              <select
                id="empleado-sucursal"
                value={sucursalElegida?.id ?? ""}
                onChange={(e) => setSucursalId(Number(e.target.value))}
                className={INPUT}
              >
                {libres.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
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
