import { notFound } from "next/navigation";
import { requerirDesarrolladorPagina } from "@/lib/desarrollador";
import { DetalleEmpresa } from "@/components/innovax/detalle-empresa";
import { obtenerEmpresa } from "../../actions";

export const dynamic = "force-dynamic";

/** Detalle de una empresa en el panel de InnovaX (solo desarrolladores). */
export default async function EmpresaInnovaxPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirDesarrolladorPagina();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const empresa = await obtenerEmpresa(id);
  if (!empresa) notFound();
  return <DetalleEmpresa empresa={empresa} />;
}
