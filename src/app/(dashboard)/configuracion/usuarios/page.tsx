import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import { UsuariosSection } from "@/components/configuracion/usuarios-section";
import { listarUsuarios } from "../usuarios-actions";

/** Configuración → Usuarios (admin y un empleado por sucursal). */
export default async function ConfiguracionUsuariosPage() {
  const [configuracion, usuarios, { sucursales }] = await Promise.all([
    obtenerConfiguracion(),
    listarUsuarios(),
    obtenerContextoSucursal(),
  ]);
  return (
    <UsuariosSection
      usuarios={usuarios}
      premium={configuracion.licencia === "PREMIUM"}
      sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
    />
  );
}
