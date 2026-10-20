-- RV-8: el contenido del producto pasa de "ml" a cantidad + unidad.
-- Compatible con el código viejo en producción: se agregan columnas opcionales
-- y NO se toca "contenidoMl" (el código viejo lo sigue leyendo y escribiendo).
-- Se borra en una migración posterior, cuando ya no quede código que lo use.

-- CreateEnum
CREATE TYPE "UnidadContenido" AS ENUM ('ML', 'L', 'G', 'KG');

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "contenido" DOUBLE PRECISION,
ADD COLUMN     "unidadContenido" "UnidadContenido";

-- Los productos que ya tenían ml siguen mostrándolos: contenido = contenidoMl, unidad = ML.
UPDATE "Producto"
SET "contenido" = "contenidoMl",
    "unidadContenido" = 'ML'
WHERE "contenidoMl" IS NOT NULL;
