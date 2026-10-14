import { useEffect, useState } from "react";

/**
 * ¿Mostrar la columna "Sucursal" en un listado? Solo cuando la empresa tiene
 * más de una sucursal y el admin eligió "Todas" en la barra superior: si ya
 * está viendo una sucursal concreta, todas las filas serían de la misma.
 * La sucursal se elige en la barra superior (ver src/lib/sucursal.ts).
 */
export function useMostrarSucursal(): boolean {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/sucursales")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelado && data) setMostrar(Boolean(data.multisucursal) && data.actualId == null);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  return mostrar;
}