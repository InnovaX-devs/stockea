"use client";

import { useEffect, useRef } from "react";
import { CloudUpload, TriangleAlert, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useEstadoConexion } from "@/lib/offline/estado-conexion";

/**
 * Chip de la topbar (issue #39): aparece solo sin conexión, cuando hay ventas
 * pendientes de subir o ventas que el servidor rechazó (#41). Con conexión y
 * nada pendiente no ocupa lugar.
 */
export function IndicadorConexion() {
  const { enLinea, ventasPendientes, ventasConError } = useEstadoConexion();
  const estabaSinConexion = useRef(false);

  useEffect(() => {
    if (!enLinea) {
      if (!estabaSinConexion.current) toast.warning("Sin conexión a internet", { id: "conexion" });
      estabaSinConexion.current = true;
    } else if (estabaSinConexion.current) {
      estabaSinConexion.current = false;
      toast.success("Volvió la conexión", { id: "conexion" });
    }
  }, [enLinea]);

  if (enLinea && ventasPendientes === 0 && ventasConError === 0) return null;

  const pendientes = ventasPendientes === 1 ? "1 venta pendiente" : `${ventasPendientes} ventas pendientes`;
  const conError = ventasConError === 1 ? "1 venta con error" : `${ventasConError} ventas con error`;
  const avisoError = ventasConError > 0 ? conError : null;
  const texto = enLinea
    ? [ventasPendientes > 0 ? `Subiendo ${pendientes}` : null, avisoError].filter(Boolean).join(" · ")
    : [ventasPendientes > 0 ? `Sin conexión · ${pendientes}` : "Sin conexión", avisoError].filter(Boolean).join(" · ");
  const Icono = ventasConError > 0 ? TriangleAlert : enLinea ? CloudUpload : WifiOff;
  const total = ventasPendientes + ventasConError;

  return (
    <span
      role="status"
      title={texto}
      aria-label={texto}
      className={cn(
        "flex h-[34px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        ventasConError > 0
          ? "border-danger/50 bg-danger/15 text-danger"
          : enLinea
            ? "border-white/15 bg-white/5 text-white"
            : "border-warning/50 bg-warning/15 text-warning"
      )}
    >
      <Icono className="h-4 w-4 shrink-0" strokeWidth={1.9} />
      <span className="hidden lg:inline">{texto}</span>
      {total > 0 && <span className="font-mono lg:hidden">{total}</span>}
    </span>
  );
}
