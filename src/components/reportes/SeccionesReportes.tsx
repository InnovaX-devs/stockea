"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRubro } from "@/components/layout/rubro-context";

const SECCIONES = [
  { href: "/reportes", label: "Resumen" },
  { href: "/reportes/ropa", label: "Ropa", soloRopa: true },
  { href: "/reportes/inventario", label: "Inventario" },
  { href: "/reportes/cuentas-por-cobrar", label: "Cuentas por Cobrar" },
  { href: "/reportes/cuentas-por-pagar", label: "Cuentas por Pagar" },
  { href: "/reportes/estado-resultados", label: "Estado de Resultados" },
];

export function SeccionesReportes() {
  const pathname = usePathname();
  const { usaTallesColores } = useRubro();

  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1 print:hidden">
      {SECCIONES.filter((s) => !s.soloRopa || usaTallesColores).map((s) => {
        const activo = s.href === "/reportes" ? pathname === "/reportes" : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activo ? "bg-primary text-white" : "text-text-dim hover:bg-surface-hover hover:text-text"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}