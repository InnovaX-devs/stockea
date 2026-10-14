"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { abrirCaja, estadoCajaParaVenta } from "@/app/(dashboard)/finanzas/cierre-caja/actions";
import { guardarEstadoCaja } from "@/lib/offline/db";
import { useEstadoConexion } from "@/lib/offline/estado-conexion";

/**
 * Aviso de Nueva venta cuando la caja está cerrada, con el botón para
 * abrirla. Es solo la vista: el bloqueo real lo hacen las server actions
 * (mensajeSiCajaCerrada en src/lib/caja.ts).
 *
 * Abrir y cerrar la caja requieren conexión (#41): acá se guarda el último
 * estado visto con internet, que es el que usa la venta sin conexión.
 */
export function AvisoCajaCerrada() {
  const [estado, setEstado] = useState<{ abierta: boolean; horaApertura: string; sucursalId: number | null } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const { enLinea } = useEstadoConexion();

  useEffect(() => {
    estadoCajaParaVenta()
      .then((e) => {
        setEstado(e);
        guardarEstadoCaja(e.abierta, e.sucursalId).catch(() => {});
      })
      .catch(() => setEstado(null));
  }, []);

  if (!estado || estado.abierta) return null;

  function abrir() {
    startTransition(async () => {
      const r = await abrirCaja();
      if (!r.success) return void toast.error(r.error);
      toast.success("Caja abierta. Ya podés vender.");
      guardarEstadoCaja(true, estado!.sucursalId).catch(() => {});
      setEstado({ ...estado!, abierta: true });
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center">
      <Lock className="hidden h-5 w-5 shrink-0 text-warning sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">La caja está cerrada</p>
        <p className="text-sm text-text-dim">
          Se abre sola a las {estado.horaApertura}. Si necesitás vender antes, abrila ahora.
          {!enLinea && " Abrir la caja requiere conexión."}
        </p>
      </div>
      <button
        type="button"
        onClick={abrir}
        disabled={pendiente || !enLinea}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pendiente ? "Abriendo..." : "Abrir caja ahora"}
      </button>
    </div>
  );
}
