import { XMLParser } from "fast-xml-parser";
import { enviarSoap } from "./http";
import { ArcaError, type Entorno } from "./wsaa";

/**
 * WSFEv1: el servicio de factura electrónica de ARCA: estado de los
 * servidores, último número autorizado, pedido de CAE y consulta de un
 * comprobante ya emitido.
 */

export const URL_WSFE: Record<Entorno, string> = {
  HOMOLOGACION: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  PRODUCCION: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

/** Códigos de comprobante de ARCA. */
export const TIPO_COMPROBANTE = {
  FACTURA_A: 1,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_CREDITO_C: 13,
} as const;

export type Auth = { token: string; sign: string; cuit: string };

const NS = "http://ar.gov.afip.dif.FEV1/";
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });

const authXml = (a: Auth) => `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${a.cuit}</ar:Cuit></ar:Auth>`;

async function llamar(entorno: Entorno, metodo: string, contenido: string) {
  const cuerpo =
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">` +
    `<soap:Body><ar:${metodo}>${contenido}</ar:${metodo}></soap:Body></soap:Envelope>`;
  const xml = await enviarSoap(URL_WSFE[entorno], `${NS}${metodo}`, cuerpo);
  const body = parser.parse(xml)?.Envelope?.Body;
  if (body?.Fault) throw new ArcaError(`ARCA respondió: ${body.Fault.faultstring ?? "error"}`);
  const resultado = body?.[`${metodo}Response`]?.[`${metodo}Result`];
  if (!resultado) throw new ArcaError("Respuesta inesperada del servicio de facturación de ARCA.");
  return resultado;
}

/** Errores de negocio que ARCA devuelve dentro de la respuesta. */
function lanzarErrores(resultado: any) {
  const errs = resultado?.Errors?.Err;
  if (!errs) return;
  const lista = Array.isArray(errs) ? errs : [errs];
  const texto = lista.map((e: any) => `${e.Code}: ${e.Msg}`).join(" | ");
  throw new ArcaError(`ARCA rechazó el pedido. ${texto}`, String(lista[0]?.Code ?? ""));
}

/** Estado de los servidores de ARCA (no requiere certificado). */
export async function estadoServidores(entorno: Entorno) {
  const r = await llamar(entorno, "FEDummy", "");
  return { app: String(r.AppServer), db: String(r.DbServer), auth: String(r.AuthServer) };
}

/** Último número de comprobante autorizado para un punto de venta y tipo. */
export async function ultimoAutorizado(entorno: Entorno, auth: Auth, puntoVenta: number, tipo: number) {
  const r = await llamar(
    entorno,
    "FECompUltimoAutorizado",
    `${authXml(auth)}<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`
  );
  lanzarErrores(r);
  return Number(r.CbteNro);
}

export type AlicuotaIva = { id: number; base: number; importe: number };

export type PedidoCae = {
  tipo: number;
  puntoVenta: number;
  numero: number;
  fecha: string; // yyyymmdd
  docTipo: number;
  docNro: string;
  condicionIvaReceptor: number;
  importeTotal: number;
  importeNeto: number;
  importeIva: number;
  alicuotas: AlicuotaIva[]; // vacío en Factura C
};

export type RespuestaCae =
  | { resultado: "A"; cae: string; vencimiento: string; observaciones: string[] }
  | { resultado: "R"; errores: { codigo: string; mensaje: string }[] };

const n2 = (v: number) => v.toFixed(2);

/** Pide el CAE de UN comprobante. El orden de los campos lo exige ARCA. */
export async function solicitarCae(entorno: Entorno, auth: Auth, p: PedidoCae): Promise<RespuestaCae> {
  const iva = p.alicuotas.length
    ? `<ar:Iva>${p.alicuotas
        .map((a) => `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${n2(a.base)}</ar:BaseImp><ar:Importe>${n2(a.importe)}</ar:Importe></ar:AlicIva>`)
        .join("")}</ar:Iva>`
    : "";
  const detalle =
    `<ar:Concepto>1</ar:Concepto>` + // 1 = productos
    `<ar:DocTipo>${p.docTipo}</ar:DocTipo><ar:DocNro>${p.docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${p.numero}</ar:CbteDesde><ar:CbteHasta>${p.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${p.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${n2(p.importeTotal)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc>` +
    `<ar:ImpNeto>${n2(p.importeNeto)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx>` +
    `<ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${n2(p.importeIva)}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${p.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    iva;
  const r = await llamar(
    entorno,
    "FECAESolicitar",
    `${authXml(auth)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${p.puntoVenta}</ar:PtoVta>` +
      `<ar:CbteTipo>${p.tipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>${detalle}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`
  );

  const lista = (x: any) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const det = r?.FeDetResp?.FECAEDetResponse;
  const obs = lista(det?.Observaciones?.Obs).map((o: any) => ({ codigo: String(o.Code), mensaje: String(o.Msg) }));
  const errs = lista(r?.Errors?.Err).map((e: any) => ({ codigo: String(e.Code), mensaje: String(e.Msg) }));

  if (det?.Resultado === "A" && det.CAE) {
    return { resultado: "A", cae: String(det.CAE), vencimiento: String(det.CAEFchVto), observaciones: obs.map((o) => `${o.codigo}: ${o.mensaje}`) };
  }
  const errores = [...errs, ...obs];
  return { resultado: "R", errores: errores.length ? errores : [{ codigo: "?", mensaje: "ARCA rechazó el comprobante sin dar el motivo." }] };
}

/**
 * Consulta un comprobante ya emitido. Sirve para recuperar el CAE si ARCA lo
 * aprobó pero la respuesta no llegó (corte de conexión): así no se factura dos veces.
 */
export async function consultarComprobante(entorno: Entorno, auth: Auth, puntoVenta: number, tipo: number, numero: number) {
  const r = await llamar(
    entorno,
    "FECompConsultar",
    `${authXml(auth)}<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`
  );
  const g = r?.ResultGet;
  if (!g?.CodAutorizacion) return null;
  return {
    cae: String(g.CodAutorizacion),
    vencimiento: String(g.FchVto),
    importeTotal: Number(g.ImpTotal),
    docNro: String(g.DocNro),
  };
}
