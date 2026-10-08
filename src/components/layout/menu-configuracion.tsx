"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/cn";
import { SECCIONES_CONFIGURACION } from "@/components/configuracion/secciones";

/** Engranaje de la barra superior: desplegable con las secciones de Configuración (solo admin). */
export function MenuConfiguracion() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activa = pathname === "/configuracion" || pathname?.startsWith("/configuracion/");

  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Configuración"
        aria-label="Configuración"
        className={
          activa || abierto
            ? "flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-primary-soft bg-primary-soft/15 text-primary-soft"
            : "flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.04] text-white hover:text-white"
        }
      >
        <Settings className="h-4 w-4" />
      </button>

      {abierto && (
        <div
          role="menu"
          className="bg-topbar absolute right-0 top-[calc(100%+6px)] z-[60] min-w-[260px] rounded-xl border border-white/10 p-1.5 shadow-xl"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">Configuración</p>
          {SECCIONES_CONFIGURACION.map(({ label, href, icon: Icon, descripcion }) => {
            const actual = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                role="menuitem"
                aria-current={actual ? "page" : undefined}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors",
                  actual ? "bg-primary-soft/[0.16] text-white" : "text-white hover:bg-white/[0.06]"
                )}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>
                  <span className="block text-[13px]">{label}</span>
                  <span className="block text-[11px] text-white/55">{descripcion}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
