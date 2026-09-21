"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { href: "/reportes", label: "Resumen" },
  { href: "/reportes/inventario", label: "Inventario" },
  { href: "/reportes/cuentas-por-cobrar", label: "Cuentas por Cobrar" },
  { href: "/reportes/estado-resultados", label: "Estado de Resultados" },
];

export function SeccionesReportes() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1 print:hidden">
      {SECCIONES.map((s) => {
        const activo = s.href === "/reportes" ? pathname === "/reportes" : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activo
                ? "bg-primary text-white"
                : "text-text-dim hover:bg-surface-hover hover:text-text"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
