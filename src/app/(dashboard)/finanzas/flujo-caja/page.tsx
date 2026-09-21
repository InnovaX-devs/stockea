"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { TarjetasResumenFlujo } from "@/components/finanzas/tarjetas-resumen-flujo";
import { FiltrosFlujoCaja, type FiltrosFlujo } from "@/components/finanzas/filtros-flujo-caja";
import { TablaMovimientos } from "@/components/finanzas/tabla-movimientos";
import type { CuentaDTO } from "@/types/cuenta";
import type { MovimientoCajaDTO } from "@/types/movimiento-caja";
import { fechaISOAR } from "@/lib/timezone";

const hoy = fechaISOAR();

const [anio, mes] = hoy.split("-");

const FILTROS_INICIALES: FiltrosFlujo = {
  periodoRapido: "MES",

  desde: `${anio}-${mes}-01`,

  hasta: hoy,

  tipo: "",
  cuentaId: "",
  concepto: "",
};

export default function FlujoCajaPage() {
  const [cuentas, setCuentas] = useState<CuentaDTO[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoCajaDTO[]>([]);
  const [resumen, setResumen] = useState({
    saldoTotal: 0,
    totalEfectivo: 0,
    totalTransferencia: 0,
    ingresosPeriodo: 0,
    egresosPeriodo: 0,
    netoPeriodo: 0,
  });
  const [filtros, setFiltros] = useState<FiltrosFlujo>(FILTROS_INICIALES);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch("/api/cuentas")
      .then((res) => res.json())
      .then((data) => setCuentas(data.items ?? []))
      .catch(() => toast.error("No se pudieron cargar las cuentas"));
  }, []);

  const cargarMovimientos = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtros.desde) params.set("desde", filtros.desde);
      if (filtros.hasta) params.set("hasta", filtros.hasta);
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      if (filtros.cuentaId) params.set("cuentaId", filtros.cuentaId);
      if (filtros.concepto) params.set("concepto", filtros.concepto);

      const res = await fetch(`/api/movimientos-caja?${params.toString()}`);
      const data = await res.json();
      setMovimientos(data.items ?? []);
      setResumen(data.resumen);
    } catch {
      toast.error("No se pudieron cargar los movimientos");
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    cargarMovimientos();
  }, [cargarMovimientos]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Flujo de Caja</h1>
        <p className="text-sm text-text-dim">Historial de movimientos de dinero</p>
      </div>

      <TarjetasResumenFlujo resumen={resumen} />

      <div className="rounded-2xl border border-border bg-white p-4">
        <FiltrosFlujoCaja filtros={filtros} onChange={setFiltros} cuentas={cuentas} />
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-text-dim">
          Cargando...
        </div>
      ) : (
        <TablaMovimientos movimientos={movimientos} />
      )}
    </div>
  );
}