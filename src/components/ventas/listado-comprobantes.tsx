"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { listarComprobantes, type FilaComprobante } from "@/app/(dashboard)/ventas/facturacion-actions";

/**
 * Comprobantes electrónicos emitidos (facturas y notas de crédito), por
 * período. Las notas de crédito restan. Exporta CSV para el contador.
 */

const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const inicioMes = () => `${hoyAR().slice(0, 8)}01`;
const pesos = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(v);

const ESTADO: Record<FilaComprobante["estado"], { texto: string; clase: string }> = {
  AUTORIZADO: { texto: "Autorizado", clase: "bg-success/10 text-success" },
  PENDIENTE: { texto: "Pendiente", clase: "bg-warning/10 text-warning" },
  RECHAZADO: { texto: "Rechazado", clase: "bg-danger/10 text-danger" },
};

function csv(filas: FilaComprobante[]) {
  const cab = ["Fecha", "Comprobante", "Número", "Receptor", "Documento", "Neto", "IVA", "Total", "CAE", "Estado", "Venta"];
  const celda = (v: string | number | null) => {
    const t = v == null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = filas.map((f) =>
    [new Date(f.fecha).toLocaleDateString("es-AR"), f.nombre, f.numero, f.receptor, f.documento, f.neto, f.iva, f.total, f.cae, ESTADO[f.estado].texto, f.ventaId]
      .map(celda)
      .join(";")
  );
  // ";" y BOM para que Excel en español lo abra bien
  return "\uFEFF" + [cab.join(";"), ...lineas].join("\n");
}

export function ListadoComprobantes({ entornoInicial, habilitada }: { entornoInicial: "HOMOLOGACION" | "PRODUCCION"; habilitada: boolean }) {
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyAR());
  const [entorno, setEntorno] = useState(entornoInicial);
  const [filas, setFilas] = useState<FilaComprobante[] | null>(null);
  const [cargando, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => setFilas(await listarComprobantes({ desde, hasta, entorno })));
  }, [desde, hasta, entorno]);

  const autorizados = (filas ?? []).filter((f) => f.estado === "AUTORIZADO");
  const total = (k: "neto" | "iva" | "total") => autorizados.reduce((a, f) => a + f[k], 0);

  function exportar() {
    if (!filas) return;
    const url = URL.createObjectURL(new Blob([csv(filas)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprobantes-${desde}-a-${hasta}${entorno === "HOMOLOGACION" ? "-PRUEBA" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">Comprobantes electrónicos</h1>
          <p className="text-sm text-text-dim">Facturas y notas de crédito emitidas ante ARCA. Las notas de crédito restan.</p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={!filas || filas.length === 0}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      {!habilitada && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-text-dim">
          La facturación electrónica no está activada. Se configura en Configuración → Facturación electrónica.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white p-3">
        <label className="text-sm text-text-dim">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-lg border border-border px-3 py-2 text-sm text-text" />
        </label>
        <label className="text-sm text-text-dim">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-lg border border-border px-3 py-2 text-sm text-text" />
        </label>
        <div className="inline-flex rounded-lg border border-border p-1 text-sm">
          {(["PRODUCCION", "HOMOLOGACION"] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEntorno(e)}
              className={cn("rounded-md px-3 py-1.5", entorno === e ? "bg-primary text-white" : "text-text-dim hover:text-text")}
            >
              {e === "PRODUCCION" ? "Reales" : "De prueba"}
            </button>
          ))}
        </div>
        {cargando && <Loader2 className="mb-2 h-4 w-4 animate-spin text-text-dim" />}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-topbar text-left text-[11px] font-bold uppercase tracking-wider text-white">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Comprobante</th>
              <th className="px-4 py-3">Receptor</th>
              <th className="px-4 py-3 text-right">Neto</th>
              <th className="px-4 py-3 text-right">IVA</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">CAE</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas && filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-text-dim">
                  No hay comprobantes en este período.
                </td>
              </tr>
            )}
            {(filas ?? []).map((f) => (
              <tr key={f.id} className="border-t border-border align-top">
                <td className="px-4 py-3 text-text-dim">{new Date(f.fecha).toLocaleDateString("es-AR")}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-text">{f.nombre}</p>
                  <p className="font-mono text-xs text-text-dim">
                    {f.numero ?? "Sin número"}
                    {f.ventaId && (
                      <>
                        {" · "}
                        <Link href="/ventas/historial" className="hover:text-primary hover:underline">
                          venta #{f.ventaId}
                        </Link>
                      </>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-text">{f.receptor}</p>
                  <p className="text-xs text-text-dim">{f.documento}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{pesos(f.neto)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{pesos(f.iva)}</td>
                <td className={cn("px-4 py-3 text-right font-mono font-medium tabular-nums", f.total < 0 ? "text-danger" : "text-text")}>{pesos(f.total)}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-dim">{f.cae ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ESTADO[f.estado].clase)} title={f.error ?? undefined}>
                    {ESTADO[f.estado].texto}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {autorizados.length > 0 && (
            <tfoot className="border-t-2 border-border bg-surface font-medium">
              <tr>
                <td className="px-4 py-3 text-text" colSpan={3}>
                  Total autorizado ({autorizados.length} comprobante{autorizados.length === 1 ? "" : "s"})
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{pesos(total("neto"))}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{pesos(total("iva"))}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{pesos(total("total"))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
