-- Impuestos que se suman al costo del producto (plan Premium):
-- costo final = costo de compra × (1 + (IIBB + percepción IVA + IVA) / 100).
-- Compatible con el código viejo: tres columnas opcionales, no toca datos.
ALTER TABLE "Producto" ADD COLUMN "iibbPct" DOUBLE PRECISION,
ADD COLUMN "percepcionIvaPct" DOUBLE PRECISION,
ADD COLUMN "ivaCostoPct" DOUBLE PRECISION;
