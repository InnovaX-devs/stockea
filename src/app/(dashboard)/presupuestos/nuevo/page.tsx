import PresupuestoForm from "../../../../components/presupuestos/PresupuestoForm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerConfiguracion } from "@/lib/configuracion";

export default async function NuevoPresupuestoPage() {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarPresupuestos) notFound();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h1 className="text-xl font-bold text-text sm:text-2xl">Nuevo Presupuesto</h1>
        <Link href="/presupuestos" className="text-sm text-primary">
          ← Volver a la lista
        </Link>
      </div>
      <PresupuestoForm />
    </div>
  );
}