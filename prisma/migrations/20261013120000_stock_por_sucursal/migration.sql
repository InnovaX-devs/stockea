-- Stock por sucursal (issue #31).
-- El stock de cada producto pasa a guardarse por sucursal en "StockSucursal".
-- Producto.stockActual queda como TOTAL de todas las sucursales.
-- Todo el stock actual se copia a la sucursal principal (la más antigua) de
-- cada empresa, así los negocios de un solo local no notan ningún cambio.

-- CreateTable
CREATE TABLE "StockSucursal" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productoId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,

    CONSTRAINT "StockSucursal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockSucursal_productoId_sucursalId_key" ON "StockSucursal"("productoId", "sucursalId");
CREATE INDEX "StockSucursal_sucursalId_idx" ON "StockSucursal"("sucursalId");

ALTER TABLE "StockSucursal" ADD CONSTRAINT "StockSucursal_productoId_fkey"
    FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockSucursal" ADD CONSTRAINT "StockSucursal_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Venta.sucursalId (de dónde salió el stock; a dónde vuelve si se anula).
ALTER TABLE "Venta" ADD COLUMN "sucursalId" INTEGER;
CREATE INDEX "Venta_sucursalId_idx" ON "Venta"("sucursalId");
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Por si alguna empresa todavía no tiene sucursal.
INSERT INTO "Sucursal" ("nombre", "empresaId")
SELECT 'Principal', e."id" FROM "Empresa" e
WHERE NOT EXISTS (SELECT 1 FROM "Sucursal" s WHERE s."empresaId" = e."id");

-- Copiar el stock de cada producto a la principal de su empresa.
INSERT INTO "StockSucursal" ("productoId", "sucursalId", "cantidad", "stockMinimo")
SELECT p."id", pr."id", p."stockActual", p."stockMinimo"
FROM "Producto" p
JOIN (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
  ON pr."empresaId" = p."empresaId"
ON CONFLICT ("productoId", "sucursalId") DO NOTHING;

-- Las ventas existentes quedan en la principal.
UPDATE "Venta" v
SET "sucursalId" = pr."id"
FROM (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr
WHERE pr."empresaId" = v."empresaId" AND v."sucursalId" IS NULL;
