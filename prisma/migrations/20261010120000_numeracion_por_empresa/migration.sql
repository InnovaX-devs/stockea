-- Numeración propia por empresa: ventas, compras y presupuestos empiezan en 1
-- en cada negocio (antes se mostraba el id interno, compartido entre empresas).

ALTER TABLE "Empresa"
  ADD COLUMN "ultimoNumeroVenta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ultimoNumeroCompra" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ultimoNumeroPresupuesto" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Venta" ADD COLUMN "numero" INTEGER;
ALTER TABLE "Compra" ADD COLUMN "numero" INTEGER;
ALTER TABLE "Presupuesto" ADD COLUMN "numero" INTEGER;

-- Ventas: se numeran en el orden en que se crearon, sin contar los ajustes
-- manuales de deuda (una sola línea "Ajuste manual de deuda").
WITH ajustes AS (
  SELECT v.id
  FROM "Venta" v
  WHERE (SELECT count(*) FROM "ItemVenta" i WHERE i."ventaId" = v.id) = 1
    AND EXISTS (SELECT 1 FROM "ItemVenta" i WHERE i."ventaId" = v.id AND i."descripcionLibre" = 'Ajuste manual de deuda')
), numeradas AS (
  SELECT id, row_number() OVER (PARTITION BY "empresaId" ORDER BY id) AS n
  FROM "Venta"
  WHERE id NOT IN (SELECT id FROM ajustes)
)
UPDATE "Venta" v SET "numero" = numeradas.n FROM numeradas WHERE v.id = numeradas.id;

UPDATE "Compra" c SET "numero" = x.n
FROM (SELECT id, row_number() OVER (PARTITION BY "empresaId" ORDER BY id) AS n FROM "Compra") x
WHERE c.id = x.id;

UPDATE "Presupuesto" p SET "numero" = x.n
FROM (SELECT id, row_number() OVER (PARTITION BY "empresaId" ORDER BY id) AS n FROM "Presupuesto") x
WHERE p.id = x.id;

-- Los contadores arrancan donde quedó cada empresa.
UPDATE "Empresa" e SET
  "ultimoNumeroVenta" = COALESCE((SELECT max("numero") FROM "Venta" WHERE "empresaId" = e.id), 0),
  "ultimoNumeroCompra" = COALESCE((SELECT max("numero") FROM "Compra" WHERE "empresaId" = e.id), 0),
  "ultimoNumeroPresupuesto" = COALESCE((SELECT max("numero") FROM "Presupuesto" WHERE "empresaId" = e.id), 0);

ALTER TABLE "Compra" ALTER COLUMN "numero" SET NOT NULL;
ALTER TABLE "Presupuesto" ALTER COLUMN "numero" SET NOT NULL;

CREATE UNIQUE INDEX "Venta_empresaId_numero_key" ON "Venta"("empresaId", "numero");
CREATE UNIQUE INDEX "Compra_empresaId_numero_key" ON "Compra"("empresaId", "numero");
CREATE UNIQUE INDEX "Presupuesto_empresaId_numero_key" ON "Presupuesto"("empresaId", "numero");
