"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Check, X as XIcon, Settings, House, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, esGrupo, type NavGroup } from "@/lib/nav-items";
import { LogoutButton } from "@/components/layout/logout-button";
import { actualizarCotizacionRapida } from "@/app/(dashboard)/configuracion/actions";

// Clases compartidas por los ítems de nav, pensadas para la topbar oscura
// (antes vivían en sidebar.tsx, sobre fondo también oscuro, así que se
// portan casi sin cambios).
const ITEM_BASE =
  "group relative flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors";
const ITEM_INACTIVO = "text-white/55 hover:bg-white/[0.06] hover:text-white";
const ITEM_ACTIVO = "bg-primary-soft/[0.16] text-white";

function grupoTieneRutaActiva(grupo: NavGroup, pathname: string) {
  return grupo.children.some(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
  );
}

function mejorMatchDeGrupo(grupo: NavGroup, pathname: string) {
  return grupo.children
    .filter((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

export function Topbar({
  logoUrl,
  nombreNegocio,
  eslogan,
  premium,
  cotizacionUSD,
  usaCotizacionUSD,
}: {
  logoUrl: string | null;
  nombreNegocio: string;
  eslogan?: string | null;
  premium: boolean;
  cotizacionUSD: number;
  usaCotizacionUSD: boolean;
}) {
  const pathname = usePathname();

  const navItems = NAV_ITEMS.filter((item) => esGrupo(item) || !item.premium || premium).map((item) =>
    esGrupo(item) ? { ...item, children: item.children.filter((c) => !c.premium || premium) } : item
  );

  // Grupo con el dropdown abierto (uno solo a la vez). Se cierra al navegar
  // o al hacer click afuera.
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setGrupoAbierto(null);
    setMenuMobileAbierto(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuMobileAbierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuMobileAbierto]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setGrupoAbierto(null);
      }
    }
    document.addEventListener("click", onClickFuera);
    return () => document.removeEventListener("click", onClickFuera);
  }, []);

  // --- Cotización USD (portado tal cual del topbar viejo) ---
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(cotizacionUSD));
  const [pendiente, startTransition] = useTransition();

  const configuracionActiva =
    pathname === "/configuracion" || pathname?.startsWith("/configuracion/");

  const cotizacionFormateada = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
  }).format(cotizacionUSD);

  function iniciarEdicion() {
    setValor(String(cotizacionUSD));
    setEditando(true);
  }

  function cancelar() {
    setValor(String(cotizacionUSD));
    setEditando(false);
  }

  function guardar() {
    const nueva = Number(valor);
    if (!nueva || Number.isNaN(nueva) || nueva <= 0) {
      toast.error("Ingresá una cotización válida");
      return;
    }
    if (nueva === cotizacionUSD) {
      setEditando(false);
      return;
    }

    startTransition(async () => {
      try {
        await actualizarCotizacionRapida(nueva);
        toast.success("Cotización actualizada");
        setEditando(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la cotización");
        setValor(String(cotizacionUSD));
      }
    });
  }

  return (
    <header className="bg-topbar sticky top-0 z-50 flex items-center gap-6 px-4 sm:px-7 h-[68px] shrink-0">
      {/* Logo */}
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-[9px] bg-grad">
          {logoUrl ? (
            <Image src={logoUrl} alt={`Logo ${nombreNegocio}`} width={32} height={32} className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-xs font-bold text-[#050507]">{iniciales(nombreNegocio)}</span>
          )}
        </div>
        <div className="hidden sm:block">
          <span className="font-display text-[15.5px] font-bold tracking-[-0.02em] text-white">{nombreNegocio}</span>
          {eslogan && (
            <p className="-mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{eslogan}</p>
          )}
        </div>
      </Link>

      {/* Nav horizontal — desktop */}
      <nav ref={navRef} className="hidden flex-1 items-center gap-1 md:flex" aria-label="Navegación principal">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(ITEM_BASE, pathname === "/" ? ITEM_ACTIVO : ITEM_INACTIVO)}
        >
          <House className="h-[15px] w-[15px]" strokeWidth={1.8} />
          Inicio
        </Link>

        {navItems.map((item) => {
          if (esGrupo(item)) {
            const Icon = item.icon;
            const abierto = grupoAbierto === item.label;
            const tieneActivo = grupoTieneRutaActiva(item, pathname);
            const activeHref = mejorMatchDeGrupo(item, pathname);

            return (
              <div key={item.label} className="relative">
                <button
                  type="button"
                  onClick={() => setGrupoAbierto(abierto ? null : item.label)}
                  className={cn(ITEM_BASE, "cursor-pointer", tieneActivo ? ITEM_ACTIVO : ITEM_INACTIVO)}
                >
                  <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  {item.label}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} strokeWidth={2} />
                </button>

                {abierto && (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-10 min-w-[200px] rounded-xl border border-white/10 bg-[#0B1710] p-1.5 shadow-xl">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = child.href === activeHref;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                            isActive ? "bg-primary-soft/[0.16] text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                          )}
                        >
                          <ChildIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(ITEM_BASE, isActive ? ITEM_ACTIVO : ITEM_INACTIVO)}
            >
              <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 md:hidden" />

      {/* Acciones a la derecha */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        {usaCotizacionUSD && (editando ? (
          <div className="hidden items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-1 sm:flex">
            <span className="text-xs text-white/50">USD</span>
            <span className="font-mono text-sm text-white">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={valor}
              disabled={pendiente}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") guardar();
                if (e.key === "Escape") cancelar();
              }}
              onBlur={guardar}
              className="w-20 bg-transparent font-mono text-sm font-medium text-white focus:outline-none"
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={guardar} disabled={pendiente} className="rounded p-0.5 text-success hover:bg-success/10 disabled:opacity-50" title="Guardar">
              <Check size={13} />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelar} disabled={pendiente} className="rounded p-0.5 text-danger hover:bg-danger/10 disabled:opacity-50" title="Cancelar">
              <XIcon size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={iniciarEdicion}
            className="hidden items-center cursor-pointer gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 transition-colors hover:border-primary-soft/50 sm:flex"
            title="Editar cotización"
          >
            <span className="text-xs text-white/50">USD</span>
            <span className="font-mono text-sm font-medium text-white">${cotizacionFormateada}</span>
          </button>
        ))}

        <Link
          href="/configuracion"
          className={
            configuracionActiva
              ? "flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-primary-soft bg-primary-soft/15 text-primary-soft"
              : "flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
          }
          title="Configuración"
          aria-label="Configuración"
          aria-current={configuracionActiva ? "page" : undefined}
        >
          <Settings className="h-4 w-4" />
        </Link>

        {/* En dark, LogoutButton necesita el variant claro — ver logout-button.tsx */}
        <LogoutButton variant="dark" />

        <button
          type="button"
          onClick={() => setMenuMobileAbierto((v) => !v)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-white/10 text-white/70 hover:bg-white/[0.06] md:hidden"
          aria-label="Abrir menú"
        >
          {menuMobileAbierto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav — mobile: drawer que entra desde la derecha, con backdrop.
          Se monta siempre (para poder animar la salida) y se controla
          con translate-x + opacity en vez de un simple `&&`. */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          menuMobileAbierto ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!menuMobileAbierto}
      >
        <div
          onClick={() => setMenuMobileAbierto(false)}
          className={cn(
            "absolute inset-0 bg-black/55 transition-opacity duration-200",
            menuMobileAbierto ? "opacity-100" : "opacity-0"
          )}
        />

        <div
          className={cn(
            "bg-topbar absolute right-0 top-0 bottom-0 flex w-[82vw] max-w-[320px] flex-col gap-1 overflow-y-auto p-4 shadow-2xl transition-transform duration-200 ease-out",
            menuMobileAbierto ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/40">Menú</span>
            <button
              type="button"
              onClick={() => setMenuMobileAbierto(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/[0.06] hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Link
            href="/"
            className={cn(ITEM_BASE, "!py-3.5 !text-[15px]", pathname === "/" ? ITEM_ACTIVO : ITEM_INACTIVO)}
          >
            <House className="h-[18px] w-[18px]" strokeWidth={1.8} /> Inicio
          </Link>
          {navItems.map((item) =>
            esGrupo(item) ? (
              <div key={item.label} className="pt-3">
                <p className="px-3.5 pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-white/35">{item.label}</p>
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  const isActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(ITEM_BASE, "!py-3.5 !text-[15px]", isActive ? ITEM_ACTIVO : ITEM_INACTIVO)}
                    >
                      <ChildIcon className="h-[18px] w-[18px]" strokeWidth={1.75} /> {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(ITEM_BASE, "!py-3.5 !text-[15px]", pathname === item.href ? ITEM_ACTIVO : ITEM_INACTIVO)}
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} /> {item.label}
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}