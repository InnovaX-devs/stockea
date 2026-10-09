import type { ReactNode } from "react";
import { Topbar } from "@/components/layout/topbar";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { DevCredit } from "@/components/shared/dev-credit";
import { redirect } from "next/navigation";
import { obtenerUsuarioActualOpcional } from "@/lib/empresa";
import { RolProvider } from "@/components/layout/rol-context";
import { prisma } from "@/lib/prisma";
import { obtenerContextoSucursal } from "@/lib/sucursal";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Si la sesión quedó colgada (usuario borrado/desactivado), se cierra.
  const usuario = await obtenerUsuarioActualOpcional();
  if (!usuario) redirect("/salir");

  const [configuracion, contextoSucursal] = await Promise.all([obtenerConfiguracion(), obtenerContextoSucursal()]);

  // Usuarios de la empresa: el nombre del actual para el menú de usuario y,
  // con Premium, el otro usuario para el cambio rápido admin ⇄ empleado.
  // Con varias sucursales hay un empleado por sucursal: el admin pasa al de
  // la sucursal que está mirando (ver cambio-usuario-actions.ts).
  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: usuario.empresaId, activo: true },
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, rol: true, sucursalId: true },
  });
  const usuarioNombre = usuarios.find((u) => u.id === usuario.id)?.nombre ?? "Usuario";
  const empleadoDeLaSucursal = () => {
    const empleados = usuarios.filter((u) => u.rol === "EMPLEADO");
    const actualId = contextoSucursal.actual?.id;
    return empleados.find((u) => u.sucursalId === actualId) ?? (contextoSucursal.multisucursal ? undefined : empleados[0]);
  };
  const otro =
    configuracion.licencia !== "PREMIUM"
      ? undefined
      : usuario.rol === "ADMIN"
        ? empleadoDeLaSucursal()
        : usuarios.find((u) => u.rol === "ADMIN");

  return (
    <RolProvider rol={usuario.rol}>
    <div className="flex min-h-dvh flex-col bg-bg">
      <Topbar
        logoUrl={configuracion.logoUrl ?? null}
        nombreNegocio={configuracion.nombreNegocio}
        eslogan={configuracion.eslogan}
        premium={configuracion.licencia === "PREMIUM"}
        cotizacionUSD={configuracion.cotizacionUSD}
        usaCotizacionUSD={configuracion.usaCotizacionUSD}
        rol={usuario.rol}
        usuarioNombre={usuarioNombre}
        otroUsuario={otro ? { nombre: otro.nombre, rol: otro.rol } : null}
        sucursal={
          contextoSucursal.multisucursal
            ? {
                sucursales: contextoSucursal.sucursales.map((s) => ({ id: s.id, nombre: s.nombre })),
                actualId: contextoSucursal.actual?.id ?? null,
                puedeElegir: contextoSucursal.puedeElegir,
              }
            : null
        }
      />
      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-border px-4 py-3 sm:px-6">
        <DevCredit />
      </footer>
    </div>
    </RolProvider>
  );
}