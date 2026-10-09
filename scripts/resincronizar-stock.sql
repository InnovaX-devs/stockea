-- Resincroniza "StockSucursal" con el total de "Producto"."stockActual".
-- Usar SOLO si se hicieron ventas/compras con el código viejo después de
-- aplicar la migración 20261013120000_stock_por_sucursal (antes del deploy).
-- La diferencia se carga en la sucursal principal de cada empresa.
-- Correr en el SQL Editor de Supabase. Se puede correr más de una vez.

-- Productos creados sin fila de stock: la crea en la principal.
INSERT INTO "StockSucursal" ("productoId", "sucursalId", "cantidad", "stockMinimo")
SELECT p."id", pr."id", 0, p."stockMinimo"
FROM "Producto" p
JOIN (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr ON pr."empresaId" = p."empresaId"
ON CONFLICT ("productoId", "sucursalId") DO NOTHING;
-- La principal absorbe la diferencia entre el total y lo que hay en las demás sucursales.
UPDATE "StockSucursal" ss
SET "cantidad" = p."stockActual" - COALESCE((
  SELECT SUM(o."cantidad") FROM "StockSucursal" o
  WHERE o."productoId" = p."id" AND o."sucursalId" <> ss."sucursalId"), 0)
FROM "Producto" p
JOIN (SELECT "empresaId", MIN("id") AS "id" FROM "Sucursal" GROUP BY "empresaId") pr ON pr."empresaId" = p."empresaId"
WHERE ss."productoId" = p."id" AND ss."sucursalId" = pr."id";
