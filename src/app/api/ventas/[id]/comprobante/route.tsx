import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { LETRA_TIPO, numeroFormateado, qrComoImagen, urlQrArca, DOC_TIPO } from "@/lib/arca/factura";
import type { DatosFiscalesComprobante } from "@/lib/pdf/ComprobanteVentaDocument";

const CONDICION_EMISOR: Record<string, string> = {
  MONOTRIBUTO: "Responsable Monotributo",
  RESPONSABLE_INSCRIPTO: "IVA Responsable Inscripto",
  EXENTO: "IVA Sujeto Exento",
};
const CONDICION_RECEPTOR: Record<number, string> = { 1: "IVA Responsable Inscripto", 4: "IVA Sujeto Exento", 5: "Consumidor Final", 6: "Responsable Monotributo" };
const NOMBRE_DOC: Record<number, string> = { [DOC_TIPO.CUIT]: "CUIT", [DOC_TIPO.CUIL]: "CUIL", [DOC_TIPO.DNI]: "DNI" };

/** Datos de la factura electrónica para el PDF (si la venta está facturada). */
async function datosFiscales(
  c: { tipo: number; puntoVenta: number; numero: number | null; cae: string | null; caeVencimiento: Date | null; fecha: Date; importeTotal: number; importeNeto: number; importeIva: number; docTipo: number; docNro: string; receptorNombre: string | null; condicionIvaReceptor: number; entorno: string } | undefined,
  config: { cuit: string | null; razonSocial: string | null; condicionIva: string | null; domicilioFiscal: string | null; ingresosBrutos: string | null; inicioActividades: Date | null }
): Promise<DatosFiscalesComprobante | null> {
  if (!c || c.numero == null || !c.cae || !c.caeVencimiento || !config.cuit) return null;
  const url = urlQrArca({
    fecha: c.fecha, cuitEmisor: config.cuit, puntoVenta: c.puntoVenta, tipo: c.tipo, numero: c.numero,
    importeTotal: c.importeTotal, docTipo: c.docTipo, docNro: c.docNro, cae: c.cae,
  });
  return {
    letra: LETRA_TIPO[c.tipo] ?? "",
    codigo: c.tipo,
    numero: numeroFormateado(c.puntoVenta, c.numero),
    cae: c.cae,
    caeVencimiento: c.caeVencimiento,
    qrDataUrl: await qrComoImagen(url),
    enPrueba: c.entorno !== "PRODUCCION",
    emisor: {
      razonSocial: config.razonSocial ?? "",
      cuit: config.cuit,
      condicion: CONDICION_EMISOR[config.condicionIva ?? ""] ?? "",
      domicilio: config.domicilioFiscal ?? "",
      ingresosBrutos: config.ingresosBrutos,
      inicioActividades: config.inicioActividades,
    },
    receptor: {
      nombre: c.receptorNombre ?? "Consumidor Final",
      documento: c.docTipo === DOC_TIPO.SIN_IDENTIFICAR ? "Sin identificar" : `${NOMBRE_DOC[c.docTipo] ?? "Doc."} ${c.docNro}`,
      condicion: CONDICION_RECEPTOR[c.condicionIvaReceptor] ?? "Consumidor Final",
    },
    neto: c.importeNeto,
    iva: c.importeIva,
  };
}
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { ComprobanteVentaDocument, type ComprobanteVentaData } from "@/lib/pdf/ComprobanteVentaDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const empresaId = await obtenerEmpresaIdActual();
  const { id } = await params;
  const ventaId = Number(id);

  if (Number.isNaN(ventaId)) {
    return NextResponse.json({ error: "ID de venta inválido" }, { status: 400 });
  }

  const [venta, configuracion] = await Promise.all([
    prisma.venta.findFirst({
      where: { id: ventaId, empresaId },
      include: {
        cliente: { select: { nombre: true, apellido: true } },
        comprobantes: { where: { estado: "AUTORIZADO", tipo: { in: [1, 6, 11] } }, orderBy: { id: "desc" }, take: 1 },
        items: {
          include: {
            producto: { select: { nombre: true } },
          },
        },
        pagos: {
          include: {
            cuenta: { select: { tipo: true } },
          },
        },
      },
    }),
    obtenerConfiguracion(),
  ]);

  if (!venta) {
    return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  }

  const data: ComprobanteVentaData = {
    id: venta.id,
    fecha: venta.fecha,
    clienteNombre: venta.cliente
      ? `${venta.cliente.nombre}${venta.cliente.apellido ? " " + venta.cliente.apellido : ""}`
      : null,
    items: venta.items.map((item) => ({
      nombre: item.producto?.nombre ?? item.descripcionLibre ?? "Producto",
      tipoPrecio: item.tipoPrecio,
      cantidad: item.cantidad,
      precioUnitarioARS: item.precioUnitarioUSD * venta.cotizacionUsada,
    })),
    totalARS: venta.totalARS,
    montoPagado: venta.montoPagado,
    estadoPago: venta.estadoPago,
    pagos: venta.pagos.map((p) => ({ monto: p.monto, tipoCuenta: p.cuenta.tipo })),
    fiscal: await datosFiscales(venta.comprobantes[0], configuracion),
  };

  const buffer = await renderToBuffer(<ComprobanteVentaDocument venta={data} configuracion={configuracion} />);

  const filename = `comprobante-venta-${String(venta.id).padStart(6, "0")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}