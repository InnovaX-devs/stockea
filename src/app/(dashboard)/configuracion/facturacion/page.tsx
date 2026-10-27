import { FacturacionSection } from "@/components/configuracion/facturacion-section";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerFacturacion } from "../facturacion-actions";

/** Configuración → Facturación electrónica (ARCA). Solo plan Premium. */
export default async function ConfiguracionFacturacionPage() {
  if (!(await obtenerConfiguracion()).habilitarFacturacion) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="text-lg font-semibold text-text">Factura electrónica ARCA</h2>
        <p className="mt-1 text-sm text-text-dim">
          Emitir facturas A, B y C desde la venta está disponible en el plan Pro. Hablá con InnovaX para cambiar de plan.
        </p>
      </div>
    );
  }
  const facturacion = await obtenerFacturacion();
  return <FacturacionSection estado={facturacion} />;
}
