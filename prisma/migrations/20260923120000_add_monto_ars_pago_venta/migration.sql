-- Equivalente en ARS de cada pago (los pagos en cuentas USD guardan dólares en "monto")
ALTER TABLE "PagoVenta" ADD COLUMN "montoARS" DOUBLE PRECISION;
