import { notFound } from "next/navigation";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { SeccionesReportes } from "@/components/reportes/SeccionesReportes";

export default async function ReportesLayout({ children }: { children: React.ReactNode }) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarReportesAvanzados) notFound();

  return (
    <div className="space-y-4 p-4 print:p-0">
      <div className="print:hidden">
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Reportes</h1>
      </div>
      <SeccionesReportes />
      {children}
    </div>
  );
}
