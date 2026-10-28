"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/currency";
import { confirmar } from "@/components/ui/dialogos";
import { ETIQUETA_ESTADO_PROMOCION, detallePromocion, type EstadoPromocion } from "@/lib/promociones-comun";
import type { PromocionDTO } from "@/lib/promociones";
import { PromocionFormModal } from "./promocion-form-modal";

/** Sección Promociones (#114): listado, alta, edición, pausa y baja. */

const COLOR_ESTADO: Record<EstadoPromocion, string> = {
  ACTIVA: "bg-success/10 text-success",
  PAUSADA: "bg-surface-hover text-text-dim",
  VENCIDA: "bg-danger/10 text-danger",
  PROGRAMADA: "bg-primary/10 text-primary",
};

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
};

function textoVigencia(p: PromocionDTO): string | null {
  if (p.vigenciaDesde && p.vigenciaHasta) return `Del ${fechaCorta(p.vigenciaDesde)} al ${fechaCorta(p.vigenciaHasta)}`;
  if (p.vigenciaDesde) return `Desde el ${fechaCorta(p.vigenciaDesde)}`;
  if (p.vigenciaHasta) return `Hasta el ${fechaCorta(p.vigenciaHasta)}`;
  return null;
}

/** Trae el listado; null (con aviso) si falla. */
async function pedirPromociones(): Promise<PromocionDTO[] | null> {
  try {
    const res = await fetch("/api/promociones", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error);
    return data.items as PromocionDTO[];
  } catch (e) {
    toast.error(e instanceof Error && e.message ? e.message : "No se pudieron cargar las promociones.");
    return null;
  }
}

export function PromocionesAdmin() {
  const [promos, setPromos] = useState<PromocionDTO[] | null>(null);
  const [editando, setEditando] = useState<PromocionDTO | "nueva" | null>(null);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  const cargar = useCallback(
    () =>
      pedirPromociones().then((items) => {
        if (items) setPromos(items);
        else setPromos((prev) => prev ?? []);
      }),
    []
  );

  useEffect(() => {
    let vigente = true;
    pedirPromociones().then((items) => vigente && setPromos(items ?? []));
    return () => {
      vigente = false;
    };
  }, []);

  async function pausar(p: PromocionDTO) {
    setProcesandoId(p.id);
    try {
      const res = await fetch(`/api/promociones/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !p.activo }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      toast.success(p.activo ? "Promoción pausada" : "Promoción activada");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo actualizar la promoción.");
    } finally {
      setProcesandoId(null);
    }
  }

  async function eliminar(p: PromocionDTO) {
    const ok = await confirmar(`¿Eliminar "${p.nombre}"? Si ya se vendió, queda pausada para no perder el historial.`, {
      titulo: "Eliminar promoción",
      confirmar: "Eliminar",
    });
    if (!ok) return;
    setProcesandoId(p.id);
    try {
      const res = await fetch(`/api/promociones/${p.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      toast.success(data?.resultado === "desactivada" ? "La promoción ya tenía ventas: quedó pausada" : "Promoción eliminada");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo eliminar la promoción.");
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <div className="space-y-5 p-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">Promociones</h1>
          <p className="text-sm text-text-dim">Combos que al venderse descuentan el stock de cada producto que incluyen</p>
        </div>
        <button
          type="button"
          onClick={() => setEditando("nueva")}
          className="bg-grad inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5"
        >
          + Nueva promoción
        </button>
      </div>

      {promos === null ? (
        <div className="flex justify-center py-16 text-text-dim">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : promos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-14 text-center">
          <Gift className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-3 text-base font-semibold text-text">Todavía no hay promociones</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-dim">
            Creá una promo, como &quot;Fernet + 2 Coca&quot;, elegí qué productos incluye y su precio. Al venderla se descuenta el
            stock de cada uno.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_110px_120px_minmax(0,1fr)_96px] gap-4 border-b border-border bg-surface-hover px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-dim lg:grid">
            <span>Promoción</span>
            <span className="text-right">Precio</span>
            <span className="text-center">Se pueden armar</span>
            <span>Vigencia y estado</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {promos.map((p) => {
              const vigencia = textoVigencia(p);
              const procesando = procesandoId === p.id;
              return (
                <li
                  key={p.id}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,2.2fr)_110px_120px_minmax(0,1fr)_96px] lg:items-center lg:gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-text">{p.nombre}</p>
                    <p className="text-xs text-text-dim">{detallePromocion(p.componentes)}</p>
                    {p.codigoBarras && <p className="text-xs text-text-dim">Código: {p.codigoBarras}</p>}
                  </div>
                  <div className="flex items-baseline justify-between lg:block lg:text-right">
                    <span className="text-xs text-text-dim lg:hidden">Precio</span>
                    <span>
                      <span className="block font-semibold text-text">{formatCurrency(p.precio, "ARS")}</span>
                      {p.precioSeparado > p.precio && (
                        <span className="block text-xs text-text-dim">
                          <s>{formatCurrency(p.precioSeparado, "ARS")}</s>
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between lg:block lg:text-center">
                    <span className="text-xs text-text-dim lg:hidden">Se pueden armar</span>
                    <span className={cn("font-semibold", p.sePuedenArmar === 0 ? "text-danger" : "text-text")}>{p.sePuedenArmar}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", COLOR_ESTADO[p.estado])}>
                      {ETIQUETA_ESTADO_PROMOCION[p.estado]}
                    </span>
                    {vigencia && <span className="text-xs text-text-dim">{vigencia}</span>}
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      disabled={procesando}
                      title="Editar"
                      aria-label={`Editar ${p.nombre}`}
                      className="rounded-lg p-2 text-text-dim hover:bg-surface-hover hover:text-text disabled:opacity-40"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => pausar(p)}
                      disabled={procesando}
                      title={p.activo ? "Pausar" : "Activar"}
                      aria-label={`${p.activo ? "Pausar" : "Activar"} ${p.nombre}`}
                      className="rounded-lg p-2 text-text-dim hover:bg-surface-hover hover:text-text disabled:opacity-40"
                    >
                      {p.activo ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(p)}
                      disabled={procesando}
                      title="Eliminar"
                      aria-label={`Eliminar ${p.nombre}`}
                      className="rounded-lg p-2 text-text-dim hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editando && (
        <PromocionFormModal
          promocion={editando === "nueva" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={() => {
            toast.success(editando === "nueva" ? "Promoción creada" : "Promoción guardada");
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
