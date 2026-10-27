-- Límite de cuenta corriente para clientes.
-- Compatible con el código viejo: dos columnas nuevas que aceptan NULL y
-- NULL significa "sin límite" (empresa) / "usa el general" (cliente), o sea,
-- todo sigue funcionando igual que hoy hasta que alguien configure un límite.

ALTER TABLE "Configuracion" ADD COLUMN "limiteCuentaCorriente" DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN "limiteCuentaCorriente" DOUBLE PRECISION;
