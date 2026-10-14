-- Transferencias de stock entre sucursales (issue #36).
CREATE TYPE "EstadoTransferencia" AS ENUM ('ENVIADA', 'RECIBIDA');

ALTER TABLE "Empresa" ADD COLUMN "ultimoNumeroTransferencia" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Transferencia" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'ENVIADA',
    "fechaEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaRecepcion" TIMESTAMP(3),
    "observaciones" TEXT,
    "empresaId" INTEGER NOT NULL,
    "origenId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "usuarioEnvioId" INTEGER NOT NULL,
    "usuarioRecepcionId" INTEGER,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Transferencia_origen_distinto_destino" CHECK ("origenId" <> "destinoId")
);

CREATE TABLE "ItemTransferencia" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "transferenciaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "ItemTransferencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ItemTransferencia_cantidad_positiva" CHECK ("cantidad" > 0)
);

CREATE UNIQUE INDEX "Transferencia_empresaId_numero_key" ON "Transferencia"("empresaId", "numero");
CREATE INDEX "Transferencia_empresaId_idx" ON "Transferencia"("empresaId");
CREATE INDEX "Transferencia_origenId_idx" ON "Transferencia"("origenId");
CREATE INDEX "Transferencia_destinoId_estado_idx" ON "Transferencia"("destinoId", "estado");
CREATE INDEX "Transferencia_fechaEnvio_idx" ON "Transferencia"("fechaEnvio");
CREATE INDEX "ItemTransferencia_transferenciaId_idx" ON "ItemTransferencia"("transferenciaId");
CREATE INDEX "ItemTransferencia_productoId_idx" ON "ItemTransferencia"("productoId");

ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_origenId_fkey"
    FOREIGN KEY ("origenId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_destinoId_fkey"
    FOREIGN KEY ("destinoId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_usuarioEnvioId_fkey"
    FOREIGN KEY ("usuarioEnvioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_usuarioRecepcionId_fkey"
    FOREIGN KEY ("usuarioRecepcionId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemTransferencia" ADD CONSTRAINT "ItemTransferencia_transferenciaId_fkey"
    FOREIGN KEY ("transferenciaId") REFERENCES "Transferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemTransferencia" ADD CONSTRAINT "ItemTransferencia_productoId_fkey"
    FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;