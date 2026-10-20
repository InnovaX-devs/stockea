-- Productos de precio abierto (verdura, fiambre…): el monto se carga al vender.
-- Compatible con el código viejo en producción: son columnas con valor por
-- defecto (todos los productos existentes quedan como siempre: precio fijo y
-- con control de stock) y no se toca nada más.

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "precioAbierto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "controlaStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "costoEstimadoPct" DOUBLE PRECISION;
