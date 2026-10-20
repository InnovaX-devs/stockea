-- CP-2: pagos de deuda a proveedores y cuenta corriente.
-- Solo agrega tablas y una columna opcional; no toca datos existentes.

CREATE TABLE "PagoProveedor" (
    "id" SERIAL NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER,
    "montoARS" DOUBLE PRECISION NOT NULL,
    "aplicadoDeudaInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagoProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PagoProveedorCompra" (
    "id" SERIAL NOT NULL,
    "pagoId" INTEGER NOT NULL,
    "compraId" INTEGER NOT NULL,
    "montoARS" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "PagoProveedorCompra_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MovimientoCaja" ADD COLUMN "pagoProveedorId" INTEGER;

CREATE INDEX "PagoProveedor_proveedorId_idx" ON "PagoProveedor"("proveedorId");
CREATE INDEX "PagoProveedor_empresaId_idx" ON "PagoProveedor"("empresaId");
CREATE INDEX "PagoProveedorCompra_pagoId_idx" ON "PagoProveedorCompra"("pagoId");
CREATE INDEX "PagoProveedorCompra_compraId_idx" ON "PagoProveedorCompra"("compraId");
CREATE INDEX "MovimientoCaja_pagoProveedorId_idx" ON "MovimientoCaja"("pagoProveedorId");

ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PagoProveedorCompra" ADD CONSTRAINT "PagoProveedorCompra_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagoProveedorCompra" ADD CONSTRAINT "PagoProveedorCompra_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_pagoProveedorId_fkey" FOREIGN KEY ("pagoProveedorId") REFERENCES "PagoProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
