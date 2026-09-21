"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { CuentaFormModal } from "@/components/finanzas/cuenta-form-modal";
import { TotalesCuentas } from "@/components/finanzas/totales-cuentas";
import { FiltrosCuentas, type FiltroCategoria, type FiltroMoneda } from "@/components/finanzas/filtros-cuentas";
import { BarraLimiteMensual } from "@/components/finanzas/barra-limite-mensual";
import { ResumenPorTipo } from "@/components/finanzas/resumen-por-tipo";
import type { CuentaDTO } from "@/types/cuenta";
import { formatCurrency } from "@/lib/currency";
import { Pencil, Ban, Trash2, DollarSign, ArrowLeftRight, Plus, CheckCircle2 } from "lucide-react";
import { AjustarSaldoModal } from "@/components/finanzas/ajustar-saldo-modal";
import { TransferenciaModal } from "@/components/finanzas/transferencia-modal";

const ETIQUETAS_TIPO: Record<string, string> = {
  EFECTIVO_ARS: "Efectivo ARS",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Banco ARS",
  BANCO_USD: "Banco USD",
};

export default function FinanzasPage() {
  const [cuentas, setCuentas] = useState<CuentaDTO[]>([]);
  const [cotizacionUSD, setCotizacionUSD] = useState(0);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cuentaEditar, setCuentaEditar] = useState<CuentaDTO | null>(null);
  const [modalTransferenciaAbierto, setModalTransferenciaAbierto] = useState(false);
  const [cuentaAjustar, setCuentaAjustar] = useState<CuentaDTO | null>(null);
  const [modalAjusteAbierto, setModalAjusteAbierto] = useState(false);

  function abrirAjuste(cuenta: CuentaDTO) {
    setCuentaAjustar(cuenta);
    setModalAjusteAbierto(true);
  }

  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>("TODAS");
  const [filtroMoneda, setFiltroMoneda] = useState<FiltroMoneda>("ARS_USD");

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [resCuentas, resConfig] = await Promise.all([
        fetch("/api/cuentas?incluirInactivas=true"),
        fetch("/api/configuracion"),
      ]);
      const dataCuentas = await resCuentas.json();
      const dataConfig = await resConfig.json();
      setCuentas(dataCuentas.items ?? []);
      setCotizacionUSD(dataConfig.cotizacionUSD ?? 0);
      setUsaCotizacionUSD(dataConfig.usaCotizacionUSD ?? false);
    } catch {
      toast.error("No se pudieron cargar las cuentas");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const cuentasFiltradas = useMemo(() => {
    return cuentas.filter((c) => {
      if (filtroCategoria === "BANCO" && !c.tipo.startsWith("BANCO")) return false;
      if (filtroCategoria === "EFECTIVO" && !c.tipo.startsWith("EFECTIVO")) return false;
      if (filtroMoneda === "ARS" && !c.tipo.endsWith("ARS")) return false;
      if (filtroMoneda === "USD" && !c.tipo.endsWith("USD")) return false;
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const matchNombre = c.nombre.toLowerCase().includes(q);
        const matchAlias = c.alias?.toLowerCase().includes(q) ?? false;
        const matchBanco = c.banco?.toLowerCase().includes(q) ?? false;
        if (!matchNombre && !matchAlias && !matchBanco) return false;
      }
      return true;
    });
  }, [cuentas, filtroCategoria, filtroMoneda, busqueda]);

  function abrirNueva() {
    setCuentaEditar(null);
    setModalAbierto(true);
  }

  function abrirEditar(cuenta: CuentaDTO) {
    setCuentaEditar(cuenta);
    setModalAbierto(true);
  }

  async function toggleActiva(cuenta: CuentaDTO) {
    try {
      const res = await fetch(`/api/cuentas/${cuenta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !cuenta.activa }),
      });
      if (!res.ok) throw new Error();
      toast.success(cuenta.activa ? "Cuenta desactivada" : "Cuenta reactivada");
      cargarDatos();
    } catch {
      toast.error("No se pudo cambiar el estado de la cuenta");
    }
  }

  async function eliminar(cuenta: CuentaDTO) {
    if (!confirm(`¿Eliminar la cuenta "${cuenta.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/cuentas/${cuenta.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "No se pudo eliminar la cuenta");
        return;
      }
      toast.success("Cuenta eliminada");
      cargarDatos();
    } catch {
      toast.error("No se pudo eliminar la cuenta");
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">Cuentas financieras</h1>
          <p className="text-sm text-text-dim">{cuentas.length} cuentas configuradas</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={() => setModalTransferenciaAbierto(true)}
            className="flex items-center justify-center cursor-pointer gap-1.5 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
          >
            <ArrowLeftRight size={16} /> Transferir
          </button>
          <button
            onClick={abrirNueva}
            className="flex items-center justify-center cursor-pointer gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> Nueva cuenta
          </button>
        </div>
      </div>

      <TotalesCuentas cuentas={cuentas} cotizacionUSD={cotizacionUSD} usaCotizacionUSD={usaCotizacionUSD} />

      <FiltrosCuentas
        categoria={filtroCategoria}
        moneda={filtroMoneda}
        onCategoriaChange={setFiltroCategoria}
        onMonedaChange={setFiltroMoneda}
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        usaCotizacionUSD={usaCotizacionUSD}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {/* Desktop / tablet: tabla */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-topbar">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Alias</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-dim">Cargando...</td>
                </tr>
              )}
              {!cargando && cuentasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                    No hay cuentas que coincidan con los filtros.
                  </td>
                </tr>
              )}
              {cuentasFiltradas.map((cuenta) => (
                <tr key={cuenta.id} className={`border-t border-border ${!cuenta.activa ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: cuenta.color ?? "#94a3b8" }}
                      />
                      <span className="font-medium text-text">{cuenta.nombre}</span>
                      {cuenta.favorita && <span className="text-xs text-[#eab308]">★</span>}
                    </div>
                    {cuenta.limiteMensualIngresos != null && (
                      <BarraLimiteMensual
                        saldoActual={cuenta.saldoActual}
                        limite={cuenta.limiteMensualIngresos}
                        tipo={cuenta.tipo}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-dim">{ETIQUETAS_TIPO[cuenta.tipo]}</td>
                  <td className="px-4 py-3 text-text-dim">{cuenta.alias || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-text">
                    {formatCurrency(cuenta.saldoActual, cuenta.tipo.endsWith("USD") ? "USD" : "ARS")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        cuenta.activa ? "bg-surface-hover text-primary" : "bg-surface-hover text-text-dim"
                      }`}
                    >
                      {cuenta.activa ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => abrirAjuste(cuenta)}
                        className="rounded-lg p-1.5 text-text-dim hover:bg-surface-hover hover:text-text"
                        title="Ajustar saldo"
                      >
                        <DollarSign size={16} />
                      </button>
                      <button
                        onClick={() => abrirEditar(cuenta)}
                        className="rounded-lg p-1.5 text-text-dim hover:bg-surface-hover hover:text-text"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => toggleActiva(cuenta)}
                        className="rounded-lg p-1.5 text-text-dim hover:bg-surface-hover hover:text-text"
                        title={cuenta.activa ? "Desactivar" : "Reactivar"}
                      >
                        {cuenta.activa ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                      </button>
                      <button
                        onClick={() => eliminar(cuenta)}
                        className="rounded-lg p-1.5 text-text-dim hover:bg-danger/10 hover:text-danger"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: tarjetas */}
        <div className="divide-y divide-border md:hidden">
          {cargando && (
            <div className="px-4 py-8 text-center text-sm text-text-dim">Cargando...</div>
          )}
          {!cargando && cuentasFiltradas.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-dim">
              No hay cuentas que coincidan con los filtros.
            </div>
          )}
          {cuentasFiltradas.map((cuenta) => (
            <div key={cuenta.id} className={`p-3 ${!cuenta.activa ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: cuenta.color ?? "#94a3b8" }}
                    />
                    <span className="truncate font-medium text-text">{cuenta.nombre}</span>
                    {cuenta.favorita && <span className="text-xs text-[#eab308]">★</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-dim">
                    {ETIQUETAS_TIPO[cuenta.tipo]}
                    {cuenta.alias ? ` · ${cuenta.alias}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    cuenta.activa ? "bg-surface-hover text-primary" : "bg-surface-hover text-text-dim"
                  }`}
                >
                  {cuenta.activa ? "Activa" : "Inactiva"}
                </span>
              </div>

              <p className="mt-2 text-right font-mono text-lg font-semibold text-text">
                {formatCurrency(cuenta.saldoActual, cuenta.tipo.endsWith("USD") ? "USD" : "ARS")}
              </p>

              {cuenta.limiteMensualIngresos != null && (
                <div className="mt-1">
                  <BarraLimiteMensual
                    saldoActual={cuenta.saldoActual}
                    limite={cuenta.limiteMensualIngresos}
                    tipo={cuenta.tipo}
                  />
                </div>
              )}

              <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-2">
                <button
                  onClick={() => abrirAjuste(cuenta)}
                  className="rounded-lg p-2 text-text-dim hover:bg-surface-hover hover:text-text"
                  title="Ajustar saldo"
                >
                  <DollarSign size={16} />
                </button>
                <button
                  onClick={() => abrirEditar(cuenta)}
                  className="rounded-lg p-2 text-text-dim hover:bg-surface-hover hover:text-text"
                  title="Editar"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => toggleActiva(cuenta)}
                  className="rounded-lg p-2 text-text-dim hover:bg-surface-hover hover:text-text"
                  title={cuenta.activa ? "Desactivar" : "Reactivar"}
                >
                  {cuenta.activa ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                </button>
                <button
                  onClick={() => eliminar(cuenta)}
                  className="rounded-lg p-2 text-text-dim hover:bg-danger/10 hover:text-danger"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ResumenPorTipo cuentas={cuentas} />

      <CuentaFormModal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        cuentaEditar={cuentaEditar}
        onSuccess={cargarDatos}
        usaCotizacionUSD={usaCotizacionUSD}
      />
      <TransferenciaModal
        isOpen={modalTransferenciaAbierto}
        onClose={() => setModalTransferenciaAbierto(false)}
        cuentas={cuentas}
        onSuccess={cargarDatos}
      />

      <AjustarSaldoModal
        isOpen={modalAjusteAbierto}
        onClose={() => setModalAjusteAbierto(false)}
        cuenta={cuentaAjustar}
        onSuccess={cargarDatos}
      />
    </div>
  );
}