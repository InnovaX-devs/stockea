import forge from "node-forge";

/** CUIT: 11 dígitos con dígito verificador válido. Acepta guiones o espacios. */
export function normalizarCuit(cuit: string): string | null {
  const limpio = cuit.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(limpio)) return null;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(limpio[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return null;
  return dv === Number(limpio[10]) ? limpio : null;
}

/**
 * Genera la clave privada (RSA 2048) y la solicitud de certificado (CSR) en
 * el formato que pide ARCA: país AR, organización = razón social,
 * nombre = alias del sistema y serialNumber = "CUIT nnnnnnnnnnn".
 */
export function generarClaveYCsr(params: { cuit: string; razonSocial: string; alias?: string }) {
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: params.razonSocial.slice(0, 64) },
    { name: "commonName", value: (params.alias ?? "stockea").slice(0, 64) },
    { type: "2.5.4.5", value: `CUIT ${params.cuit}` }, // serialNumber
  ]);
  csr.sign(privateKey, forge.md.sha256.create());
  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(privateKey),
    csrPem: forge.pki.certificationRequestToPem(csr),
  };
}

/**
 * Verifica el certificado que devolvió ARCA: que sea un certificado válido,
 * que corresponda a NUESTRA clave privada y que no esté vencido.
 */
export function validarCertificado(certificadoPem: string, clavePrivadaPem: string) {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificadoPem.trim());
  } catch {
    throw new Error("El texto pegado no es un certificado válido. Copiá el contenido completo del archivo .crt, incluidas las líneas BEGIN y END.");
  }
  const clave = forge.pki.privateKeyFromPem(clavePrivadaPem) as forge.pki.rsa.PrivateKey;
  const publica = cert.publicKey as forge.pki.rsa.PublicKey;
  if (publica.n.compareTo(clave.n) !== 0) {
    throw new Error("Este certificado no corresponde a la solicitud generada en Stockea. Descargá la solicitud (CSR) de nuevo y volvé a generarlo en ARCA.");
  }
  const vence = cert.validity.notAfter;
  if (vence < new Date()) throw new Error("El certificado está vencido. Generá uno nuevo en ARCA.");
  const serial = cert.subject.getField({ type: "2.5.4.5" })?.value as string | undefined;
  return { vence, cuit: serial?.replace(/\D/g, "") || null };
}
