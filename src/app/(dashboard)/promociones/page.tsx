import { notFound } from "next/navigation";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { PromocionesAdmin } from "@/components/promociones/promociones-admin";

export default async function PromocionesPage() {
  // Promociones (#114): plan Pro. El empleado no entra (no está en src/lib/permisos.ts).
  if (!(await obtenerConfiguracion()).habilitarPromociones) notFound();
  return <PromocionesAdmin />;
}
