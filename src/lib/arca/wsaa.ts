import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { enviarSoap, escaparXml } from "./http";

/**
 * WSAA: el "login" de ARCA. Se firma un pedido (TRA) con el certificado del
 * negocio y ARCA devuelve un ticket de acceso (token + sign) que vale ~12 h.
 * Ese ticket se guarda y se reusa: ARCA rechaza pedir uno nuevo mientras el
 * anterior sigue vigente.
 */

export type Entorno = "HOMOLOGACION" | "PRODUCCION";

export const URL_WSAA: Record<Entorno, string> = {
  HOMOLOGACION: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  PRODUCCION: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });

/** Fecha en hora de Argentina con offset explícito (como la espera ARCA). */
function fechaAR(d: Date) {
  const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return ar.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

export function crearTRA(servicio = "wsfe", ahora = new Date()) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${fechaAR(new Date(ahora.getTime() - 10 * 60 * 1000))}</generationTime>` +
    `<expirationTime>${fechaAR(new Date(ahora.getTime() + 10 * 60 * 1000))}</expirationTime>` +
    `</header><service>${servicio}</service></loginTicketRequest>`
  );
}

/** Firma el TRA en formato CMS (PKCS#7 con el contenido adentro), en base64. */
export function firmarTRA(tra: string, certificadoPem: string, clavePrivadaPem: string): string {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  const cert = forge.pki.certificateFromPem(certificadoPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clavePrivadaPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

export class ArcaError extends Error {
  constructor(mensaje: string, public codigo?: string) {
    super(mensaje);
  }
}

function errorSoap(xml: string): ArcaError | null {
  const env = parser.parse(xml)?.Envelope?.Body?.Fault;
  if (!env) return null;
  const codigo = String(env.faultcode ?? "");
  const texto = String(env.faultstring ?? "Error desconocido de ARCA");
  if (codigo.includes("alreadyAuthenticated")) {
    return new ArcaError(
      "ARCA ya entregó un ticket de acceso para este certificado hace poco y todavía no venció. Esperá unos minutos y probá de nuevo.",
      "YA_AUTENTICADO"
    );
  }
  if (codigo.includes("cms.cert.untrusted") || codigo.includes("cms.cert.notFound")) {
    return new ArcaError("ARCA no reconoce el certificado. Revisá que sea del entorno correcto (prueba o producción).", "CERTIFICADO");
  }
  if (codigo.includes("notAuthorized")) {
    return new ArcaError(
      "El certificado no está autorizado para facturar. En ARCA, asocialo al servicio \"Facturación Electrónica\" (wsfe).",
      "NO_AUTORIZADO"
    );
  }
  return new ArcaError(`ARCA respondió: ${texto}`, codigo);
}

export async function loginCms(cms: string, entorno: Entorno) {
  const cuerpo =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${escaparXml(cms)}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const respuesta = await enviarSoap(URL_WSAA[entorno], "", cuerpo);
  const falla = errorSoap(respuesta);
  if (falla) throw falla;

  const ret = parser.parse(respuesta)?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;
  if (!ret) throw new ArcaError("Respuesta inesperada de ARCA al iniciar sesión.");
  const ticket = parser.parse(String(ret))?.loginTicketResponse;
  const token = ticket?.credentials?.token;
  const sign = ticket?.credentials?.sign;
  const vence = ticket?.header?.expirationTime;
  if (!token || !sign || !vence) throw new ArcaError("ARCA no devolvió el ticket de acceso.");
  return { token: String(token), sign: String(sign), vence: new Date(String(vence)) };
}
