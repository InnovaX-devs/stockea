"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatFechaAR } from "@/lib/timezone";
import { isPasswordValid } from "@/lib/password-validation";
import {
  actualizarSucursal,
  cambiarEstadoEmpresa,
  cambiarEstadoSucursal,
  cambiarEstadoUsuario,
  cambiarLicencia,
  cambiarRubro,
  crearAdmin,
  crearSucursal,
  restablecerPassword,
  type EmpresaDetalle,
} from "@/app/(dashboard)/innovax/actions";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, ChipLicencia, ChipRubro, INPUT } from "@/components/innovax/panel-empresas";
import { confirmar } from "@/components/ui/dialogos";
import { configRubro, NOMBRES_RUBRO, RUBROS, type Rubro } from "@/lib/rubro";

type Accion = () => Promise<{ success: true } | { success: false; error: string }>;

/** Corre una acción del panel, muestra el resultado y refresca la página. */
function useAccion() {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const correr = (accion: Accion, okMsg: string, despues?: () => void) =>
    startTransition(async () => {
      const r = await accion();
      if (!r.success) return void toast.error(r.error);
      toast.success(okMsg);
      despues?.();
      router.refresh();
    });
  return { pendiente, correr };
}

/* -------------------------------- Cabecera -------------------------------- */

function Cabecera({ empresa }: { empresa: EmpresaDetalle }) {
  const { pendiente, correr } = useAccion();
  const otraLicencia = empresa.licencia === "PREMIUM" ? "BASICO" : "PREMIUM";
  const activasSucursales = empresa.sucursales.filter((s) => s.activa).length;

  async function cambiarLic() {
    const aviso =
      otraLicencia === "BASICO" && activasSucursales > 1
        ? `\n\nOjo: tiene ${activasSucursales} sucursales activas. Con Básico solo se usa la primera y los empleados dejan de poder entrar.`
        : otraLicencia === "BASICO"
          ? "\n\nLos empleados dejan de poder entrar con Básico."
          : "";
    if (!await confirmar(`¿Pasar "${empresa.nombre}" a ${otraLicencia === "PREMIUM" ? "Premium" : "Básico"}?${aviso}`, { titulo: "Cambiar licencia", confirmar: "Cambiar" })) return;
    correr(() => cambiarLicencia(empresa.id, otraLicencia), "Licencia actualizada.");
  }

  async function cambiarEstado() {
    const activar = !empresa.activa;
    if (!activar && !await confirmar(`¿Suspender "${empresa.nombre}"? Nadie de esa empresa va a poder entrar hasta que la reactives.`, { titulo: "Suspender empresa", confirmar: "Suspender", peligro: true })) return;
    correr(() => cambiarEstadoEmpresa(empresa.id, activar), activar ? "Empresa reactivada." : "Empresa suspendida.");
  }

  return (
    <div className="space-y-3">
      <Link href="/innovax" className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Todas las empresas
      </Link>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-text">{empresa.nombre}</h1>
            <ChipLicencia licencia={empresa.licencia} />
            <ChipRubro rubro={empresa.rubro} />
            {!empresa.activa && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Suspendida</span>}
            {empresa.esLaMia && <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-dim">Tu empresa</span>}
          </div>
          <p className="mt-1 text-sm text-text-dim">ID {empresa.id} · alta el {formatFechaAR(new Date(empresa.createdAt))}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={cambiarLic} disabled={pendiente} className={BOTON_SECUNDARIO}>
            Pasar a {otraLicencia === "PREMIUM" ? "Premium" : "Básico"}
          </button>
          {!empresa.esLaMia && (
            <button
              type="button"
              onClick={cambiarEstado}
              disabled={pendiente}
              className={cn(BOTON_SECUNDARIO, empresa.activa && "text-danger hover:bg-danger/5")}
            >
              {empresa.activa ? "Suspender empresa" : "Reactivar empresa"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Rubro ---------------------------------- */

function RubroEmpresa({ empresa }: { empresa: EmpresaDetalle }) {
  const { pendiente, correr } = useAccion();
  const [rubro, setRubro] = useState<Rubro>(empresa.rubro);
  const cambio = rubro !== empresa.rubro;

  async function guardar() {
    const aviso = configRubro(empresa.rubro).usaContenido && !configRubro(rubro).usaContenido
      ? "\n\nSe deja de mostrar el contenido (ml, g, etc.). Los datos no se borran: si vuelve a un rubro que lo usa, siguen ahí."
      : "\n\nNo se borra ningún dato, solo cambia qué se muestra.";
    if (!await confirmar(`¿Pasar "${empresa.nombre}" a ${NOMBRES_RUBRO[rubro]}?${aviso}`, { titulo: "Cambiar rubro", confirmar: "Cambiar" })) return;
    correr(() => cambiarRubro(empresa.id, rubro), "Rubro actualizado.");
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-4">
      <h2 className="text-base font-semibold text-text">Rubro</h2>
      <p className="text-xs text-text-dim">Define qué campos y textos de ejemplo ve el negocio (ej. el contenido en ml/g/l no se muestra en Ropa). No cambia el plan.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="rubro-empresa" className="mb-1 block text-xs text-text-dim">Rubro del negocio</label>
          <select id="rubro-empresa" value={rubro} onChange={(e) => setRubro(e.target.value as Rubro)} className={INPUT}>
            {RUBROS.map((r) => (
              <option key={r} value={r}>{NOMBRES_RUBRO[r]}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={guardar} disabled={pendiente || !cambio} className={BOTON_PRIMARIO}>
          Guardar rubro
        </button>
      </div>
    </section>
  );
}

/* ------------------------------- Sucursales ------------------------------- */

function FilaSucursal({ sucursal }: { sucursal: EmpresaDetalle["sucursales"][number] }) {
  const { pendiente, correr } = useAccion();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(sucursal.nombre);
  const [direccion, setDireccion] = useState(sucursal.direccion ?? "");

  if (editando) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={`suc-n-${sucursal.id}`} className="mb-1 block text-xs text-text-dim">Nombre</label>
          <input id={`suc-n-${sucursal.id}`} value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
        </div>
        <div className="flex-1">
          <label htmlFor={`suc-d-${sucursal.id}`} className="mb-1 block text-xs text-text-dim">Dirección (opcional)</label>
          <input id={`suc-d-${sucursal.id}`} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={INPUT} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pendiente || !nombre.trim()}
            onClick={() => correr(() => actualizarSucursal(sucursal.id, { nombre, direccion }), "Sucursal actualizada.", () => setEditando(false))}
            className={BOTON_PRIMARIO}
          >
            Guardar
          </button>
          <button type="button" onClick={() => setEditando(false)} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between", !sucursal.activa && "opacity-60")}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-text">
          <MapPin className="h-3.5 w-3.5 text-text-dim" /> {sucursal.nombre}
          <span className="text-xs font-normal text-text-dim">#{sucursal.id}</span>
          {!sucursal.activa && <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-normal text-text-dim">Inactiva</span>}
        </p>
        <p className="text-xs text-text-dim">
          {sucursal.direccion || "Sin dirección"} · {sucursal.empleados === 0 ? "sin empleado" : `${sucursal.empleados} empleado${sucursal.empleados > 1 ? "s" : ""}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setEditando(true)} className={BOTON_SECUNDARIO}>
          Editar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={async () => {
            if (sucursal.activa && !await confirmar(`¿Desactivar "${sucursal.nombre}"? Deja de aparecer en el selector; sus datos no se borran.`, { titulo: "Desactivar sucursal", confirmar: "Desactivar", peligro: true })) return;
            correr(() => cambiarEstadoSucursal(sucursal.id, !sucursal.activa), sucursal.activa ? "Sucursal desactivada." : "Sucursal activada.");
          }}
          className={cn(BOTON_SECUNDARIO, sucursal.activa && "text-danger hover:bg-danger/5")}
        >
          {sucursal.activa ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  );
}

function Sucursales({ empresa }: { empresa: EmpresaDetalle }) {
  const { pendiente, correr } = useAccion();
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const activas = empresa.sucursales.filter((s) => s.activa).length;
  const puedeAgregar = empresa.licencia === "PREMIUM" || activas === 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-text">Sucursales</h2>
          {!puedeAgregar && <p className="text-xs text-text-dim">Con Básico tiene una sola sucursal. Para agregar más, pasala a Premium.</p>}
        </div>
        {puedeAgregar && !creando && (
          <button type="button" onClick={() => setCreando(true)} className={BOTON_SECUNDARIO}>
            <Plus className="h-4 w-4" /> Agregar sucursal
          </button>
        )}
      </div>
      {creando && (
        <div className="flex flex-col gap-2 border-t border-border bg-surface-hover/40 px-4 py-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="suc-nueva-n" className="mb-1 block text-xs text-text-dim">Nombre</label>
            <input id="suc-nueva-n" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sucursal Centro" className={INPUT} />
          </div>
          <div className="flex-1">
            <label htmlFor="suc-nueva-d" className="mb-1 block text-xs text-text-dim">Dirección (opcional)</label>
            <input id="suc-nueva-d" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={INPUT} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pendiente || !nombre.trim()}
              onClick={() =>
                correr(() => crearSucursal(empresa.id, { nombre, direccion }), "Sucursal creada.", () => {
                  setCreando(false);
                  setNombre("");
                  setDireccion("");
                })
              }
              className={BOTON_PRIMARIO}
            >
              Crear
            </button>
            <button type="button" onClick={() => setCreando(false)} className={BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="divide-y divide-border border-t border-border">
        {empresa.sucursales.map((s) => (
          <FilaSucursal key={s.id} sucursal={s} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- Usuarios -------------------------------- */

function FilaUsuario({ usuario }: { usuario: EmpresaDetalle["usuarios"][number] }) {
  const { pendiente, correr } = useAccion();
  const [cambiando, setCambiando] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <div className={cn("space-y-2 px-4 py-3", !usuario.activo && "opacity-60")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text">
            {usuario.nombre}
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-normal text-text-dim">
              {usuario.rol === "ADMIN" ? "Admin" : "Empleado"}
            </span>
            {usuario.sucursalNombre && <span className="text-xs font-normal text-text-dim">· {usuario.sucursalNombre}</span>}
            {usuario.esDesarrollador && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">Desarrollador</span>}
            {!usuario.activo && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-normal text-danger">Inactivo</span>}
          </p>
          <p className="truncate text-xs text-text-dim">{usuario.email}</p>
        </div>
        {!cambiando && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setCambiando(true)} className={BOTON_SECUNDARIO}>
              Cambiar contraseña
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={async () => {
                if (usuario.activo && !await confirmar(`¿Desactivar a ${usuario.email}? No va a poder entrar hasta que lo actives.`, { titulo: "Desactivar usuario", confirmar: "Desactivar", peligro: true })) return;
                correr(() => cambiarEstadoUsuario(usuario.id, !usuario.activo), usuario.activo ? "Usuario desactivado." : "Usuario activado.");
              }}
              className={cn(BOTON_SECUNDARIO, usuario.activo && "text-danger hover:bg-danger/5")}
            >
              {usuario.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        )}
      </div>
      {cambiando && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={`pass-${usuario.id}`} className="mb-1 block text-xs text-text-dim">Nueva contraseña para {usuario.email}</label>
            <input id={`pass-${usuario.id}`} type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pendiente || !isPasswordValid(password)}
              onClick={() =>
                correr(() => restablecerPassword(usuario.id, password), "Contraseña cambiada.", () => {
                  setCambiando(false);
                  setPassword("");
                })
              }
              className={BOTON_PRIMARIO}
            >
              Guardar
            </button>
            <button type="button" onClick={() => { setCambiando(false); setPassword(""); }} className={BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Usuarios({ empresa }: { empresa: EmpresaDetalle }) {
  const { pendiente, correr } = useAccion();
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-text">Usuarios</h2>
          <p className="text-xs text-text-dim">Los empleados los crea el admin del cliente desde Configuración › Usuarios.</p>
        </div>
        {!creando && (
          <button type="button" onClick={() => setCreando(true)} className={BOTON_SECUNDARIO}>
            <Plus className="h-4 w-4" /> Agregar admin
          </button>
        )}
      </div>
      {creando && (
        <div className="grid gap-2 border-t border-border bg-surface-hover/40 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="adm-n" className="mb-1 block text-xs text-text-dim">Nombre</label>
            <input id="adm-n" value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label htmlFor="adm-e" className="mb-1 block text-xs text-text-dim">Email</label>
            <input id="adm-e" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label htmlFor="adm-p" className="mb-1 block text-xs text-text-dim">Contraseña</label>
            <input id="adm-p" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pendiente || !nombre.trim() || !email.trim() || !isPasswordValid(password)}
              onClick={() =>
                correr(() => crearAdmin(empresa.id, { nombre, email, password }), "Admin creado.", () => {
                  setCreando(false);
                  setNombre("");
                  setEmail("");
                  setPassword("");
                })
              }
              className={BOTON_PRIMARIO}
            >
              Crear
            </button>
            <button type="button" onClick={() => setCreando(false)} className={BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="divide-y divide-border border-t border-border">
        {empresa.usuarios.map((u) => (
          <FilaUsuario key={u.id} usuario={u} />
        ))}
      </div>
    </section>
  );
}

export function DetalleEmpresa({ empresa }: { empresa: EmpresaDetalle }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Cabecera empresa={empresa} />
      <RubroEmpresa key={empresa.rubro} empresa={empresa} />
      <Sucursales empresa={empresa} />
      <Usuarios empresa={empresa} />
    </div>
  );
}
