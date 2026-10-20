import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerResumen, validarPeriodo, type PeriodoResumen } from "@/lib/resumen-cliente";
import { ResumenCuentaDocument } from "@/lib/pdf/ResumenCuentaDocument";
import { fechaISOAR } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/clientes/[id]/resumen → PDF con el resumen de la cuenta corriente
 * del cliente (issue #83). El período se elige con:
 *   ?mes=YYYY-MM                         un mes (sin nada: el mes en curso)
 *   ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD   un rango de días (ambos incluidos)
 *   ?modo=deuda                          desde que empezó la deuda actual hasta hoy
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const empresaId = await obtenerEmpresaIdActual();
  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  }

  const q = request.nextUrl.searchParams;
  const hoy = fechaISOAR();
  let periodo: PeriodoResumen;
  let sufijo: string;
  if (q.get("modo") === "deuda") {
    periodo = { tipo: "deuda" };
    sufijo = `deuda-al-${hoy}`;
  } else if (q.has("desde") || q.has("hasta")) {
    const desde = q.get("desde") ?? "";
    const hasta = q.get("hasta") || hoy;
    periodo = { tipo: "rango", desde, hasta };
    sufijo = `${desde}-al-${hasta}`;
  } else {
    const mes = q.get("mes") ?? hoy.slice(0, 7);
    periodo = { tipo: "mes", mes };
    sufijo = mes;
  }

  const ahora = new Date();
  const validacion = validarPeriodo(periodo, ahora);
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });

  const [resumen, configuracion] = await Promise.all([
    obtenerResumen(empresaId, clienteId, periodo, ahora),
    obtenerConfiguracion(),
  ]);
  if (!resumen) return NextResponse.json({ error: "El cliente no existe." }, { status: 404 });

  const buffer = await renderToBuffer(<ResumenCuentaDocument resumen={resumen} configuracion={configuracion} />);
  const nombreArchivo = `resumen-${sufijo}-${resumen.cliente.nombre}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
