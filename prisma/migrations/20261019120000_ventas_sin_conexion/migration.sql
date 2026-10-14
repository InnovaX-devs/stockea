-- Cola de ventas sin conexión (issue #41).
-- idCliente: uuid que genera la compu al confirmar la venta. Con el índice
-- único, si la misma venta llega dos veces el servidor la reconoce.
-- (Postgres permite varios NULL en un índice único: las ventas viejas no cambian.)
ALTER TABLE "Venta" ADD COLUMN "idCliente" TEXT;
ALTER TABLE "Venta" ADD COLUMN "stockNegativo" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Venta_empresaId_idCliente_key" ON "Venta"("empresaId", "idCliente");
CREATE INDEX "Venta_empresaId_stockNegativo_idx" ON "Venta"("empresaId", "stockNegativo");
