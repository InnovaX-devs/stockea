import { obtenerConfiguracion } from "@/lib/configuracion";
import { ConfiguracionForm } from "@/components/configuracion/configuracion-form";
import { UsuariosSection } from "@/components/configuracion/usuarios-section";
import { listarUsuarios } from "./usuarios-actions";
import { FacturacionSection } from "@/components/configuracion/facturacion-section";
import { obtenerFacturacion } from "./facturacion-actions";

export default async function ConfiguracionPage() {
  const [configuracion, usuarios, facturacion] = await Promise.all([
    obtenerConfiguracion(),
    listarUsuarios(),
    obtenerFacturacion(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ConfiguracionForm configuracion={configuracion} />
      <UsuariosSection usuarios={usuarios} premium={configuracion.licencia === "PREMIUM"} />
      <FacturacionSection estado={facturacion} />
    </div>
  );
}
