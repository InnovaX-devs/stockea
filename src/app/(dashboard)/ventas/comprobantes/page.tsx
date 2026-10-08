import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { ListadoComprobantes } from "@/components/ventas/listado-comprobantes";

export default async function ComprobantesPage() {
  const admin = await requerirAdmin();
  const c = await prisma.configuracion.findUnique({
    where: { empresaId: admin.empresaId },
    select: { arcaEntorno: true, facturacionHabilitada: true },
  });
  return <ListadoComprobantes entornoInicial={c?.arcaEntorno ?? "HOMOLOGACION"} habilitada={Boolean(c?.facturacionHabilitada)} />;
}
