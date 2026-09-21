"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Receipt,
  PackagePlus,
  FlaskConical,
  Users,
  Wallet,
  Droplets,
  TrendingUp,
  Eye,
  EyeOff,
  Zap,
  Package,
  Tag,
} from "lucide-react";
import { TodasCuentasModal } from "@/components/dashboard/todas-cuentas-modal";
import { ModalConsultarPrecio } from "@/components/ventas/modal-consultar-precio";
import { formatCurrency } from "@/lib/currency";

interface CuentaPrincipal {
  id: number;
  nombre: string;
  tipo: string;
  saldoActual: number;
  color?: string | null;
}

interface Movimiento {
  id: number;
  hora: string;
  descripcion: string;
  monto: number;
  moneda: "ARS" | "USD";
  tipo: "ingreso" | "egreso";
  ventaId: number | null;
}

interface DashboardData {
  cuentas: {
    saldoTotal: number;
    principales: CuentaPrincipal[];
    totalCantidad: number;
  };
  hoy: {
    gananciaARS: number;
    cantidadVentas: number;
    ingresosARS: number;
    egresosARS: number;
  };
  pedidos: { porArmar: number; armados: number };
  movimientos: Movimiento[];
}

const ACCESOS_RAPIDOS = [
  { label: "Ventas", href: "/ventas", icon: Receipt },
  { label: "Compras", href: "/compras", icon: PackagePlus },
  { label: "Productos", href: "/productos", icon: FlaskConical },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Gastos", href: "/finanzas/gastos", icon: Wallet },
  { label: "Reportes", href: "/reportes", icon: Droplets },
];

const OCULTO = "••••••";

export default function DashboardPage() {
  const [datos, setDatos] = useState<DashboardData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modalCuentasAbierto, setModalCuentasAbierto] = useState(false);
  const [modalPrecioAbierto, setModalPrecioAbierto] = useState(false);
  const [mostrarSaldos, setMostrarSaldos] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
    } catch {
      toast.error("No se pudo cargar el panorama general");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setModalPrecioAbierto(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text-dim transition-colors hover:border-primary/50 hover:bg-surface-hover hover:text-text"
        >
          <Tag size={14} /> Consultar precio
        </button>
        <Link
          href="/ventas"
          className="bg-grad cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5"
        >
          + Nueva Venta
        </Link>
      </div>

      {/* Saldo total + Hoy */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Saldo total */}
        <div className="cta-glow bg-topbar relative overflow-hidden rounded-2xl p-6 text-ivory">
          {/* Parte de arriba: label + ojito + monto -> va a /finanzas */}
          <Link
            href="/finanzas"
            className="relative block -m-1 rounded-xl p-1 transition-opacity hover:opacity-95"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white">
                  Saldo Total
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMostrarSaldos((prev) => !prev);
                  }}
                  className="cursor-pointer rounded p-0.5 text-white hover:text-white"
                  title={mostrarSaldos ? "Ocultar saldos" : "Mostrar saldos"}
                >
                  {mostrarSaldos ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            </div>

            {/* NÚMERO GRANDE EN BLANCO */}
            <p className="mt-1.5 font-display text-4xl font-bold tracking-[-0.025em] text-white">
              {cargando
                ? "..."
                : mostrarSaldos
                  ? formatCurrency(datos?.cuentas.saldoTotal ?? 0, "ARS")
                  : OCULTO}
            </p>
          </Link>

          {/* Parte de abajo: grid de cuentas (no clickeable) + "Ver todas" -> abre el modal */}
          <div className="relative">
            {!cargando && datos && datos.cuentas.principales.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-5">
                {datos.cuentas.principales.slice(0, 5).map((c) => (
                  <div key={c.id} className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-white">
                      {c.color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                      )}
                      {c.nombre}
                    </p>
                    <p className="truncate text-sm font-semibold text-white">
                      {mostrarSaldos
                        ? formatCurrency(c.saldoActual, c.tipo.endsWith("USD") ? "USD" : "ARS")
                        : OCULTO}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setModalCuentasAbierto(true)}
              className="mt-4 cursor-pointer text-xs font-medium text-primary-soft hover:underline"
            >
              Ver todas ({datos?.cuentas.totalCantidad ?? 0}) →
            </button>
          </div>
        </div>

        {/* Hoy */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-dim">Hoy</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success">
              <TrendingUp size={14} />
            </span>
          </div>
          <p className="mt-1.5 font-display text-4xl font-bold tracking-[-0.025em] text-text">
            {cargando ? "..." : formatCurrency(datos?.hoy.ingresosARS ?? 0, "ARS")}
          </p>
          <div className="mt-6 flex items-center gap-10 border-t border-border pt-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim">
                Ganancia
              </p>
              <p className="text-lg font-semibold text-success">
                {cargando ? "..." : formatCurrency(datos?.hoy.gananciaARS ?? 0, "ARS")}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-dim">
                Ventas
              </p>
              <p className="text-lg font-semibold text-text">
                {cargando ? "..." : datos?.hoy.cantidadVentas ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ACCESOS_RAPIDOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center text-sm font-medium text-text-dim transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <a.icon size={20} />
            {a.label}
          </Link>
        ))}
      </div>

      {/* Movimientos de hoy + Pedidos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Movimientos de hoy */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-primary" />
              <h2 className="font-medium text-text">Movimientos de hoy</h2>
              {!!datos?.movimientos.length && (
                <span className="bg-grad flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold text-[#050507]">
                  {datos.movimientos.length}
                </span>
              )}
            </div>
            <Link
              href="/finanzas/flujo-caja"
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver todo →
            </Link>
          </div>

          <div className="mt-4 flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs text-text-dim">Ingresos</p>
              <p className="font-semibold text-success">
                +{formatCurrency(datos?.hoy.ingresosARS ?? 0, "ARS")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-dim">Egresos</p>
              <p className="font-semibold text-danger">
                -{formatCurrency(datos?.hoy.egresosARS ?? 0, "ARS")}
              </p>
            </div>
          </div>

          <div className="mt-1 divide-y divide-border">
            {(datos?.movimientos ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    m.tipo === "ingreso" ? "bg-success" : "bg-danger"
                  }`}
                />
                <span className="w-16 shrink-0 font-mono text-xs text-text-dim">{m.hora}</span>
                <span className="flex-1 truncate text-sm text-text">{m.descripcion}</span>
                <span
                  className={`text-sm font-semibold ${
                    m.tipo === "ingreso" ? "text-success" : "text-danger"
                  }`}
                >
                  {m.tipo === "ingreso" ? "+" : "-"}
                  {formatCurrency(m.monto, m.moneda)}
                </span>
              </div>
            ))}
            {!cargando && !datos?.movimientos.length && (
              <p className="py-4 text-center text-sm text-text-dim">Sin movimientos hoy</p>
            )}
          </div>
        </div>

        {/* Pedidos */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-warning" />
              <h2 className="font-medium text-text">Pedidos</h2>
            </div>
            <Link
              href="/ventas/pedidos"
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver todos →
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {!!datos?.pedidos.porArmar && (
              <div className="flex items-center justify-between rounded-lg bg-warning/10 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium text-text">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  Por armar
                </span>
                <span className="rounded-full bg-warning px-2.5 py-0.5 text-xs font-semibold text-white">
                  {datos.pedidos.porArmar}
                </span>
              </div>
            )}
            {!!datos?.pedidos.armados && (
              <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium text-text">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Armados
                </span>
                <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-white">
                  {datos.pedidos.armados}
                </span>
              </div>
            )}
            {!cargando && !datos?.pedidos.porArmar && !datos?.pedidos.armados && (
              <p className="py-4 text-center text-sm text-text-dim">Sin pedidos pendientes</p>
            )}
          </div>
        </div>
      </div>

      <TodasCuentasModal
        isOpen={modalCuentasAbierto}
        onClose={() => setModalCuentasAbierto(false)}
        saldoTotal={datos?.cuentas.saldoTotal ?? 0}
      />
      {modalPrecioAbierto && <ModalConsultarPrecio onClose={() => setModalPrecioAbierto(false)} />}
    </div>
  );
}