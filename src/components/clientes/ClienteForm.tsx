"use client";

import { useState, FormEvent } from "react";
import {
  crearCliente,
  actualizarCliente,
  type ClienteInput,
} from "@/app/(dashboard)/clientes/actions";

export type ClienteBasico = {
  id: number;
  nombre: string;
  apellido: string | null;
  esMayorista: boolean;
};

const pesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default function ClienteForm({
  clienteInicial,
  onSuccess,
  onCancel,
  limiteCuentaCorriente,
}: {
  clienteInicial?: Partial<ClienteInput> & { id?: number };
  onSuccess: (cliente: ClienteBasico) => void;
  onCancel?: () => void;
  /**
   * Si se pasa, el formulario muestra el límite de cuenta corriente
   * (solo para administradores). `general` = límite de la empresa, null = sin límite.
   */
  limiteCuentaCorriente?: { general: number | null };
}) {
  const esEdicion = Boolean(clienteInicial?.id);
  const mostrarLimite = limiteCuentaCorriente !== undefined;
  const limitePropioInicial = clienteInicial?.limiteCuentaCorriente ?? null;
  const [modoLimite, setModoLimite] = useState<"general" | "propio">(limitePropioInicial == null ? "general" : "propio");
  const [montoLimite, setMontoLimite] = useState(limitePropioInicial == null ? "" : String(limitePropioInicial));

  const [values, setValues] = useState<ClienteInput>({
    nombre: clienteInicial?.nombre ?? "",
    apellido: clienteInicial?.apellido ?? "",
    telefono: clienteInicial?.telefono ?? "",
    email: clienteInicial?.email ?? "",
    direccion: clienteInicial?.direccion ?? "",
    localidad: clienteInicial?.localidad ?? "",
    esMayorista: clienteInicial?.esMayorista ?? false,
    tipoDocumento: clienteInicial?.tipoDocumento ?? null,
    numeroDocumento: clienteInicial?.numeroDocumento ?? "",
    condicionIva: clienteInicial?.condicionIva ?? "CONSUMIDOR_FINAL",
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function update<K extends keyof ClienteInput>(key: K, value: ClienteInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!values.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    // Límite: "general" = null (usa el de la empresa); sin el bloque, no se toca.
    let datos: ClienteInput = values;
    if (mostrarLimite) {
      if (modoLimite === "propio") {
        const monto = Number(montoLimite.replace(/\./g, "").replace(",", "."));
        if (montoLimite.trim() === "" || !Number.isFinite(monto) || monto < 0) {
          setError("Ingresá el límite propio del cliente (cero o más).");
          return;
        }
        datos = { ...values, limiteCuentaCorriente: monto };
      } else {
        datos = { ...values, limiteCuentaCorriente: null };
      }
    }

    setEnviando(true);
    const res = esEdicion
      ? await actualizarCliente(clienteInicial!.id!, datos)
      : await crearCliente(datos);
    setEnviando(false);

    if (!res.success) {
      setError(res.error);
      return;
    }
    onSuccess(res.cliente);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Nombre *
        </label>
        <input
          type="text"
          value={values.nombre}
          onChange={(e) => update("nombre", e.target.value)}
          required
          autoFocus
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Apellido
        </label>
        <input
          type="text"
          value={values.apellido}
          onChange={(e) => update("apellido", e.target.value)}
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
            Teléfono
          </label>
          <input
            type="text"
            value={values.telefono}
            onChange={(e) => update("telefono", e.target.value)}
            className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
            Email
          </label>
          <input
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Dirección
        </label>
        <input
          type="text"
          value={values.direccion}
          onChange={(e) => update("direccion", e.target.value)}
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Localidad
        </label>
        <input
          type="text"
          value={values.localidad}
          onChange={(e) => update("localidad", e.target.value)}
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Datos para facturar (opcionales): sin documento se factura como Consumidor Final. */}
      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-dim">
          Datos para facturar (opcional)
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
          <select
            value={values.tipoDocumento ?? ""}
            onChange={(e) =>
              update("tipoDocumento", (e.target.value || null) as ClienteInput["tipoDocumento"])
            }
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            aria-label="Tipo de documento"
          >
            <option value="">Sin documento</option>
            <option value="DNI">DNI</option>
            <option value="CUIT">CUIT</option>
            <option value="CUIL">CUIL</option>
          </select>
          <input
            type="text"
            inputMode="numeric"
            value={values.numeroDocumento ?? ""}
            onChange={(e) => update("numeroDocumento", e.target.value)}
            disabled={!values.tipoDocumento}
            placeholder={values.tipoDocumento === "DNI" ? "Ej. 30123456" : values.tipoDocumento ? "Ej. 20-30123456-7" : "Elegí el tipo de documento"}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            aria-label="Número de documento"
          />
        </div>
        {(values.tipoDocumento === "CUIT" || values.tipoDocumento === "CUIL") && (
          <select
            value={values.condicionIva ?? "CONSUMIDOR_FINAL"}
            onChange={(e) => update("condicionIva", e.target.value as ClienteInput["condicionIva"])}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            aria-label="Condición frente al IVA"
          >
            <option value="CONSUMIDOR_FINAL">Consumidor final</option>
            <option value="MONOTRIBUTO">Monotributista</option>
            <option value="RESPONSABLE_INSCRIPTO">Responsable inscripto</option>
            <option value="EXENTO">Exento</option>
          </select>
        )}
        <p className="text-xs text-text-dim">
          Sin documento, el cliente se factura como Consumidor Final.
        </p>
      </fieldset>

      <label className="flex items-center gap-2 text-sm cursor-pointer text-text">
        <input
          type="checkbox"
          checked={values.esMayorista}
          onChange={(e) => update("esMayorista", e.target.checked)}
          className="rounded border-border cursor-pointer"
        />
        Cliente mayorista
      </label>

      {mostrarLimite && (
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-dim">
            Límite de cuenta corriente
          </legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
            <input
              type="radio"
              name="modoLimite"
              checked={modoLimite === "general"}
              onChange={() => setModoLimite("general")}
              className="cursor-pointer"
            />
            Usar el límite general
            <span className="text-text-dim">
              ({limiteCuentaCorriente.general == null ? "sin límite" : pesos(limiteCuentaCorriente.general)})
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
            <input
              type="radio"
              name="modoLimite"
              checked={modoLimite === "propio"}
              onChange={() => setModoLimite("propio")}
              className="cursor-pointer"
            />
            Límite propio
          </label>
          {modoLimite === "propio" && (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={montoLimite}
              onChange={(e) => setMontoLimite(e.target.value)}
              placeholder="Ej. 300000"
              aria-label="Límite propio en pesos"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          )}
          <p className="text-xs text-text-dim">
            Es lo máximo que el cliente puede deber. Con $0 no se le puede dejar nada a cuenta.
          </p>
        </fieldset>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg cursor-pointer border border-border hover:bg-[#e8e9f1] transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="px-4 py-2 text-sm rounded-lg cursor-pointer bg-primary text-white disabled:opacity-50 hover:opacity-90 transition-colors"
        >
          {enviando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear cliente"}
        </button>
      </div>
    </form>
  );
}