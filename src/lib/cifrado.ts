import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifrado de datos sensibles guardados en la base (la clave privada del
 * certificado de ARCA). AES-256-GCM.
 *
 * La clave sale de FACTURACION_CLAVE (recomendado: una propia, que no se
 * cambie nunca) o, si no está, de AUTH_SECRET. OJO: si se cambia la variable
 * usada, las claves guardadas ya no se pueden descifrar y cada negocio tiene
 * que generar un certificado nuevo.
 */
function clave(): Buffer {
  const secreto = process.env.FACTURACION_CLAVE ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secreto) throw new Error("Falta FACTURACION_CLAVE (o AUTH_SECRET) para cifrar los datos de facturación.");
  return createHash("sha256").update(`stockea-facturacion:${secreto}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), datos.toString("base64")].join(":");
}

export function descifrar(cifrado: string): string {
  const [version, iv, tag, datos] = cifrado.split(":");
  if (version !== "v1" || !iv || !tag || !datos) throw new Error("Dato cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(datos, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(
      "No se pudo descifrar la clave del certificado (¿cambió FACTURACION_CLAVE o AUTH_SECRET?). Generá un certificado nuevo."
    );
  }
}
