import { CierreCaja } from "@/components/finanzas/cierre-caja";
import { notFound } from "next/navigation";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { listarCierres, obtenerEstadoCaja } from "./actions";

export default async function CierreCajaPage() {
  // Solo plan Premium (en Básico la caja está siempre abierta).
  if (!(await obtenerConfiguracion()).habilitarCierreCaja) notFound();
  const estado = await obtenerEstadoCaja();
  // El historial (con esperados y diferencias) es solo del admin.
  const historial = estado.esAdmin ? await listarCierres() : [];

  return <CierreCaja estado={estado} historial={historial} />;
}
