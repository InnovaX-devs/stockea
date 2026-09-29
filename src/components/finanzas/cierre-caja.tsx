"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck, LockOpen, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatFechaAR, formatFechaHoraAR, formatHoraAR } from "@/lib/timezone";
import {
  abrirCaja,
  anularUltimoCierre,
  registrarCierre,
  revisarApertura,
  type CierreHistorial,
  type Destino,
  type EstadoCaja,
} from "@/app/(dashboard)/finanzas/cierre-caja/actions";

/**
 * Pantalla de Caja: estado del turno arriba, resumen en cuadros, conteo del
 * efectivo como paso principal y retiro como segundo paso. Solo vista: las
 * reglas están en app/(dashboard)/finanzas/cierre-caja/actions.ts.
 */

const ETIQUETAS_TIPO: Record<string, string> = {
  EFECTIVO_ARS: "Efectivo ARS",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Banco ARS",
  BANCO_USD: "Banco USD",
};
const monedaDe = (tipo: string) => (tipo.endsWith("USD") ? "USD" : "ARS");
const simbolo = (tipo: string) => (monedaDe(tipo) === "USD" ? "US$" : "$");
const aNumero = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(",", ".")) * 100) / 100);

// Sin las flechitas del navegador: no sirven para cargar plata.
const SIN_FLECHAS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function fmt(valor: number, tipo: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: monedaDe(tipo),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** Nombre de la cuenta, con el tipo solo si aporta algo. */
function nombreConTipo(nombre: string, tipo: string) {
  const etiqueta = ETIQUETAS_TIPO[tipo];
  return nombre.trim().toLowerCase() === etiqueta?.toLowerCase() ? nombre : `${nombre} · ${etiqueta}`;
}

function Monto({
  valor,
  onChange,
  tipo,
  placeholder,
  etiqueta,
  grande,
  disabled,
}: {
  valor: string;
  onChange: (v: string) => void;
  tipo: string;
  placeholder: string;
  etiqueta: string;
  grande?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="relative w-full">
      <span
        className={cn(
          "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-dim",
          grande ? "text-xl" : "text-sm"
        )}
      >
        {simbolo(tipo)}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={etiqueta}
        className={cn(
          "w-full rounded-xl border border-border bg-white text-text placeholder:text-text-dim/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50",
          grande ? "py-4 pl-12 pr-4 text-3xl font-semibold tabular-nums" : "py-2.5 pl-10 pr-3 text-base tabular-nums",
          SIN_FLECHAS
        )}
      />
    </div>
  );
}

function Cuadro({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        destacado ? "border-primary/30 bg-primary/5" : "border-border bg-white"
      )}
    >
      <p className={cn("text-xs", destacado ? "font-medium text-primary" : "text-text-dim")}>{titulo}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", destacado ? "text-primary" : "text-text")}>{valor}</p>
    </div>
  );
}

function ChipDiferencia({ diferencia, tipo }: { diferencia: number; tipo: string }) {
  if (diferencia === 0) {
    return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Coincide</span>;
  }
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        diferencia > 0 ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
      )}
    >
      {diferencia > 0 ? "Sobran" : "Faltan"} {fmt(Math.abs(diferencia), tipo)}
    </span>
  );
}

export function CierreCaja({ estado, historial }: { estado: EstadoCaja; historial: CierreHistorial[] }) {
  const abierta = estado.abierta;
  const proxima = estado.proximaApertura ? new Date(estado.proximaApertura) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text sm:text-2xl">Caja</h1>
          <p className="text-sm text-text-dim">Apertura y cierre del efectivo de cada turno.</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm sm:self-auto",
            abierta ? "bg-success/10 text-success" : "bg-surface-hover text-text-dim"
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", abierta ? "bg-success" : "bg-text-dim")} />
          {abierta
            ? `Abierta desde las ${formatHoraAR(new Date(abierta.desde))}${abierta.automatica ? " (automática)" : ` (${abierta.porNombre})`}`
            : proxima
              ? `Cerrada, se abre el ${formatFechaAR(proxima)} a las ${formatHoraAR(proxima)}`
              : "Cerrada"}
        </span>
      </div>

      {abierta?.desdeAyerOAntes && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          La caja está abierta desde el {formatFechaHoraAR(new Date(abierta.desde))}. Conviene cerrarla para empezar el turno de hoy.
        </div>
      )}

      {abierta ? <CajaAbierta estado={estado} /> : <CajaCerrada estado={estado} />}

      {estado.esAdmin && <Historial cierres={historial} />}
    </div>
  );
}

/* ------------------------------ Caja cerrada ------------------------------ */

function CajaCerrada({ estado }: { estado: EstadoCaja }) {
  const router = useRouter();
  const [contar, setContar] = useState(false);
  const [conteos, setConteos] = useState<Record<number, string>>({});
  const [pendiente, startTransition] = useTransition();

  function abrir() {
    startTransition(async () => {
      const lista = contar
        ? estado.efectivo
            .map((c) => ({ cuentaId: c.id, contado: aNumero(conteos[c.id] ?? "") }))
            .filter((c): c is { cuentaId: number; contado: number } => c.contado != null)
        : [];
      const r = await abrirCaja({ conteos: lista });
      if (!r.success) return void toast.error(r.error);
      toast.success("Caja abierta.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6 text-center">
      <p className="text-base font-semibold text-text">La caja está cerrada</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-dim">
        {estado.ultimoCierre
          ? `La cerró ${estado.ultimoCierre.usuarioNombre} el ${formatFechaHoraAR(new Date(estado.ultimoCierre.fecha))}. `
          : ""}
        Mientras esté cerrada no se puede vender ni cobrar.
      </p>

      {estado.esAdmin && estado.efectivo.length > 0 && (
        <div className="mx-auto mt-5 max-w-sm text-left">
          <label className="flex cursor-pointer items-center justify-center gap-2 text-sm text-text">
            <input type="checkbox" checked={contar} onChange={(e) => setContar(e.target.checked)} className="h-4 w-4" />
            Contar el cambio al abrir
          </label>
          {contar && (
            <div className="mt-4 space-y-4">
              {estado.efectivo.map((c) => (
                <div key={c.id}>
                  <p className="mb-1.5 text-sm text-text">
                    {nombreConTipo(c.nombre, c.tipo)}
                    {c.fondo != null && <span className="text-text-dim">: quedó {fmt(c.fondo, c.tipo)}</span>}
                  </p>
                  <Monto
                    valor={conteos[c.id] ?? ""}
                    onChange={(v) => setConteos((p) => ({ ...p, [c.id]: v }))}
                    tipo={c.tipo}
                    placeholder={c.fondo != null ? String(c.fondo) : "0"}
                    etiqueta={`Cambio contado en ${c.nombre}`}
                    disabled={pendiente}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={abrir}
        disabled={pendiente}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        <LockOpen className="h-4 w-4" /> {pendiente ? "Abriendo..." : "Abrir caja ahora"}
      </button>
    </div>
  );
}

/* ------------------------------ Caja abierta ------------------------------ */

type FilaCierre = { contado: string; queda: string; destino: Destino };
const FILA_VACIA: FilaCierre = { contado: "", queda: "", destino: "RETIRO" };

function CajaAbierta({ estado }: { estado: EstadoCaja }) {
  const router = useRouter();
  const [filas, setFilas] = useState<Record<number, FilaCierre>>({});
  const [observacion, setObservacion] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const cambiar = (id: number, cambio: Partial<FilaCierre>) =>
    setFilas((p) => ({ ...p, [id]: { ...(p[id] ?? FILA_VACIA), ...cambio } }));

  const calculadas = useMemo(
    () =>
      estado.efectivo.map((c) => {
        const f = filas[c.id] ?? FILA_VACIA;
        const contado = aNumero(f.contado);
        const queda = contado == null ? null : aNumero(f.queda) ?? contado;
        return {
          cuenta: c,
          fila: f,
          contado,
          queda,
          retiro: contado != null && queda != null ? Math.round((contado - queda) * 100) / 100 : null,
          diferencia: c.resumen && contado != null ? Math.round((contado - c.resumen.esperado) * 100) / 100 : null,
        };
      }),
    [estado.efectivo, filas]
  );
  const contadas = calculadas.filter((c) => c.contado != null);
  const invalida = calculadas.some(
    (c) =>
      c.contado != null &&
      (!Number.isFinite(c.contado) || c.contado < 0 || c.queda == null || c.queda < 0 || c.queda > c.contado)
  );

  function cerrar() {
    startTransition(async () => {
      const r = await registrarCierre({
        cuentas: contadas.map((c) => ({
          cuentaId: c.cuenta.id,
          contado: c.contado,
          queda: c.queda,
          destino: c.fila.destino,
        })),
        observacion,
      });
      if (!r.success) {
        setConfirmando(false);
        return void toast.error(r.error);
      }
      toast.success("Caja cerrada.");
      router.refresh();
    });
  }

  if (estado.efectivo.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-text-dim">
        No hay cuentas de efectivo activas. Creá una en Finanzas → Cuentas.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {calculadas.map(({ cuenta: c, fila, contado, queda, retiro, diferencia }) => {
        const destinos = estado.destinos.filter((d) => d.id !== c.id && monedaDe(d.tipo) === monedaDe(c.tipo));
        return (
          <section key={c.id} className="space-y-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
            {estado.efectivo.length > 1 && (
              <h2 className="text-base font-semibold text-text">{nombreConTipo(c.nombre, c.tipo)}</h2>
            )}

            {/* Resumen del turno (el empleado cierra a ciegas: no lo ve) */}
            {c.resumen && (
              <div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Cuadro titulo="Apertura" valor={fmt(c.resumen.saldoInicio, c.tipo)} />
                  <Cuadro titulo="Ingresos" valor={`+${fmt(c.resumen.ingresos, c.tipo)}`} />
                  <Cuadro titulo="Egresos" valor={`−${fmt(c.resumen.egresos, c.tipo)}`} />
                  <Cuadro titulo="Debería haber" valor={fmt(c.resumen.esperado, c.tipo)} destacado />
                </div>
                {estado.abierta?.puedeRevisarApertura && !revisando && (
                  <button
                    type="button"
                    onClick={() => setRevisando(true)}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Revisar el cambio de apertura
                  </button>
                )}
              </div>
            )}
            {revisando && <RevisarApertura estado={estado} onListo={() => setRevisando(false)} />}

            {/* Paso 1: contar */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label className="text-base font-semibold text-text">¿Cuánto hay en la caja?</label>
                {c.resumen && fila.contado === "" && (
                  <button
                    type="button"
                    onClick={() => cambiar(c.id, { contado: String(c.resumen!.esperado) })}
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                  >
                    Coincide con el sistema
                  </button>
                )}
              </div>
              <Monto
                grande
                valor={fila.contado}
                onChange={(v) => cambiar(c.id, { contado: v })}
                tipo={c.tipo}
                placeholder="0"
                etiqueta={`Efectivo contado en ${c.nombre}`}
                disabled={pendiente}
              />
              {diferencia != null && Number.isFinite(diferencia) && (
                <div
                  className={cn(
                    "mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium",
                    diferencia === 0
                      ? "bg-success/10 text-success"
                      : diferencia > 0
                        ? "bg-warning/10 text-warning"
                        : "bg-danger/10 text-danger"
                  )}
                >
                  {diferencia === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {diferencia === 0
                    ? "Coincide con el sistema"
                    : `${diferencia > 0 ? "Sobran" : "Faltan"} ${fmt(Math.abs(diferencia), c.tipo)}. La caja se va a ajustar a lo contado.`}
                </div>
              )}
            </div>

            {/* Paso 2: cuánto queda y cuánto se retira */}
            {contado != null && Number.isFinite(contado) && (
              <div className="space-y-3 border-t border-border pt-4">
                <label className="block text-base font-semibold text-text">¿Cuánto dejás para el próximo turno?</label>
                <div className="sm:max-w-xs">
                  <Monto
                    valor={fila.queda}
                    onChange={(v) => cambiar(c.id, { queda: v })}
                    tipo={c.tipo}
                    placeholder={String(contado)}
                    etiqueta={`Queda en caja en ${c.nombre}`}
                    disabled={pendiente}
                  />
                </div>
                {queda != null && queda > contado ? (
                  <p className="text-sm text-danger">No puede quedar más de lo que contaste.</p>
                ) : retiro != null && retiro > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-text">
                    Se retiran <span className="text-base font-semibold">{fmt(retiro, c.tipo)}</span> a
                    <select
                      value={String(fila.destino)}
                      onChange={(e) =>
                        cambiar(c.id, { destino: e.target.value === "RETIRO" ? "RETIRO" : Number(e.target.value) })
                      }
                      disabled={pendiente}
                      className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                    >
                      <option value="RETIRO">Retiro del dueño</option>
                      {destinos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-text-dim">Queda todo en la caja, no se retira nada.</p>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Otros medios (solo admin, informativo) */}
      {estado.otrosMedios.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-dim">Otros medios del turno:</span>
          {estado.otrosMedios.map((m) => (
            <span key={m.id} className="rounded-full border border-border bg-white px-3 py-1 text-text">
              {m.nombre} <span className="font-medium tabular-nums">+{fmt(m.ingresos, m.tipo)}</span>
              {m.egresos > 0 && <span className="text-text-dim tabular-nums"> / −{fmt(m.egresos, m.tipo)}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Observaciones (opcional): por ejemplo, un gasto que falta cargar"
          rows={2}
          disabled={pendiente}
          className="w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none"
        />

        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={contadas.length === 0 || invalida || pendiente}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            <ClipboardCheck className="h-5 w-5" /> Cerrar caja
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-white p-5">
            <p className="text-base font-semibold text-text">¿Confirmás el cierre?</p>
            <ul className="mt-2 space-y-1.5 text-sm text-text-dim">
              {contadas.map((c) => (
                <li key={c.cuenta.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {estado.efectivo.length > 1 && `${c.cuenta.nombre}: `}
                    Quedan {fmt(c.queda!, c.cuenta.tipo)} en la caja
                    {c.retiro! > 0 &&
                      ` y se retiran ${fmt(c.retiro!, c.cuenta.tipo)} (${
                        c.fila.destino === "RETIRO"
                          ? "retiro del dueño"
                          : estado.destinos.find((d) => d.id === c.fila.destino)?.nombre
                      })`}
                  </span>
                  {c.diferencia != null && c.diferencia !== 0 && (
                    <ChipDiferencia diferencia={c.diferencia} tipo={c.cuenta.tipo} />
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={pendiente}
                className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={cerrar}
                disabled={pendiente}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pendiente ? "Cerrando..." : "Confirmar cierre"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RevisarApertura({ estado, onListo }: { estado: EstadoCaja; onListo: () => void }) {
  const router = useRouter();
  const [conteos, setConteos] = useState<Record<number, string>>({});
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const lista = estado.efectivo
        .map((c) => ({ cuentaId: c.id, contado: aNumero(conteos[c.id] ?? "") }))
        .filter((c): c is { cuentaId: number; contado: number } => c.contado != null);
      if (lista.length === 0) return onListo();
      const r = await revisarApertura(lista);
      if (!r.success) return void toast.error(r.error);
      toast.success("Cambio de apertura actualizado.");
      onListo();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl bg-surface p-4">
      <p className="text-sm font-medium text-text">¿Con cuánto se abrió la caja?</p>
      {estado.efectivo.map((c) => (
        <div key={c.id}>
          {estado.efectivo.length > 1 && <p className="mb-1 text-xs text-text-dim">{nombreConTipo(c.nombre, c.tipo)}</p>}
          <Monto
            valor={conteos[c.id] ?? ""}
            onChange={(v) => setConteos((p) => ({ ...p, [c.id]: v }))}
            tipo={c.tipo}
            placeholder={c.fondo != null ? String(c.fondo) : "0"}
            etiqueta={`Cambio contado en ${c.nombre}`}
            disabled={pendiente}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onListo}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- Historial ------------------------------- */

function Historial({ cierres }: { cierres: CierreHistorial[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [pendiente, startTransition] = useTransition();

  function anular(id: number) {
    if (!confirm("¿Anular este cierre? Se revierten el ajuste y el retiro, y la caja vuelve a quedar abierta.")) return;
    startTransition(async () => {
      const r = await anularUltimoCierre(id);
      if (!r.success) return void toast.error(r.error);
      toast.success("Cierre anulado. La caja volvió a quedar abierta.");
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <h2 className="px-5 py-4 text-base font-semibold text-text">Cierres anteriores</h2>
      {cierres.length === 0 ? (
        <p className="border-t border-border px-5 py-8 text-center text-sm text-text-dim">Todavía no hay cierres.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-topbar">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-white">
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3">Cerró</th>
                <th className="px-4 py-3 text-right">Contado</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3 text-right">Retiro</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cierres.map((c) => {
                const efectivo = c.cuentas.filter((x) => x.contado != null);
                const expandido = abierto === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => setAbierto(expandido ? null : c.id)}
                      className={cn("cursor-pointer border-t border-border hover:bg-surface-hover", c.anulado && "opacity-50")}
                    >
                      <td className="px-4 py-3 text-text">
                        {c.abiertaFecha
                          ? `${formatFechaAR(new Date(c.fecha))}, ${formatHoraAR(new Date(c.abiertaFecha))} a ${formatHoraAR(new Date(c.fecha))}`
                          : formatFechaHoraAR(new Date(c.fecha))}
                        {c.anulado && <span className="ml-2 text-xs text-text-dim">(anulado)</span>}
                      </td>
                      <td className="px-4 py-3 text-text-dim">{c.usuarioNombre}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text">
                        {efectivo.map((x) => fmt(x.contado!, x.tipo)).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {efectivo.length === 0
                            ? "—"
                            : efectivo.map((x) => <ChipDiferencia key={x.cuentaId} diferencia={x.diferencia ?? 0} tipo={x.tipo} />)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-dim">
                        {efectivo
                          .filter((x) => x.retiro)
                          .map((x) => fmt(x.retiro!, x.tipo))
                          .join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronDown className={cn("h-4 w-4 text-text-dim transition-transform", expandido && "rotate-180")} />
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="border-t border-border bg-surface">
                        <td colSpan={6} className="space-y-3 px-4 py-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {c.cuentas.map((x) => (
                              <div key={x.cuentaId} className="rounded-xl border border-border bg-white p-3 text-sm">
                                <p className="font-medium text-text">{nombreConTipo(x.nombre, x.tipo)}</p>
                                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-text-dim">
                                  <dt>Apertura</dt>
                                  <dd className="text-right tabular-nums">{fmt(x.saldoInicio, x.tipo)}</dd>
                                  <dt>Ingresos</dt>
                                  <dd className="text-right tabular-nums">+{fmt(x.ingresos, x.tipo)}</dd>
                                  <dt>Egresos</dt>
                                  <dd className="text-right tabular-nums">−{fmt(x.egresos, x.tipo)}</dd>
                                  <dt>Debería haber</dt>
                                  <dd className="text-right tabular-nums text-text">{fmt(x.esperado, x.tipo)}</dd>
                                  {x.contado != null && (
                                    <>
                                      <dt>Contado</dt>
                                      <dd className="text-right tabular-nums text-text">{fmt(x.contado, x.tipo)}</dd>
                                    </>
                                  )}
                                  {x.retiro ? (
                                    <>
                                      <dt>Retiro</dt>
                                      <dd className="text-right tabular-nums">
                                        {fmt(x.retiro, x.tipo)} ({x.destinoNombre})
                                      </dd>
                                    </>
                                  ) : null}
                                </dl>
                              </div>
                            ))}
                          </div>
                          {c.observacion && <p className="text-sm text-text-dim">Observación: {c.observacion}</p>}
                          {c.anulado && (
                            <p className="text-sm text-text-dim">
                              Anulado por {c.anuladoPorNombre ?? "el admin"}
                              {c.anuladoFecha && ` el ${formatFechaHoraAR(new Date(c.anuladoFecha))}`}.
                            </p>
                          )}
                          {c.puedeAnular && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                anular(c.id);
                              }}
                              disabled={pendiente}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Anular este cierre
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
