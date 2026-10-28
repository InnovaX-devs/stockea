-- Promociones (#114): una promo es un Producto especial (sin stock propio) con
-- la lista de productos que incluye. Compatible con el código viejo: columnas
-- nuevas con valor por defecto / NULL y una tabla nueva que el código viejo no
-- lee. Mientras nadie cree una promo, todo funciona igual que hoy.

ALTER TABLE "Producto" ADD COLUMN "esPromocion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "vigenciaDesde" TIMESTAMP(3),
ADD COLUMN "vigenciaHasta" TIMESTAMP(3);

CREATE INDEX "Producto_empresaId_esPromocion_idx" ON "Producto"("empresaId", "esPromocion");

CREATE TABLE "ComponentePromocion" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "promocionId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "ComponentePromocion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComponentePromocion_cantidad_positiva" CHECK ("cantidad" > 0),
    CONSTRAINT "ComponentePromocion_no_se_incluye_a_si_misma" CHECK ("promocionId" <> "productoId")
);

CREATE UNIQUE INDEX "ComponentePromocion_promocionId_productoId_key" ON "ComponentePromocion"("promocionId", "productoId");
CREATE INDEX "ComponentePromocion_empresaId_idx" ON "ComponentePromocion"("empresaId");
CREATE INDEX "ComponentePromocion_productoId_idx" ON "ComponentePromocion"("productoId");

ALTER TABLE "ComponentePromocion" ADD CONSTRAINT "ComponentePromocion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComponentePromocion" ADD CONSTRAINT "ComponentePromocion_promocionId_fkey" FOREIGN KEY ("promocionId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentePromocion" ADD CONSTRAINT "ComponentePromocion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
