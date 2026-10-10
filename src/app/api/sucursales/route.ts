import { NextResponse } from "next/server";
import { obtenerContextoSucursal } from "@/lib/sucursal";

/**
 * Sucursales habilitadas y la elegida, para pantallas del lado del navegador
 * (por ejemplo, el formulario de cuentas). Ver src/lib/sucursal.ts.
 */
export async function GET() {
  const { sucursales, actual, multisucursal } = await obtenerContextoSucursal();
  return NextResponse.json({
    sucursales: sucursales.map((s) => ({ id: s.id, nombre: s.nombre })),
    actualId: actual?.id ?? null,
    multisucursal,
  });
}
