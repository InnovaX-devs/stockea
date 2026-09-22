import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPresupuestos } from "./queries";
import PresupuestosFiltros from "../../../components/presupuestos/PresupuestosFiltros";
import PresupuestosTable from "../../../components/presupuestos/PresupuestosTable";
import type { EstadoPresupuesto } from "@/lib/presupuestos";
import { obtenerConfiguracion } from "@/lib/configuracion";

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; desde?: string; hasta?: string; clienteQuery?: string }>;
}) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarPresupuestos) notFound();

  const params = await searchParams;

  const presupuestos = await obtenerPresupuestos({
    estado: (params.estado as "TODOS" | EstadoPresupuesto) ?? "TODOS",
    desde: params.desde,
    hasta: params.hasta,
    clienteQuery: params.clienteQuery,
  });

  return (
    <div className="p-4 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Presupuestos</h1>
        <Link
          href="/presupuestos/nuevo"
          className="bg-grad px-4 py-2 text-sm font-semibold rounded-full text-[#050507] shadow-[0_6px_20px_rgba(34,197,94,0.22)] transition-transform hover:-translate-y-0.5 self-start sm:self-auto"
        >
          + Nuevo Presupuesto
        </Link>
      </div>

      <PresupuestosFiltros />

      <PresupuestosTable presupuestos={presupuestos} />
    </div>
  );
}