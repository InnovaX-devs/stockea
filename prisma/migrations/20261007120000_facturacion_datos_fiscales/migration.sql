-- Facturación electrónica ARCA (etapa 1): datos fiscales, certificado, documento de clientes e IVA de productos.
CREATE TYPE "CondicionIva" AS ENUM ('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO');
CREATE TYPE "CondicionIvaCliente" AS ENUM ('CONSUMIDOR_FINAL', 'MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO');
CREATE TYPE "TipoDocumento" AS ENUM ('CUIT', 'CUIL', 'DNI');
CREATE TYPE "ArcaEntorno" AS ENUM ('HOMOLOGACION', 'PRODUCCION');

ALTER TABLE "Configuracion"
  ADD COLUMN "facturacionHabilitada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "facturarPorDefecto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cuit" TEXT,
  ADD COLUMN "razonSocial" TEXT,
  ADD COLUMN "condicionIva" "CondicionIva",
  ADD COLUMN "puntoVenta" INTEGER,
  ADD COLUMN "domicilioFiscal" TEXT,
  ADD COLUMN "ingresosBrutos" TEXT,
  ADD COLUMN "inicioActividades" TIMESTAMP(3),
  ADD COLUMN "arcaEntorno" "ArcaEntorno" NOT NULL DEFAULT 'HOMOLOGACION',
  ADD COLUMN "arcaClavePrivada" TEXT,
  ADD COLUMN "arcaCsr" TEXT,
  ADD COLUMN "arcaCertificado" TEXT,
  ADD COLUMN "arcaCertificadoVence" TIMESTAMP(3),
  ADD COLUMN "arcaToken" TEXT,
  ADD COLUMN "arcaSign" TEXT,
  ADD COLUMN "arcaTokenVence" TIMESTAMP(3);

ALTER TABLE "Cliente"
  ADD COLUMN "tipoDocumento" "TipoDocumento",
  ADD COLUMN "numeroDocumento" TEXT,
  ADD COLUMN "condicionIva" "CondicionIvaCliente";

ALTER TABLE "Producto" ADD COLUMN "alicuotaIva" DOUBLE PRECISION NOT NULL DEFAULT 21;
