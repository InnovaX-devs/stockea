/**
 * Genera los íconos de la app (PWA, pantalla de inicio del celular, iPhone)
 * a partir de public/icons/icon.svg. Correr después de cambiar el logo:
 *
 *   node scripts/generar-iconos.mjs
 *
 * Usa `sharp`, que ya es dependencia del proyecto.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const ORIGEN = "public/icons/icon.svg";
const FONDO = "#15803d"; // verde de la marca, para el ícono "maskable"

const svg = await readFile(ORIGEN);

// Íconos normales (el SVG ya trae su fondo redondeado).
for (const [tamaño, destino] of [
  [192, "public/icons/icon-192.png"],
  [512, "public/icons/icon-512.png"],
  [180, "public/icons/apple-touch-icon.png"],
]) {
  await sharp(svg, { density: 512 }).resize(tamaño, tamaño).png().toFile(destino);
  console.log("✔", destino);
}

// "Maskable": Android lo recorta en círculo o en otras formas, así que el
// dibujo va más chico (80 %) sobre un fondo lleno, sin bordes transparentes.
const interior = await sharp(svg, { density: 512 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: FONDO } })
  .composite([{ input: interior, gravity: "center" }])
  .png()
  .toFile("public/icons/icon-maskable-512.png");
console.log("✔ public/icons/icon-maskable-512.png");
