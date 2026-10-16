"use client";

import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { elegirSucursal } from "@/app/(dashboard)/sucursal-actions";

/** Cambia el selector de la barra a esta sucursal y abre el Inicio. */
export function VerDetalle({ sucursalId, nombre }: { sucursalId: number; nombre: string }) {
  const [pendiente, startTransition] = useTransition();

  function abrir() {
    startTransition(async () => {
      const r = await elegirSucursal(sucursalId);
      if (!r.success) return void toast.error(r.error);
      // Recarga completa, igual que el selector: varias pantallas traen el
      // stock desde el navegador y tienen que volver a pedirlo.
      window.location.href = "/";
    });
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={pendiente}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-60"
      aria-label={`Ver detalle de ${nombre}`}
    >
      Ver detalle <ArrowRight size={12} />
    </button>
  );
}