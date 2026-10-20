-- CP-1: compras pagadas en parte o sin pagar (deuda con proveedores).
-- Compatible con el código viejo: solo agrega una columna con valor por
-- defecto y vuelve opcional otra; no borra ni renombra nada.

-- 1) Monto pagado, en ARS.
ALTER TABLE "Compra" ADD COLUMN "montoPagado" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Hasta ahora confirmar una compra la pagaba completa: las ya pagadas
-- quedan con montoPagado = total.
UPDATE "Compra" SET "montoPagado" = COALESCE("totalARS", 0) WHERE "pagada" = true;

-- 2) Una compra sin pagar no sale de ninguna cuenta. La FK no cambia
--    (sigue ON DELETE RESTRICT).
ALTER TABLE "Compra" ALTER COLUMN "cuentaId" DROP NOT NULL;
