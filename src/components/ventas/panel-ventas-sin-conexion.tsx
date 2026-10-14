"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useEstadoConexion } from "@/lib/offline/estado-conexion";
import type { VentaLocal } from "@/lib/offline/db";
import { descartarVenta, observarVentasLocales, reintentarVenta } from "@/lib/offline/cola-ventas";

const MAX_VISIBLES = 6;

function hora(ms: number) {
  return new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Ventas hechas en este equipo sin conexión (issue #41). Cada una se muestra
 * como "Pendiente" hasta que el servidor le da su número (la numeración es por
 * empresa y la lleva el servidor); si el servidor la rechaza, queda con el
 * motivo y se puede reintentar o descartar. Sin ventas en la cola no aparece.
 */
export function PanelVentasSinConexion() {
  const [ventas, setVentas] = useState<VentaLocal[]>([]);
  const [verTodas, setVerTodas] = useState(false);
  const { enLinea } = useEstadoConexion();

  useEffect(() => observarVentasLocales((todas) => setVentas(todas.filter((v) => v.estado !== "sincronizada"))), []);

  if (ventas.length === 0) return null;

  const visibles = verTodas ? ventas : ventas.slice(0, MAX_VISIBLES);
  const pendientes = ventas.filter((v) => v.estado === "pendiente").length;

  async function reintentar(id: number) {
    if (!navigator.onLine) return void toast.error("Sin conexión: se va a reintentar sola cuando vuelva internet.");
    await reintentarVenta(id);
  }

  async function descartar(v: VentaLocal) {
    if (!window.confirm("¿Descartar esta venta? No se va a guardar en el sistema y no se puede deshacer.")) return;
    await descartarVenta(v.id!);
    toast.success("Venta descartada");
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Ventas hechas en este equipo</h2>
        {pendientes > 0 && (
          <span className="text-xs text-text-dim">
            {enLinea
              ? `Subiendo ${pendientes === 1 ? "1 venta" : `${pendientes} ventas`}…`
              : `${pendientes === 1 ? "1 venta se subirá" : `${pendientes} ventas se subirán`} al volver la conexión`}
          </span>
        )}
      </div>

      <ul className="mt-3 divide-y divide-border">
        {visibles.map((v) => (
          <li key={v.idCliente} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex w-28 shrink-0 items-center gap-1.5 text-sm font-medium">
              {v.estado === "sincronizada" ? (
                <>
                  <CheckCircle2 size={15} className="text-success" />
                  <span className="text-text">#{v.numero}</span>
                </>
              ) : v.estado === "error" ? (
                <>
                  <TriangleAlert size={15} className="text-danger" />
                  <span className="text-danger">Con error</span>
                </>
              ) : (
                <>
                  <Clock size={15} className="text-warning" />
                  <span className="text-warning">Pendiente</span>
                </>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">
                {v.clienteNombre ? `${v.clienteNombre} · ` : ""}
                {v.resumen}
              </p>
              <p className="text-xs text-text-dim">
                {hora(v.creadaEn)}
                {v.stockNegativo && v.productosStockNegativo?.length ? (
                  <span className="ml-2 text-warning">Dejó stock negativo: {v.productosStockNegativo.join(", ")}</span>
                ) : null}
              </p>
              {v.estado === "error" && v.error && <p className="mt-0.5 text-xs text-danger">{v.error}</p>}
            </div>

            <span className="shrink-0 text-sm font-semibold text-text">{formatCurrency(v.totalARS, "ARS")}</span>

            {v.estado === "error" && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => reintentar(v.id!)}
                  className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-hover"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => descartar(v)}
                  className="cursor-pointer rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                >
                  Descartar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {ventas.length > MAX_VISIBLES && (
        <button
          type="button"
          onClick={() => setVerTodas((x) => !x)}
          className="mt-2 cursor-pointer text-xs font-medium text-primary hover:underline"
        >
          {verTodas ? "Ver menos" : `Ver las ${ventas.length}`}
        </button>
      )}
    </div>
  );
}
