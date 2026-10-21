import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { leerProveedorId, obtenerCuentaCorriente } from "@/lib/cuenta-corriente-proveedor";
import { ResumenProveedorDocument } from "@/lib/pdf/ResumenProveedorDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/proveedores/[id]/resumen → PDF "Resumen de cuenta del proveedor" (CP-2). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const empresaId = await obtenerEmpresaIdActual();
  const proveedorId = leerProveedorId((await params).id);
  if (proveedorId === undefined) {
    return NextResponse.json({ error: "Proveedor inválido." }, { status: 400 });
  }

  const [cc, configuracion] = await Promise.all([
    obtenerCuentaCorriente(empresaId, proveedorId),
    obtenerConfiguracion(),
  ]);
  if (!cc) return NextResponse.json({ error: "El proveedor no existe." }, { status: 404 });

  const buffer = await renderToBuffer(
    <ResumenProveedorDocument proveedor={cc.proveedor} saldo={cc.saldo} eventos={cc.eventos} configuracion={configuracion} />
  );
  const nombre = `resumen-proveedor-${cc.proveedor.nombre}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
