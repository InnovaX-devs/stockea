-- Facturación electrónica ARCA (etapa 4): nota de crédito asociada a la factura que anula.
ALTER TABLE "Comprobante" ADD COLUMN "comprobanteAsociadoId" INTEGER;
CREATE INDEX "Comprobante_comprobanteAsociadoId_idx" ON "Comprobante"("comprobanteAsociadoId");
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_comprobanteAsociadoId_fkey" FOREIGN KEY ("comprobanteAsociadoId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
