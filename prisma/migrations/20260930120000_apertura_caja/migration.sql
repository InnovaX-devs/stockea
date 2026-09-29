-- Apertura de caja por turno, hora de apertura automática y retiro al cerrar.
ALTER TABLE "Configuracion" ADD COLUMN "horaAperturaCaja" TEXT NOT NULL DEFAULT '07:00';

CREATE TABLE "SesionCaja" (
    "id" SERIAL NOT NULL,
    "abiertaFecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abiertaPorNombre" TEXT NOT NULL,
    "aperturaAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "aperturaMovimientoId" INTEGER NOT NULL DEFAULT 0,
    "cerradaFecha" TIMESTAMP(3),
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "SesionCaja_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SesionCaja_empresaId_cerradaFecha_idx" ON "SesionCaja"("empresaId", "cerradaFecha");
ALTER TABLE "SesionCaja" ADD CONSTRAINT "SesionCaja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CierreCaja" ADD COLUMN "sesionId" INTEGER;
CREATE UNIQUE INDEX "CierreCaja_sesionId_key" ON "CierreCaja"("sesionId");
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "SesionCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CierreCajaCuenta" ADD COLUMN "queda" DOUBLE PRECISION;
ALTER TABLE "CierreCajaCuenta" ADD COLUMN "retiro" DOUBLE PRECISION;
ALTER TABLE "CierreCajaCuenta" ADD COLUMN "destinoCuentaId" INTEGER;
ALTER TABLE "CierreCajaCuenta" ADD COLUMN "destinoNombre" TEXT;
