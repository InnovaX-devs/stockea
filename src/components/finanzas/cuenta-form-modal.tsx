"use client";

import { useState, useEffect } from "react";
import type { CuentaDTO, TipoCuenta } from "@/types/cuenta";
import { ES_TIPO_BANCO } from "@/types/cuenta";

const COLORES = ["#10B981", "#4F46E5", "#8B5CF6", "#F59E0B", "#EF4444", "#059669", "#EC4899", "#6366F1"];

const TIPOS_ARS: { value: TipoCuenta; label: string }[] = [
  { value: "EFECTIVO_ARS", label: "Efectivo ARS" },
  { value: "BANCO_ARS", label: "Banco ARS" },
];

const TIPOS_ARS_USD: { value: TipoCuenta; label: string }[] = [
  { value: "EFECTIVO_ARS", label: "Efectivo ARS" },
  { value: "EFECTIVO_USD", label: "Efectivo USD" },
  { value: "BANCO_ARS", label: "Banco ARS" },
  { value: "BANCO_USD", label: "Banco USD" },
];

export interface CuentaFormData {
  id?: number;
  nombre: string;
  tipo: TipoCuenta;
  titular: string;
  banco: string;
  alias: string;
  cbu: string;
  color: string;
  favorita: boolean;
  saldoInicial: number | "";
  limiteMensualIngresos: number | "";
}

const FORM_VACIO: CuentaFormData = {
  nombre: "",
  tipo: "EFECTIVO_ARS",
  titular: "",
  banco: "",
  alias: "",
  cbu: "",
  color: COLORES[0],
  favorita: false,
  saldoInicial: "",
  limiteMensualIngresos: "",
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cuentaEditar?: CuentaDTO | null;
  onSuccess: () => void;
  usaCotizacionUSD?: boolean;
}

export function CuentaFormModal({ isOpen, onClose, cuentaEditar, onSuccess, usaCotizacionUSD = false }: Props) {
  const [formData, setFormData] = useState<CuentaFormData>(FORM_VACIO);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const TIPOS = usaCotizacionUSD ? TIPOS_ARS_USD : TIPOS_ARS;

  useEffect(() => {
    if (cuentaEditar) {
      setFormData({
        id: cuentaEditar.id,
        nombre: cuentaEditar.nombre,
        tipo: cuentaEditar.tipo,
        titular: cuentaEditar.titular ?? "",
        banco: cuentaEditar.banco ?? "",
        alias: cuentaEditar.alias ?? "",
        cbu: cuentaEditar.cbu ?? "",
        color: cuentaEditar.color ?? COLORES[0],
        favorita: cuentaEditar.favorita,
        saldoInicial: cuentaEditar.saldoInicial,
        limiteMensualIngresos: cuentaEditar.limiteMensualIngresos ?? "",
      });
    } else {
      setFormData(FORM_VACIO);
    }
    setErrorMsg("");
  }, [cuentaEditar, isOpen]);

  if (!isOpen) return null;

  const esBanco = ES_TIPO_BANCO(formData.tipo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!formData.nombre.trim()) {
      setErrorMsg("El nombre es obligatorio");
      return;
    }

    setLoading(true);
    try {
      const url = cuentaEditar?.id ? `/api/cuentas/${cuentaEditar.id}` : "/api/cuentas";
      const method = cuentaEditar?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          saldoInicial: formData.saldoInicial === "" ? 0 : formData.saldoInicial,
          limiteMensualIngresos:
            formData.limiteMensualIngresos === "" ? null : formData.limiteMensualIngresos,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al guardar la cuenta");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-xl font-semibold text-text">
            {cuentaEditar ? "Editar cuenta" : "Nueva cuenta"}
          </h2>
          <button onClick={onClose} className="rounded-lg cursor-pointer p-1 text-text-dim hover:bg-surface-hover hover:text-text">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg bg-danger/10 p-3 text-xs text-danger">{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-dim">Nombre *</label>
            <input
              type="text"
              required
              placeholder="Ej: Banco Galicia, Mercado Pago..."
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-dim">Tipo</label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, tipo: t.value })}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    formData.tipo === t.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-text-dim hover:bg-surface-hover"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {esBanco && (
            <div className="rounded-xl border border-border bg-surface-hover/30 p-4 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
                Datos bancarios
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-text-dim">Titular</label>
                  <input
                    type="text"
                    placeholder="Nombre del titular"
                    value={formData.titular}
                    onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-dim">Banco / Entidad</label>
                  <input
                    type="text"
                    placeholder="Ej: Galicia, MP..."
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-dim">Alias</label>
                  <input
                    type="text"
                    placeholder="mi.alias.mp"
                    value={formData.alias}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-dim">CBU</label>
                  <input
                    type="text"
                    placeholder="22 dígitos"
                    value={formData.cbu}
                    onChange={(e) => setFormData({ ...formData, cbu: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="block text-xs font-medium text-text-dim">Color</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: c })}
                    style={{ backgroundColor: c }}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      formData.color === c ? "scale-110 ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input
                type="checkbox"
                checked={formData.favorita}
                onChange={(e) => setFormData({ ...formData, favorita: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Favorita
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Saldo inicial <span className="text-text-dim/60">(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.saldoInicial}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    saldoInicial: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                disabled={Boolean(cuentaEditar)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none disabled:opacity-50"
              />
              {cuentaEditar && (
                <p className="mt-1 text-[11px] text-text-dim">
                  No editable: el saldo se ajusta con movimientos de caja.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim">
                Límite mensual de ingresos <span className="text-text-dim/60">(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Sin límite"
                value={formData.limiteMensualIngresos}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    limiteMensualIngresos: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 cursor-pointer text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Guardando..." : cuentaEditar ? "Guardar cambios" : "Crear cuenta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}