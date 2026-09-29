-- Cierre de caja (Básico y Premium)
CREATE TABLE "CierreCaja" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    "usuarioNombre" TEXT NOT NULL,
    "observacion" TEXT,
    "ultimoMovimientoId" INTEGER NOT NULL DEFAULT 0,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anuladoFecha" TIMESTAMP(3),
    "anuladoPorNombre" TEXT,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "CierreCaja_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CierreCajaCuenta" (
    "id" SERIAL NOT NULL,
    "cierreId" INTEGER NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "saldoInicio" DOUBLE PRECISION NOT NULL,
    "ingresos" DOUBLE PRECISION NOT NULL,
    "egresos" DOUBLE PRECISION NOT NULL,
    "esperado" DOUBLE PRECISION NOT NULL,
    "contado" DOUBLE PRECISION,
    "diferencia" DOUBLE PRECISION,

    CONSTRAINT "CierreCajaCuenta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CierreCaja_empresaId_fecha_idx" ON "CierreCaja"("empresaId", "fecha");
CREATE INDEX "CierreCajaCuenta_cierreId_idx" ON "CierreCajaCuenta"("cierreId");

ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CierreCajaCuenta" ADD CONSTRAINT "CierreCajaCuenta_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "CierreCaja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CierreCajaCuenta" ADD CONSTRAINT "CierreCajaCuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
