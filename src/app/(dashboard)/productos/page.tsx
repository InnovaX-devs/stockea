import { obtenerUsuarioActual } from "@/lib/empresa";
import ProductosAdmin from "@/components/productos/productos-admin";
import CatalogoEmpleado from "@/components/productos/catalogo-empleado";

export default async function ProductosPage() {
  const usuario = await obtenerUsuarioActual();
  // El empleado ve el catálogo sin costos ni edición.
  return usuario.rol === "EMPLEADO" ? <CatalogoEmpleado /> : <ProductosAdmin />;
}
