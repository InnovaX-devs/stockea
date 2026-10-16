// prisma/scripts/migrar-fotos-webp.ts
//
// Script one-off: recorre todos los productos con fotoUrl cargada y, para las
// que NO están en JPEG ni PNG (ej. WebP), las descarga, las convierte a JPEG
// con sharp, las vuelve a subir a Vercel Blob, actualiza el fotoUrl en la base
// y borra el blob viejo. Las JPEG/PNG no se tocan. Es seguro correrlo más de
// una vez (lo que ya está convertido se salta).
//
// Uso:
//   npm run migrar-fotos               -> convierte
//   DRY_RUN=1 npm run migrar-fotos     -> solo lista qué convertiría, sin tocar nada

import { PrismaClient } from "@prisma/client";
import { put, del } from "@vercel/blob";
import sharp from "sharp";

const prisma = new PrismaClient();

const CONCURRENCIA = 5;
const DRY_RUN = process.env.DRY_RUN === "1";

type ResultadoItem = {
  id: number;
  nombre: string;
  estado: "convertida" | "omitida" | "error";
  detalle?: string;
};

async function migrarFoto(producto: { id: number; nombre: string; fotoUrl: string | null }): Promise<ResultadoItem> {
  const { id, nombre, fotoUrl } = producto;

  if (!fotoUrl) {
    return { id, nombre, estado: "omitida", detalle: "sin foto" };
  }

  try {
    const res = await fetch(fotoUrl);
    if (!res.ok) {
      return { id, nombre, estado: "error", detalle: `fetch falló (${res.status})` };
    }

    const arrayBuffer = await res.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const metadata = await sharp(inputBuffer).metadata();
    if (metadata.format === "jpeg" || metadata.format === "png") {
      // Ya está en un formato que soporta el PDF, no hace falta tocarla.
      return { id, nombre, estado: "omitida", detalle: `ya es ${metadata.format}` };
    }

    if (DRY_RUN) {
      return { id, nombre, estado: "convertida", detalle: `(simulacro) ${metadata.format} → jpeg` };
    }

    const jpegBuffer = await sharp(inputBuffer)
      .rotate()
      .flatten({ background: "#ffffff" }) // JPEG no tiene transparencia
      .jpeg({ quality: 90 })
      .toBuffer();

    const filename = `productos/${Date.now()}-${id}-migrado.jpg`;
    const blob = await put(filename, jpegBuffer, {
      access: "public",
      contentType: "image/jpeg",
    });

    await prisma.producto.update({
      where: { id },
      data: { fotoUrl: blob.url },
    });

    // Borramos el blob viejo (WEBP) para no dejar archivos huérfanos.
    if (fotoUrl.includes("public.blob.vercel-storage.com")) {
      try {
        await del(fotoUrl);
      } catch (err) {
        console.warn(`  ⚠ No se pudo borrar el blob viejo de "${nombre}" (id ${id}):`, err);
      }
    }

    return { id, nombre, estado: "convertida", detalle: `${metadata.format} → jpeg` };
  } catch (err: any) {
    return { id, nombre, estado: "error", detalle: err?.message ?? String(err) };
  }
}

async function main() {
  console.log(DRY_RUN ? "SIMULACRO: no se modifica nada.\n" : "");
  console.log("Buscando productos con foto...");

  const productos = await prisma.producto.findMany({
    where: { fotoUrl: { not: null } },
    select: { id: true, nombre: true, fotoUrl: true },
  });

  console.log(`Encontrados ${productos.length} productos con foto. Procesando con concurrencia ${CONCURRENCIA}...\n`);

  const resultados: ResultadoItem[] = new Array(productos.length);
  let index = 0;
  let procesados = 0;

  async function worker() {
    while (index < productos.length) {
      const i = index++;
      const producto = productos[i];
      resultados[i] = await migrarFoto(producto);
      procesados++;
      if (procesados % 20 === 0 || procesados === productos.length) {
        console.log(`  Progreso: ${procesados}/${productos.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, productos.length) }, () => worker()));

  const convertidas = resultados.filter((r) => r.estado === "convertida");
  const omitidas = resultados.filter((r) => r.estado === "omitida");
  const errores = resultados.filter((r) => r.estado === "error");

  console.log("\n--- Resumen ---");
  console.log(`Convertidas: ${convertidas.length}`);
  console.log(`Omitidas (ya eran JPEG/PNG o sin foto): ${omitidas.length}`);
  console.log(`Errores: ${errores.length}`);

  if (errores.length > 0) {
    console.log("\nProductos con error (revisar manualmente):");
    for (const e of errores) {
      console.log(`  - [id ${e.id}] ${e.nombre}: ${e.detalle}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Error fatal en el script:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });