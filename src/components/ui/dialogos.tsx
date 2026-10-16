"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Reemplazo de alert(), confirm() y prompt() del navegador, con el estilo de
 * la app. Se usan igual que los nativos, pero devuelven una promesa:
 *
 *   await avisar("Se guardó la marca.");
 *   if (!(await confirmar("¿Eliminar la cuenta?", { peligro: true }))) return;
 *   const dni = await pedirTexto("DNI del comprador:");
 *
 * Necesitan <Dialogos /> montado una sola vez (está en src/app/layout.tsx).
 * Si se piden varios a la vez, se muestran de a uno, en orden.
 */

type Variante = "info" | "exito" | "advertencia" | "error";

type OpcionesBase = {
  titulo?: string;
  variante?: Variante;
};

export type OpcionesAviso = OpcionesBase & { boton?: string };

export type OpcionesConfirmacion = OpcionesBase & {
  confirmar?: string;
  cancelar?: string;
  /** Botón de confirmar en rojo, para acciones que borran o anulan. */
  peligro?: boolean;
};

export type OpcionesTexto = OpcionesConfirmacion & {
  valorInicial?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric";
};

type Pedido =
  | { id: number; tipo: "aviso"; mensaje: string; opciones: OpcionesAviso; resolver: (v: void) => void }
  | { id: number; tipo: "confirmacion"; mensaje: string; opciones: OpcionesConfirmacion; resolver: (v: boolean) => void }
  | { id: number; tipo: "texto"; mensaje: string; opciones: OpcionesTexto; resolver: (v: string | null) => void };

// ---------------------------------------------------------------------------
// Cola de diálogos (fuera de React, para poder llamarlos desde cualquier lado)
// ---------------------------------------------------------------------------

let cola: Pedido[] = [];
let siguienteId = 1;
const oyentes = new Set<() => void>();

function emitir() {
  for (const o of oyentes) o();
}

function encolar(p: Pedido) {
  cola = [...cola, p];
  emitir();
}

function cerrarActual() {
  cola = cola.slice(1);
  emitir();
}

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => oyentes.delete(o);
};
const leerActual = () => cola[0] ?? null;
const leerEnServidor = () => null;

export function avisar(mensaje: string, opciones: OpcionesAviso = {}): Promise<void> {
  return new Promise((resolver) => encolar({ id: siguienteId++, tipo: "aviso", mensaje, opciones, resolver }));
}

export function confirmar(mensaje: string, opciones: OpcionesConfirmacion = {}): Promise<boolean> {
  return new Promise((resolver) => encolar({ id: siguienteId++, tipo: "confirmacion", mensaje, opciones, resolver }));
}

/** Devuelve el texto ingresado, o null si se canceló. */
export function pedirTexto(mensaje: string, opciones: OpcionesTexto = {}): Promise<string | null> {
  return new Promise((resolver) => encolar({ id: siguienteId++, tipo: "texto", mensaje, opciones, resolver }));
}

// ---------------------------------------------------------------------------
// Componente que los dibuja
// ---------------------------------------------------------------------------

const ICONOS: Record<Variante, { icono: typeof Info; clase: string }> = {
  info: { icono: Info, clase: "bg-primary/10 text-primary" },
  exito: { icono: CheckCircle2, clase: "bg-success/10 text-success" },
  advertencia: { icono: AlertTriangle, clase: "bg-warning/15 text-warning" },
  error: { icono: XCircle, clase: "bg-danger/10 text-danger" },
};

const TITULOS: Record<Pedido["tipo"], string> = {
  aviso: "Aviso",
  confirmacion: "¿Confirmás?",
  texto: "Completá el dato",
};

export function Dialogos() {
  const pedido = useSyncExternalStore(suscribir, leerActual, leerEnServidor);
  if (!pedido) return null;
  // La key reinicia el estado interno (texto, foco) en cada diálogo nuevo.
  return createPortal(<Dialogo key={pedido.id} pedido={pedido} />, document.body);
}

function Dialogo({ pedido }: { pedido: Pedido }) {
  const [texto, setTexto] = useState(pedido.tipo === "texto" ? pedido.opciones.valorInicial ?? "" : "");
  const botonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { opciones } = pedido;
  const peligro = pedido.tipo !== "aviso" && !!(opciones as OpcionesConfirmacion).peligro;
  const variante: Variante = opciones.variante ?? (peligro ? "advertencia" : pedido.tipo === "aviso" ? "info" : "advertencia");
  const { icono: Icono, clase: claseIcono } = ICONOS[variante];
  const titulo = opciones.titulo ?? TITULOS[pedido.tipo];

  function aceptar() {
    cerrarActual();
    if (pedido.tipo === "aviso") pedido.resolver();
    else if (pedido.tipo === "confirmacion") pedido.resolver(true);
    else pedido.resolver(texto);
  }

  function cancelar() {
    cerrarActual();
    if (pedido.tipo === "aviso") pedido.resolver();
    else if (pedido.tipo === "confirmacion") pedido.resolver(false);
    else pedido.resolver(null);
  }

  useEffect(() => {
    (pedido.tipo === "texto" ? inputRef.current : botonRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const etiquetaAceptar =
    pedido.tipo === "aviso"
      ? pedido.opciones.boton ?? "Aceptar"
      : (opciones as OpcionesConfirmacion).confirmar ?? "Confirmar";
  const etiquetaCancelar = pedido.tipo === "aviso" ? null : (opciones as OpcionesConfirmacion).cancelar ?? "Cancelar";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && cancelar()}
    >
      <div
        role={pedido.tipo === "aviso" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        aria-describedby="dialogo-mensaje"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", claseIcono)}>
            <Icono className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 id="dialogo-titulo" className="text-base font-semibold text-text">
              {titulo}
            </h3>
            <p id="dialogo-mensaje" className="mt-1 whitespace-pre-line text-sm text-text-dim">
              {pedido.mensaje}
            </p>
          </div>
          <button
            type="button"
            onClick={cancelar}
            className="shrink-0 rounded-lg p-1 text-text-dim hover:bg-surface-hover"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {pedido.tipo === "texto" && (
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aceptar()}
            placeholder={pedido.opciones.placeholder}
            inputMode={pedido.opciones.inputMode}
            className="mt-4 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          {etiquetaCancelar && (
            <button
              type="button"
              onClick={cancelar}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-dim hover:bg-surface-hover"
            >
              {etiquetaCancelar}
            </button>
          )}
          <button
            ref={botonRef}
            type="button"
            onClick={aceptar}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90",
              peligro ? "bg-danger" : "bg-primary"
            )}
          >
            {etiquetaAceptar}
          </button>
        </div>
      </div>
    </div>
  );
}