-- CreateEnum
CREATE TYPE "Rubro" AS ENUM ('GENERAL', 'ALMACEN', 'PERFUMERIA', 'ROPA');

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "rubro" "Rubro" NOT NULL DEFAULT 'GENERAL';

-- Las empresas que hoy usan ml quedan en PERFUMERIA para no ver ningún cambio.
-- Se detectan SOLO por datos (algún producto con contenidoMl cargado), no por
-- nombre. El resto queda en GENERAL (el default).
-- OJO: una empresa que no sea perfumería pero tenga ml cargados (ej. Nutri
-- Express, una dietética) también cae acá. Después de migrar, cambiarle el
-- rubro desde el panel InnovaX (ej. a ALMACEN): no se pierde ningún dato.
UPDATE "Configuracion" c
SET "rubro" = 'PERFUMERIA'
WHERE EXISTS (
  SELECT 1 FROM "Producto" p
  WHERE p."empresaId" = c."empresaId" AND p."contenidoMl" IS NOT NULL
);
