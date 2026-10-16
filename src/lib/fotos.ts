/**
 * Fotos de productos: todas se suben a Vercel Blob (POST /api/upload).
 *
 * Solo se aceptan / descargan URLs de ahí. Sin este control, un fotoUrl
 * cargado a mano (por la API) podría hacer que el servidor descargue
 * cualquier dirección —incluso internas— al armar el catálogo en PDF.
 */
export function esFotoPermitida(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
