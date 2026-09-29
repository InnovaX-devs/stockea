import { CierreCaja } from "@/components/finanzas/cierre-caja";
import { listarCierres, obtenerEstadoCaja } from "./actions";

export default async function CierreCajaPage() {
  const estado = await obtenerEstadoCaja();
  // El historial (con esperados y diferencias) es solo del admin.
  const historial = estado.esAdmin ? await listarCierres() : [];

  return <CierreCaja estado={estado} historial={historial} />;
}
