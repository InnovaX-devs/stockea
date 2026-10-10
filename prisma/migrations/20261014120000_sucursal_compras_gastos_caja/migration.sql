-- Sucursal en compras, gastos, movimientos de caja y cuentas (issue #33).
-- Todo lo existente queda en la sucursal principal de cada empresa.
-- Las cuentas existentes quedan COMPARTIDAS (sin sucursal), así siguen
-- disponibles en todas las sucursales como hasta ahora.

ALTER TABLE "Compra" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "Compra_sucursalId_idx" ON "Compra"("sucursalId");
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Gasto" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "Gasto_sucursalId_idx" ON "Gasto"("sucursalId");
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MovimientoCaja" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "MovimientoCaja_sucursalId_idx" ON "MovimientoCaja"("sucursalId");
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Cuenta" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "Cuenta_sucursalId_idx" ON "Cuenta"("sucursalId");
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Movimientos de una venta: la sucursal de esa venta.
UPDATE "MovimientoCaja" m SET "sucursalId" = v."sucursalId"
FROM "Venta" v WHERE v."id" = m."ventaId" AND m."sucursalId" IS NULL;

UPDATE "Compra" x SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = x."empresaId" AND x."sucursalId" IS NULL;

UPDATE "Gasto" x SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = x."empresaId" AND x."sucursalId" IS NULL;

UPDATE "MovimientoCaja" x SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = x."empresaId" AND x."sucursalId" IS NULL;
