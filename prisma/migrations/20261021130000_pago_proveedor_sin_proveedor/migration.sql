-- CP-2: se puede pagar la deuda de las compras "Sin especificar" (sin proveedor).
-- Esos pagos se guardan con proveedorId = NULL.
ALTER TABLE "PagoProveedor" ALTER COLUMN "proveedorId" DROP NOT NULL;
