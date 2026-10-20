-- RV-2: variantes de ropa (modelo + talle + color).
-- Compatible con el código viejo en producción: no hay columnas obligatorias
-- nuevas sin valor por defecto, y los productos actuales quedan igual
-- (modeloId, talle y color en NULL).

-- CreateTable
CREATE TABLE "ProductoModelo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "marcaId" INTEGER,
    "categoriaId" INTEGER,
    "empresaId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoModelo_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "color" TEXT,
ADD COLUMN     "modeloId" INTEGER,
ADD COLUMN     "talle" TEXT;

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "coloresSugeridos" TEXT[] DEFAULT ARRAY['Negro', 'Blanco', 'Gris', 'Azul', 'Rojo', 'Verde', 'Beige', 'Rosa']::TEXT[],
ADD COLUMN     "tallesSugeridos" TEXT[] DEFAULT ARRAY['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']::TEXT[];

-- CreateIndex
CREATE INDEX "ProductoModelo_empresaId_idx" ON "ProductoModelo"("empresaId");

-- CreateIndex
CREATE INDEX "Producto_modeloId_idx" ON "Producto"("modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_empresaId_modeloId_talle_color_key" ON "Producto"("empresaId", "modeloId", "talle", "color");

-- AddForeignKey
ALTER TABLE "ProductoModelo" ADD CONSTRAINT "ProductoModelo_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoModelo" ADD CONSTRAINT "ProductoModelo_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoModelo" ADD CONSTRAINT "ProductoModelo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "ProductoModelo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
