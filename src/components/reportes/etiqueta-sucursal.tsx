import { MapPin, Layers } from "lucide-react";
import { obtenerContextoSucursal } from "@/lib/sucursal";

/**
 * Aclara de qué sucursal son los números del reporte. Solo se muestra si la
 * empresa tiene más de una sucursal. La sucursal se elige en la barra
 * superior (el admin puede elegir "Todas"; el empleado ve la suya).
 */
export async function EtiquetaSucursal() {
  const { actual, multisucursal } = await obtenerContextoSucursal();
  if (!multisucursal) return null;
  const Icono = actual ? MapPin : Layers;
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-text-dim">
      <Icono className="h-3.5 w-3.5" strokeWidth={1.8} />
      {actual ? `Sucursal: ${actual.nombre}` : "Todas las sucursales"}
    </p>
  );
}