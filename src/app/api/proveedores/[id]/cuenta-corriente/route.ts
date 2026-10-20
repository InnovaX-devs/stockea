import { NextRequest, NextResponse } from "next/server";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { leerProveedorId, obtenerCuentaCorriente } from "@/lib/cuenta-corriente-proveedor";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const empresaId = await obtenerEmpresaIdActual();
  const proveedorId = leerProveedorId((await params).id);
  if (proveedorId === undefined) {
    return NextResponse.json({ error: "ID de proveedor inválido" }, { status: 400 });
  }
  const cc = await obtenerCuentaCorriente(empresaId, proveedorId);
  if (!cc) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  return NextResponse.json(cc);
}
