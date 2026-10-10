-- Caja y cierre por sucursal (issue #34).
-- Los turnos y cierres existentes quedan en la sucursal principal.

ALTER TABLE "SesionCaja" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "SesionCaja_sucursalId_idx" ON "SesionCaja"("sucursalId");
ALTER TABLE "SesionCaja" ADD CONSTRAINT "SesionCaja_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "SesionCaja" x SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = x."empresaId" AND x."sucursalId" IS NULL;

ALTER TABLE "CierreCaja" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "CierreCaja_sucursalId_idx" ON "CierreCaja"("sucursalId");
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "CierreCaja" x SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = x."empresaId" AND x."sucursalId" IS NULL;

-- Movimientos que quedaron sin sucursal (cierres de caja, o hechos con el
-- código anterior): a la principal, salvo que la cuenta sea de una sucursal.
UPDATE "MovimientoCaja" m SET "sucursalId" = c."sucursalId"
FROM "Cuenta" c WHERE c."id" = m."cuentaId" AND m."sucursalId" IS NULL AND c."sucursalId" IS NOT NULL;

UPDATE "MovimientoCaja" m SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = m."empresaId" AND m."sucursalId" IS NULL AND m."gastoId" IS NULL;
