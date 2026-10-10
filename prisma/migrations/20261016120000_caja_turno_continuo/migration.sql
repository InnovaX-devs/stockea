-- Opción para negocios 24 h: al cerrar un turno se abre el siguiente.
ALTER TABLE "Configuracion" ADD COLUMN "cajaTurnoContinuo" BOOLEAN NOT NULL DEFAULT false;
