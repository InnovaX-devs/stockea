import { obtenerConfiguracion } from "@/lib/configuracion";
import { UsuariosSection } from "@/components/configuracion/usuarios-section";
import { listarUsuarios } from "../usuarios-actions";

/** Configuración → Usuarios (admin y empleado). */
export default async function ConfiguracionUsuariosPage() {
  const [configuracion, usuarios] = await Promise.all([obtenerConfiguracion(), listarUsuarios()]);
  return <UsuariosSection usuarios={usuarios} premium={configuracion.licencia === "PREMIUM"} />;
}
