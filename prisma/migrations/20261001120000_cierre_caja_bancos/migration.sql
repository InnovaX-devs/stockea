-- Cierre de caja: bancos y billeteras se revisan, y la diferencia se ajusta solo si se elige.
ALTER TABLE "CierreCajaCuenta" ADD COLUMN "ajustado" BOOLEAN NOT NULL DEFAULT false;

-- En los cierres anteriores toda diferencia se ajustaba.
UPDATE "CierreCajaCuenta" SET "ajustado" = true WHERE "diferencia" IS NOT NULL AND "diferencia" <> 0;
