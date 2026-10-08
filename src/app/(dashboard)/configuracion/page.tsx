import { obtenerConfiguracion } from "@/lib/configuracion";
import { ConfiguracionForm } from "@/components/configuracion/configuracion-form";

/** Configuración → Negocio. */
export default async function ConfiguracionPage() {
  const configuracion = await obtenerConfiguracion();
  return <ConfiguracionForm configuracion={configuracion} />;
}
