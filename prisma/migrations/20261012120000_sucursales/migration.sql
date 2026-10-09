-- Sucursales (issue #30): cada empresa pasa a tener al menos una sucursal.
-- Las empresas existentes reciben una "Principal" y sus empleados quedan
-- asignados a ella, así los negocios de un solo local no notan ningún cambio.

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sucursal_empresaId_nombre_key" ON "Sucursal"("empresaId", "nombre");
CREATE INDEX "Sucursal_empresaId_idx" ON "Sucursal"("empresaId");

ALTER TABLE "Sucursal" ADD CONSTRAINT "Sucursal_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Usuario.sucursalId
ALTER TABLE "Usuario" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "Usuario_sucursalId_idx" ON "Usuario"("sucursalId");
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una "Principal" por empresa existente.
INSERT INTO "Sucursal" ("nombre", "empresaId")
SELECT 'Principal', e."id" FROM "Empresa" e
WHERE NOT EXISTS (SELECT 1 FROM "Sucursal" s WHERE s."empresaId" = e."id");

-- Los empleados actuales quedan en la Principal de su empresa.
UPDATE "Usuario" u
SET "sucursalId" = s."id"
FROM "Sucursal" s
WHERE s."empresaId" = u."empresaId" AND u."rol" = 'EMPLEADO' AND u."sucursalId" IS NULL;
