"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { SECCIONES_CONFIGURACION } from "./secciones";

/** Pestañas de Configuración (Negocio, Usuarios, Facturación electrónica). */
export function TabsConfiguracion() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-white p-1" aria-label="Secciones de configuración">
      {SECCIONES_CONFIGURACION.map(({ label, href, icon: Icon }) => {
        const activa = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              activa ? "bg-primary text-white" : "text-text-dim hover:bg-surface-hover hover:text-text"
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
