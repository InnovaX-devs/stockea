import https from "node:https";

/**
 * POST SOAP a ARCA. Se usa https de Node (no fetch) porque los servidores de
 * ARCA usan parámetros de seguridad viejos que OpenSSL 3 rechaza por defecto
 * ("dh key too small"): SECLEVEL=1 los acepta solo para estas conexiones.
 *
 * `enviarSoap` se puede reemplazar en las pruebas (setEnviarSoap).
 */
export type EnviarSoap = (url: string, soapAction: string, cuerpo: string) => Promise<string>;

const agente = new https.Agent({ keepAlive: true, ciphers: "DEFAULT@SECLEVEL=1" });

const enviarReal: EnviarSoap = (url, soapAction, cuerpo) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent: agente,
        timeout: 20_000,
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: soapAction, "Content-Length": Buffer.byteLength(cuerpo) },
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (d) => partes.push(d));
        res.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
      }
    );
    req.on("timeout", () => req.destroy(new Error("ARCA no respondió a tiempo. Probá de nuevo en unos minutos.")));
    req.on("error", (e) => reject(new Error(`No se pudo conectar con ARCA: ${e.message}`)));
    req.end(cuerpo);
  });

let enviar: EnviarSoap = enviarReal;
export const enviarSoap: EnviarSoap = (...a) => enviar(...a);
/** Solo para pruebas. */
export function setEnviarSoap(fn: EnviarSoap | null) {
  enviar = fn ?? enviarReal;
}

export const escaparXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
