ALTER TABLE "Cliente" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Cliente_empresaId_updatedAt_idx" ON "Cliente"("empresaId", "updatedAt");
CREATE INDEX "Producto_empresaId_updatedAt_idx" ON "Producto"("empresaId", "updatedAt");
CREATE INDEX "StockSucursal_sucursalId_updatedAt_idx" ON "StockSucursal"("sucursalId", "updatedAt");