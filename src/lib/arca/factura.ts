import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { obtenerAuth } from "./ticket";
import { consultarComprobante, solicitarCae, TIPO_COMPROBANTE, ultimoAutorizado, type AlicuotaIva } from "./wsfe";
import type { Entorno } from "./wsaa";

/**
 * Facturación de ventas (etapa 3).
 *
 * Reglas:
 * - Monotributo / Exento → Factura C (no discrimina IVA).
 * - Responsable Inscripto → A si el receptor es RI (con CUIT), B para el resto.
 * - Sin documento → Consumidor Final sin identificar (DocTipo 99, DocNro 0).
 *   Desde TOPE_CONSUMIDOR_FINAL hay que identificarlo (DNI, CUIL o CUIT).
 * - Los precios de Stockea INCLUYEN IVA: en A/B el neto se calcula hacia atrás.
 *
 * ARCA nunca se llama dentro de una transacción de base de datos.
 */

/** RG 5700/2025, vigente con la RG 5824/2026. Revisar si ARCA lo cambia. */
export const TOPE_CONSUMIDOR_FINAL = 10_000_000;

export const DOC_TIPO = { CUIT: 80, CUIL: 86, DNI: 96, SIN_IDENTIFICAR: 99 } as const;

/** Códigos de condición frente al IVA del receptor (obligatorio en el pedido). */
export const CONDICION_RECEPTOR = { RESPONSABLE_INSCRIPTO: 1, EXENTO: 4, CONSUMIDOR_FINAL: 5, MONOTRIBUTO: 6 } as const;

/** Alícuota % → código de ARCA. */
const ID_ALICUOTA: Record<string, number> = { "0": 3, "2.5": 9, "5": 8, "10.5": 4, "21": 5, "27": 6 };

export const NOMBRE_TIPO: Record<number, string> = {
  1: "Factura A",
  3: "Nota de crédito A",
  6: "Factura B",
  8: "Nota de crédito B",
  11: "Factura C",
  13: "Nota de crédito C",
};
export const LETRA_TIPO: Record<number, string> = { 1: "A", 3: "A", 6: "B", 8: "B", 11: "C", 13: "C" };

type CondicionEmisor = "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO" | "EXENTO";
type CondicionCliente = keyof typeof CONDICION_RECEPTOR;

const r2 = (v: number) => Math.round(v * 100) / 100;

export class FacturaError extends Error {}

export function tipoDeFactura(emisor: CondicionEmisor, receptor: CondicionCliente) {
  if (emisor !== "RESPONSABLE_INSCRIPTO") return TIPO_COMPROBANTE.FACTURA_C;
  return receptor === "RESPONSABLE_INSCRIPTO" ? TIPO_COMPROBANTE.FACTURA_A : TIPO_COMPROBANTE.FACTURA_B;
}

/**
 * Neto e IVA a partir de precios con IVA incluido. El descuento de la venta
 * se reparte en proporción. Los redondeos se ajustan para que
 * neto + IVA = total exacto (ARCA lo valida).
 */
export function calcularImportes(params: {
  lineas: { importe: number; alicuota: number }[];
  total: number;
  discrimina: boolean;
}): { neto: number; iva: number; alicuotas: AlicuotaIva[] } {
  const total = r2(params.total);
  if (!params.discrimina) return { neto: total, iva: 0, alicuotas: [] };

  const suma = params.lineas.reduce((a, l) => a + l.importe, 0);
  const factor = suma > 0 ? total / suma : 0;
  const porAlicuota = new Map<number, number>();
  for (const l of params.lineas) {
    if (ID_ALICUOTA[String(l.alicuota)] == null) {
      throw new FacturaError(`Alícuota de IVA no válida: ${l.alicuota}%. Usá 0, 2,5, 5, 10,5, 21 o 27.`);
    }
    porAlicuota.set(l.alicuota, (porAlicuota.get(l.alicuota) ?? 0) + l.importe * factor);
  }
  const alicuotas = [...porAlicuota.entries()]
    .map(([alicuota, bruto]) => {
      const base = r2(bruto / (1 + alicuota / 100));
      return { id: ID_ALICUOTA[String(alicuota)], base, importe: r2(bruto - base) };
    })
    .sort((a, b) => b.base - a.base);
  if (alicuotas.length === 0) return { neto: total, iva: 0, alicuotas: [] };

  const diferencia = r2(total - alicuotas.reduce((a, x) => a + x.base + x.importe, 0));
  if (diferencia !== 0) alicuotas[0].base = r2(alicuotas[0].base + diferencia);

  return {
    neto: r2(alicuotas.reduce((a, x) => a + x.base, 0)),
    iva: r2(alicuotas.reduce((a, x) => a + x.importe, 0)),
    alicuotas,
  };
}

export type DocumentoReceptor = { tipo: "CUIT" | "CUIL" | "DNI"; numero: string };

/** Receptor de la factura: del cliente, del documento cargado al facturar, o consumidor final. */
export function receptorDeFactura(params: {
  cliente: { nombre: string; apellido: string | null; tipoDocumento: string | null; numeroDocumento: string | null; condicionIva: string | null } | null;
  documento?: DocumentoReceptor | null;
  total: number;
}) {
  const doc =
    params.documento ??
    (params.cliente?.tipoDocumento && params.cliente.numeroDocumento
      ? { tipo: params.cliente.tipoDocumento as DocumentoReceptor["tipo"], numero: params.cliente.numeroDocumento }
      : null);
  const nombre = params.cliente ? [params.cliente.nombre, params.cliente.apellido].filter(Boolean).join(" ") : null;

  if (!doc) {
    if (params.total >= TOPE_CONSUMIDOR_FINAL) {
      throw new FacturaError(
        `ARCA exige identificar al comprador en ventas de $${TOPE_CONSUMIDOR_FINAL.toLocaleString("es-AR")} o más. Cargá su DNI, CUIL o CUIT.`
      );
    }
    return { docTipo: DOC_TIPO.SIN_IDENTIFICAR, docNro: "0", nombre, condicion: "CONSUMIDOR_FINAL" as CondicionCliente };
  }
  // Un DNI siempre es consumidor final; CUIT/CUIL usa la condición del cliente.
  const condicion: CondicionCliente =
    doc.tipo === "DNI" ? "CONSUMIDOR_FINAL" : ((params.cliente?.condicionIva as CondicionCliente | null) ?? "CONSUMIDOR_FINAL");
  return { docTipo: DOC_TIPO[doc.tipo], docNro: doc.numero, nombre, condicion };
}

export function fechaArca(d: Date) {
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}
const fechaDeArca = (yyyymmdd: string) => new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00-03:00`);

/**
 * Prepara (o rehace) el comprobante de una venta en estado PENDIENTE.
 * No llama a ARCA. Devuelve el id del comprobante.
 */
export async function prepararFacturaDeVenta(empresaId: number, ventaId: number, documento?: DocumentoReceptor | null) {
  const config = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId } });
  if (!config.facturacionHabilitada) throw new FacturaError("La facturación electrónica no está activada en Configuración.");
  if (!config.cuit || !config.condicionIva || !config.puntoVenta || !config.arcaCertificado) {
    throw new FacturaError("Faltan datos fiscales o el certificado en Configuración → Facturación.");
  }

  const venta = await prisma.venta.findFirst({
    where: { id: ventaId, empresaId },
    include: { cliente: true, items: { include: { producto: { select: { alicuotaIva: true } } } }, comprobantes: true },
  });
  if (!venta) throw new FacturaError("La venta no existe.");
  if (venta.estadoPago === "ANULADA" || venta.estadoPago === "CANCELADA") throw new FacturaError("No se puede facturar una venta anulada.");

  const facturas = venta.comprobantes.filter((c) => [1, 6, 11].includes(c.tipo));
  const autorizada = facturas.find((c) => c.estado === "AUTORIZADO");
  if (autorizada) return { comprobanteId: autorizada.id, yaAutorizada: true };

  const total = r2(Math.round(venta.totalARS));
  if (total <= 0) throw new FacturaError("La venta no tiene importe para facturar.");
  const receptor = receptorDeFactura({ cliente: venta.cliente, documento, total });
  const tipo = tipoDeFactura(config.condicionIva as CondicionEmisor, receptor.condicion);
  if (tipo === TIPO_COMPROBANTE.FACTURA_A && receptor.docTipo !== DOC_TIPO.CUIT) {
    throw new FacturaError("Para una Factura A el cliente tiene que tener CUIT.");
  }
  const importes = calcularImportes({
    discrimina: tipo !== TIPO_COMPROBANTE.FACTURA_C,
    total,
    lineas: venta.items.map((it) => ({
      importe: it.cantidad * it.precioUnitarioUSD * venta.cotizacionUsada,
      alicuota: it.producto?.alicuotaIva ?? 21,
    })),
  });

  const datos = {
    estado: "PENDIENTE" as const,
    entorno: config.arcaEntorno,
    tipo,
    puntoVenta: config.puntoVenta,
    fecha: new Date(),
    docTipo: receptor.docTipo,
    docNro: receptor.docNro,
    receptorNombre: receptor.nombre,
    condicionIvaReceptor: CONDICION_RECEPTOR[receptor.condicion],
    importeTotal: total,
    importeNeto: importes.neto,
    importeIva: importes.iva,
    detalleIva: importes.alicuotas,
    error: null,
  };

  // Un intento anterior que quedó PENDIENTE con número puede haber sido
  // aprobado por ARCA sin que llegara la respuesta: se reusa tal cual para
  // consultarlo antes de pedir otro número (ver emitirComprobante).
  const pendienteConNumero = facturas.find((c) => c.estado === "PENDIENTE" && c.numero != null);
  if (pendienteConNumero) return { comprobanteId: pendienteConNumero.id, yaAutorizada: false };

  const reutilizable = facturas.find((c) => c.estado !== "AUTORIZADO");
  const comp = reutilizable
    ? await prisma.comprobante.update({ where: { id: reutilizable.id }, data: { ...datos, numero: null } })
    : await prisma.comprobante.create({ data: { ...datos, empresaId, ventaId } });
  return { comprobanteId: comp.id, yaAutorizada: false };
}

/**
 * Pide el CAE a ARCA para un comprobante PENDIENTE. Nunca factura dos veces:
 * si un intento anterior ya tenía número, primero consulta si ARCA lo aprobó.
 */
export async function emitirComprobante(empresaId: number, comprobanteId: number) {
  let comp = await prisma.comprobante.findFirstOrThrow({ where: { id: comprobanteId, empresaId } });
  if (comp.estado === "AUTORIZADO") return comp;

  const { auth, entorno } = await obtenerAuth(empresaId);
  // Nota de crédito: datos de la factura que anula.
  let asociado: { tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string } | null = null;
  if (comp.comprobanteAsociadoId) {
    const factura = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.comprobanteAsociadoId } });
    if (factura.numero == null) throw new FacturaError("La factura asociada no tiene número.");
    asociado = { tipo: factura.tipo, puntoVenta: factura.puntoVenta, numero: factura.numero, cuit: auth.cuit, fecha: fechaArca(factura.fecha) };
  }
  if (comp.entorno !== entorno) {
    throw new FacturaError("El comprobante es de otro entorno (prueba/producción). Volvé a facturar la venta.");
  }
  const marcar = (data: Parameters<typeof prisma.comprobante.update>[0]["data"]) =>
    prisma.comprobante.update({ where: { id: comp.id }, data });

  // 1) Recuperación: ¿ARCA ya lo aprobó en un intento que se cortó?
  if (comp.numero != null) {
    const existente = await consultarComprobante(entorno, auth, comp.puntoVenta, comp.tipo, comp.numero).catch(() => null);
    if (existente && Math.abs(existente.importeTotal - comp.importeTotal) < 0.01) {
      return marcar({ estado: "AUTORIZADO", cae: existente.cae, caeVencimiento: fechaDeArca(existente.vencimiento), error: null });
    }
  }

  // 2) Pedido normal. Si ARCA dice que el número no es el siguiente (otro
  //    comprobante se emitió en el medio), se reintenta una vez.
  for (let intento = 0; intento < 2; intento++) {
    const numero = (await ultimoAutorizado(entorno, auth, comp.puntoVenta, comp.tipo)) + 1;
    try {
      comp = await marcar({ numero, intentos: { increment: 1 }, fecha: new Date() });
    } catch (e: any) {
      if (e?.code === "P2002" && intento === 0) continue; // otro comprobante tomó el número
      throw e;
    }
    let respuesta;
    try {
      respuesta = await solicitarCae(entorno, auth, {
        tipo: comp.tipo,
        puntoVenta: comp.puntoVenta,
        numero,
        fecha: fechaArca(comp.fecha),
        docTipo: comp.docTipo,
        docNro: comp.docNro,
        condicionIvaReceptor: comp.condicionIvaReceptor,
        importeTotal: comp.importeTotal,
        importeNeto: comp.importeNeto,
        importeIva: comp.importeIva,
        alicuotas: (comp.detalleIva as AlicuotaIva[] | null) ?? [],
        asociado,
      });
    } catch (e) {
      // Sin respuesta: queda PENDIENTE con su número para consultarlo al reintentar.
      await marcar({ error: e instanceof Error ? e.message : "ARCA no respondió." });
      throw e;
    }
    if (respuesta.resultado === "A") {
      return marcar({
        estado: "AUTORIZADO",
        cae: respuesta.cae,
        caeVencimiento: fechaDeArca(respuesta.vencimiento),
        error: respuesta.observaciones.length ? respuesta.observaciones.join(" | ") : null,
      });
    }
    const noCorrelativo = respuesta.errores.some((e) => e.codigo === "10016");
    if (noCorrelativo && intento === 0) continue;
    return marcar({
      estado: "RECHAZADO",
      numero: null, // el número no se usó
      error: respuesta.errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(" | "),
    });
  }
  return prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
}

/** Nota de crédito que corresponde a cada factura. */
const NC_DE: Record<number, number> = {
  [TIPO_COMPROBANTE.FACTURA_A]: TIPO_COMPROBANTE.NOTA_CREDITO_A,
  [TIPO_COMPROBANTE.FACTURA_B]: TIPO_COMPROBANTE.NOTA_CREDITO_B,
  [TIPO_COMPROBANTE.FACTURA_C]: TIPO_COMPROBANTE.NOTA_CREDITO_C,
};
export const TIPOS_FACTURA = [1, 6, 11];
export const TIPOS_NOTA_CREDITO = [3, 8, 13];

type NotaPreparada = { omitida: true; motivo: string } | { omitida: false; comprobanteId: number; yaAutorizada: boolean };

/**
 * Prepara la nota de crédito de una venta anulada que tenía factura.
 * - Sin factura autorizada: no hace falta (null).
 * - Factura de PRUEBA y el negocio ya está en PRODUCCIÓN: se omite (esa factura nunca fue real).
 * - Si ya hay una nota de crédito autorizada para esa factura, se devuelve esa (no se duplica).
 * No requiere tener la facturación "activada": anular siempre tiene que poder hacerse.
 */
export async function prepararNotaCreditoDeVenta(empresaId: number, ventaId: number): Promise<NotaPreparada | null> {
  const factura = await prisma.comprobante.findFirst({
    where: { ventaId, empresaId, estado: "AUTORIZADO", tipo: { in: TIPOS_FACTURA } },
    orderBy: { id: "desc" },
    include: { notasCredito: true },
  });
  if (!factura) return null;

  const config = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId } });
  if (factura.entorno === "HOMOLOGACION" && config.arcaEntorno === "PRODUCCION") {
    return { omitida: true, motivo: "La factura era de prueba: no necesita nota de crédito." };
  }
  if (factura.entorno !== config.arcaEntorno) {
    throw new FacturaError("La factura se emitió en producción: volvé a ese entorno para emitir la nota de crédito.");
  }
  if (!config.arcaCertificado) throw new FacturaError("Falta el certificado de ARCA para emitir la nota de crédito.");

  const autorizada = factura.notasCredito.find((n) => n.estado === "AUTORIZADO");
  if (autorizada) return { omitida: false, comprobanteId: autorizada.id, yaAutorizada: true };
  const pendienteConNumero = factura.notasCredito.find((n) => n.estado === "PENDIENTE" && n.numero != null);
  if (pendienteConNumero) return { omitida: false, comprobanteId: pendienteConNumero.id, yaAutorizada: false };

  const datos = {
    estado: "PENDIENTE" as const,
    entorno: factura.entorno,
    tipo: NC_DE[factura.tipo],
    puntoVenta: factura.puntoVenta,
    fecha: new Date(),
    docTipo: factura.docTipo,
    docNro: factura.docNro,
    receptorNombre: factura.receptorNombre,
    condicionIvaReceptor: factura.condicionIvaReceptor,
    importeTotal: factura.importeTotal,
    importeNeto: factura.importeNeto,
    importeIva: factura.importeIva,
    detalleIva: factura.detalleIva ?? undefined,
    comprobanteAsociadoId: factura.id,
    error: null,
  };
  const reutilizable = factura.notasCredito.find((n) => n.estado !== "AUTORIZADO");
  const nc = reutilizable
    ? await prisma.comprobante.update({ where: { id: reutilizable.id }, data: { ...datos, numero: null } })
    : await prisma.comprobante.create({ data: { ...datos, empresaId, ventaId } });
  return { omitida: false, comprobanteId: nc.id, yaAutorizada: false };
}

/**
 * Después de anular una venta: emite su nota de crédito si tenía factura.
 * Nunca lanza: devuelve un mensaje para mostrar (éxito o motivo del fallo).
 */
export async function notaCreditoTrasAnular(empresaId: number, ventaId: number): Promise<{ ok: boolean; mensaje: string } | null> {
  try {
    const preparada = await prepararNotaCreditoDeVenta(empresaId, ventaId);
    if (!preparada) return null;
    if (preparada.omitida) return { ok: true, mensaje: preparada.motivo };
    const nc = preparada.yaAutorizada
      ? await prisma.comprobante.findUniqueOrThrow({ where: { id: preparada.comprobanteId } })
      : await emitirComprobante(empresaId, preparada.comprobanteId);
    if (nc.estado === "AUTORIZADO" && nc.numero != null) {
      return { ok: true, mensaje: `${NOMBRE_TIPO[nc.tipo] ?? "Nota de crédito"} ${numeroFormateado(nc.puntoVenta, nc.numero)} emitida.` };
    }
    return { ok: false, mensaje: `ARCA rechazó la nota de crédito: ${nc.error ?? "sin motivo"}. Reintentala desde el historial.` };
  } catch (e) {
    return {
      ok: false,
      mensaje: `No se pudo emitir la nota de crédito (${e instanceof Error ? e.message : "error"}). Reintentala desde el historial.`,
    };
  }
}

/** Contenido del QR que exige ARCA (especificación del QR de comprobantes). */
export function urlQrArca(c: {
  fecha: Date; cuitEmisor: string; puntoVenta: number; tipo: number; numero: number;
  importeTotal: number; docTipo: number; docNro: string; cae: string;
}) {
  const datos = {
    ver: 1,
    fecha: `${fechaArca(c.fecha).slice(0, 4)}-${fechaArca(c.fecha).slice(4, 6)}-${fechaArca(c.fecha).slice(6, 8)}`,
    cuit: Number(c.cuitEmisor),
    ptoVta: c.puntoVenta,
    tipoCmp: c.tipo,
    nroCmp: c.numero,
    importe: c.importeTotal,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: c.docTipo,
    nroDocRec: Number(c.docNro),
    tipoCodAut: "E",
    codAut: Number(c.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString("base64")}`;
}

export async function qrComoImagen(url: string) {
  return QRCode.toDataURL(url, { margin: 0, width: 240 });
}

export const numeroFormateado = (puntoVenta: number, numero: number) =>
  `${String(puntoVenta).padStart(5, "0")}-${String(numero).padStart(8, "0")}`;

export type EntornoComprobante = Entorno;
