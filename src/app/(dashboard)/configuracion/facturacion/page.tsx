import { FacturacionSection } from "@/components/configuracion/facturacion-section";
import { obtenerFacturacion } from "../facturacion-actions";

/** Configuración → Facturación electrónica (ARCA). */
export default async function ConfiguracionFacturacionPage() {
  const facturacion = await obtenerFacturacion();
  return <FacturacionSection estado={facturacion} />;
}
