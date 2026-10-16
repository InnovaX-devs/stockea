import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import sharp from "sharp";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fotoUrlAnterior = formData.get("fotoUrlAnterior") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó ningún archivo" },
        { status: 400 }
      );
    }

    // Validar tipo de archivo (JPG / PNG)
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "El formato del archivo debe ser JPG, PNG o WEBP" },
        { status: 400 }
      );
    }

    // La foto anterior ya NO se borra acá: se borra en PUT /api/productos/[id]
    // recién cuando el producto se guardó bien (si no, si el guardado fallaba,
    // el producto quedaba apuntando a una foto que ya no existe).
    void fotoUrlAnterior;

    // WebP se convierte a JPEG: el catálogo en PDF (@react-pdf/renderer) solo
    // soporta JPG/PNG, así que guardamos siempre un formato compatible.
    let contenido: File | Buffer = file;
    let nombre = file.name.replace(/\s+/g, "_");
    let contentType = file.type;
    if (file.type === "image/webp") {
      contenido = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .flatten({ background: "#ffffff" }) // JPEG no tiene transparencia
        .jpeg({ quality: 90 })
        .toBuffer();
      nombre = nombre.replace(/\.webp$/i, "") + ".jpg";
      contentType = "image/jpeg";
    }

    // 2. Subir el nuevo archivo a Vercel Blob
    const filename = `productos/${Date.now()}-${nombre}`;
    const blob = await put(filename, contenido, {
      access: "public",
      contentType,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error("Error al subir imagen:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar la imagen" },
      { status: 500 }
    );
  }
}