-- Facturación electrónica ARCA (etapa 3): comprobantes emitidos.
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RECHAZADO');

CREATE TABLE "Comprobante" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'PENDIENTE',
    "entorno" "ArcaEntorno" NOT NULL,
    "tipo" INTEGER NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "numero" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "docTipo" INTEGER NOT NULL,
    "docNro" TEXT NOT NULL,
    "receptorNombre" TEXT,
    "condicionIvaReceptor" INTEGER NOT NULL,
    "importeTotal" DOUBLE PRECISION NOT NULL,
    "importeNeto" DOUBLE PRECISION NOT NULL,
    "importeIva" DOUBLE PRECISION NOT NULL,
    "detalleIva" JSONB,
    "cae" TEXT,
    "caeVencimiento" TIMESTAMP(3),
    "error" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ventaId" INTEGER,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Comprobante_empresaId_entorno_puntoVenta_tipo_numero_key" ON "Comprobante"("empresaId", "entorno", "puntoVenta", "tipo", "numero");
CREATE INDEX "Comprobante_ventaId_idx" ON "Comprobante"("ventaId");
CREATE INDEX "Comprobante_empresaId_createdAt_idx" ON "Comprobante"("empresaId", "createdAt");

ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
