import { requerirDesarrolladorPagina } from "@/lib/desarrollador";
import { PanelEmpresas } from "@/components/innovax/panel-empresas";
import { listarEmpresas } from "./actions";

export const dynamic = "force-dynamic";

/** Panel de InnovaX: solo desarrolladores (ver src/lib/desarrollador.ts). */
export default async function PanelInnovaxPage() {
  await requerirDesarrolladorPagina();
  const empresas = await listarEmpresas();
  return <PanelEmpresas empresas={empresas} />;
}
