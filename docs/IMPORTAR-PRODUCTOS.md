# Importar productos desde Excel o CSV (plan Pro)

Carga inicial del inventario: cientos de productos (en ropa, cada talle × color) en una sola operación.
**Solo plan Pro** (`habilitarImportacion` en `src/lib/configuracion.ts`) y solo el admin. En el plan
Start el botón no aparece y las acciones del servidor rechazan el pedido.

## Cómo se usa
1. Productos → **Importar Excel** → descargar la plantilla (cambia según el rubro: en Ropa trae
   Modelo, Talle y Color; si la empresa vende en dólares trae Moneda).
2. Completar la hoja "Productos" (una fila por producto o por combinación) y subirla como `.xlsx` o `.csv`.
   En la pantalla de carga, **Ver ejemplo de formato** muestra cómo tiene que verse el archivo y permite descargar la plantilla.
3. Se muestra un resumen **sin guardar nada**: cuántos se crean, cuántos ya existen (se omiten), las
   **marcas y categorías nuevas que se van a crear** y cuáles filas tienen errores (con el número de fila del Excel).
4. Confirmar. Se crean los productos nuevos; las filas con error no se cargan. Al terminar se listan los
   modelos, marcas y categorías que se crearon y los productos cargados.

## Reglas
- Obligatorios: nombre (o modelo) y precio de venta. El costo es opcional (vacío = 0), igual que en el alta manual.
- Opcionales: código de barras, marca, categoría, mayorista, IVA (21 por defecto), stock y stock mínimo.
- Ropa: una fila por combinación repitiendo el modelo. Sin talle ni color, la fila es un producto común.
- Las plantillas (Excel y CSV) traen filas de ejemplo: hay que borrarlas antes de cargar los productos propios.
- Marcas y categorías que no existen se crean solas (sin distinguir mayúsculas).
- **Lo que ya existe no se toca**: mismo código de barras, mismo nombre o misma combinación de un
  modelo se omiten. (Actualizar stock y precios de lo existente queda para una etapa posterior.)
- El stock se carga en la **sucursal actual**. En "Todas" solo se puede importar sin stock.
- CSV: separado por coma, punto y coma o tabulación (se detecta solo); acepta UTF-8 y el CSV de Excel en español (Windows-1252). La plantilla se puede descargar en Excel o en CSV (`?formato=csv`).
- Hasta 5.000 filas y 4 MB por archivo.
- Números en formato Argentina o plano: `1500`, `1.500,50`, `$ 1.500`.

## Dónde está el código
- `src/lib/importar-productos-formato.ts`: columnas, nombres aceptados y filas de ejemplo (también lo usa la pantalla).
- `src/lib/importar-productos-parseo.ts`: leer el Excel, validar fila por fila, generar la plantilla (sin base de datos).
- `src/lib/importar-productos.ts`: comparar con lo existente y crear (lotes de 400 en una transacción;
  si un lote falla se reintenta de a una fila para saber cuál fue).
- `src/app/(dashboard)/productos/importar-actions.ts`: acciones del servidor (previsualizar / importar).
- `src/app/api/productos/importar/plantilla/route.ts`: descarga de la plantilla.
- `src/components/productos/importar-productos-modal.tsx`: pantalla.

La confirmación vuelve a leer y validar el archivo en el servidor: nunca se confía en lo que mostró la pantalla.
