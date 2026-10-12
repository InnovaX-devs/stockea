"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatFechaAR } from "@/lib/timezone";
import { isPasswordValid } from "@/lib/password-validation";
import { crearEmpresa, type EmpresaFila } from "@/app/(dashboard)/innovax/actions";

export const INPUT =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary";
export const BOTON_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
export const BOTON_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-50";

export function ChipLicencia({ licencia }: { licencia: "BASICO" | "PREMIUM" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        licencia === "PREMIUM" ? "bg-primary/10 text-primary" : "bg-surface-hover text-text-dim"
      )}
    >
      {licencia === "PREMIUM" ? "Premium" : "Básico"}
    </span>
  );
}

function NuevaEmpresa({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [adminNombre, setAdminNombre] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [licencia, setLicencia] = useState<"BASICO" | "PREMIUM">("BASICO");
  const [cotizacion, setCotizacion] = useState("");

  const valido = nombreNegocio.trim() && adminEmail.trim() && isPasswordValid(adminPassword);

  function crear() {
    startTransition(async () => {
      const r = await crearEmpresa({
        nombreNegocio,
        adminNombre,
        adminEmail,
        adminPassword,
        licencia,
        cotizacionUSD: cotizacion ? Number(cotizacion) : undefined,
      });
      if (!r.success) return void toast.error(r.error);
      toast.success(`Empresa creada. El admin ya puede entrar con ${adminEmail.trim().toLowerCase()}.`);
      onCerrar();
      router.push(`/innovax/empresas/${r.data.empresaId}`);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white p-5">
      <h2 className="text-base font-semibold text-text">Nueva empresa</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ne-nombre" className="mb-1 block text-sm text-text-dim">Nombre del negocio</label>
          <input id="ne-nombre" value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="ne-licencia" className="mb-1 block text-sm text-text-dim">Licencia</label>
          <select id="ne-licencia" value={licencia} onChange={(e) => setLicencia(e.target.value as "BASICO" | "PREMIUM")} className={INPUT}>
            <option value="BASICO">Básico</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </div>
        <div>
          <label htmlFor="ne-admin-nombre" className="mb-1 block text-sm text-text-dim">Nombre del admin (opcional)</label>
          <input id="ne-admin-nombre" value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} placeholder="Administrador" className={INPUT} />
        </div>
        <div>
          <label htmlFor="ne-email" className="mb-1 block text-sm text-text-dim">Email del admin (con este entra)</label>
          <input id="ne-email" type="email" autoComplete="off" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="ne-pass" className="mb-1 block text-sm text-text-dim">Contraseña del admin</label>
          <input id="ne-pass" type="text" autoComplete="off" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={INPUT} />
          <p className={cn("mt-1 text-xs", adminPassword && !isPasswordValid(adminPassword) ? "text-danger" : "text-text-dim")}>
            Al menos 6 caracteres. Pasásela al cliente y que la cambie al entrar.
          </p>
        </div>
        <div>
          <label htmlFor="ne-cot" className="mb-1 block text-sm text-text-dim">Cotización USD (opcional)</label>
          <input id="ne-cot" type="number" min="0" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} placeholder="1000" className={INPUT} />
        </div>
      </div>
      <p className="text-xs text-text-dim">Se crea con su sucursal &quot;Principal&quot; y el usuario admin.</p>
      <div className="flex gap-2">
        <button type="button" onClick={crear} disabled={pendiente || !valido} className={BOTON_PRIMARIO}>
          {pendiente ? "Creando..." : "Crear empresa"}
        </button>
        <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function PanelEmpresas({ empresas }: { empresas: EmpresaFila[] }) {
  const [creando, setCreando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter((e) => e.nombre.toLowerCase().includes(q) || (e.adminEmail ?? "").toLowerCase().includes(q) || String(e.id) === q);
  }, [empresas, busqueda]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">Panel InnovaX</h1>
          <p className="text-sm text-text-dim">Empresas, sucursales y usuarios de todos los clientes. Solo lo ven los desarrolladores.</p>
        </div>
        {!creando && (
          <button type="button" onClick={() => setCreando(true)} className={BOTON_PRIMARIO}>
            <Plus className="h-4 w-4" /> Nueva empresa
          </button>
        )}
      </div>

      {creando && <NuevaEmpresa onCerrar={() => setCreando(false)} />}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-text-dim" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, email del admin o ID"
            aria-label="Buscar empresa"
            className="w-full bg-transparent text-sm text-text focus:outline-none"
          />
          <span className="shrink-0 text-xs text-text-dim">{filtradas.length} de {empresas.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-topbar">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Licencia</th>
                <th className="px-4 py-3 text-right">Sucursales</th>
                <th className="px-4 py-3 text-right">Usuarios</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Alta</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e) => (
                <tr key={e.id} className={cn("border-t border-border hover:bg-surface-hover", !e.activa && "opacity-60")}>
                  <td className="px-4 py-3 tabular-nums text-text-dim">{e.id}</td>
                  <td className="px-4 py-3">
                    <Link href={`/innovax/empresas/${e.id}`} className="inline-flex items-center gap-2 font-medium text-text hover:underline">
                      <Building2 className="h-4 w-4 text-text-dim" /> {e.nombre}
                    </Link>
                    {!e.activa && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Suspendida</span>}
                  </td>
                  <td className="px-4 py-3"><ChipLicencia licencia={e.licencia} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.sucursales}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.usuarios}</td>
                  <td className="px-4 py-3 text-text-dim">{e.adminEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-text-dim">{formatFechaAR(new Date(e.createdAt))}</td>
                  <td className="px-4 py-3">
                    <Link href={`/innovax/empresas/${e.id}`} aria-label={`Ver ${e.nombre}`} className="text-text-dim hover:text-text">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-dim">No hay empresas que coincidan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
