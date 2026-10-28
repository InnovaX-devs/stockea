# Actualizar productos en lote desde un CSV (plan Pro)

Para cambiar muchos productos a la vez (típico: la lista de precios nueva de un proveedor) sin editarlos de a uno.
**Solo plan Pro** (`habilitarImportacion` en `src/lib/configuracion.ts`, igual que Importar productos) y solo el admin.
En el plan Start el botón no aparece y la descarga y las acciones del servidor rechazan el pedido.

Es lo opuesto a [Importar productos](IMPORTAR-PRODUCTOS.md): esa pantalla **crea** productos nuevos y no toca los
que ya existen; esta **actualiza** los que ya existen y no crea ninguno.

En Productos, **Importar / actualizar** es un solo botón con las dos opciones (cargar productos nuevos o actualizar
existentes). Para quien no tiene una planilla armada, **Actualizar Precios** permite lo mismo sin archivo: elegir los
productos y aplicar *el mismo ajuste a todos* o *un ajuste distinto por producto* (ver abajo).

## Cómo se usa
1. Productos → **Actualizar desde CSV** → **Descargar plantilla**: un CSV con los productos actuales y las
   columnas editables.
2. Cambiar en Excel lo que haga falta y guardar como CSV.
3. Subirlo en la misma pantalla. Se muestra una **vista previa sin guardar nada**: qué productos cambian
   (valor anterior → nuevo), cuántos quedan sin cambios y las filas con error, con su número de fila.
4. **Aplicar cambios**. Cancelar o cerrar en la vista previa no cambia nada.

## Columnas
`Código de barras`, `Nombre`, `Costo`, `Moneda`, `Precio minorista`, `Precio mayorista`, `Stock mínimo`,
`Categoría`, `Marca`.

- **Cómo se encuentra el producto:** por `Código de barras`; si la fila no lo trae (productos sin código), por
  `Nombre` exacto (sin importar mayúsculas ni espacios de más) y tiene que haber un solo producto con ese nombre.
  Hace falta al menos una de las dos columnas y al menos una columna para actualizar.
- `Código de barras` y `Nombre` son la **clave**: se usan para encontrar el producto y no se cambian desde el CSV.
- **Una columna que no está, o una celda vacía, no cambia nada.** Desde el CSV nunca se borra un dato
  (no se puede vaciar un mayorista, una marca, etc.). Se puede dejar solo `Código de barras;Costo;Precio minorista`.
- **Un valor igual al actual no es un cambio.** Subir la plantilla sin tocar nada da "0 cambios".
- `Costo` es el costo final, el mismo que muestra la lista de productos (con los impuestos al costo ya sumados).
- `Stock mínimo` es el de la **sucursal actual** (con varias sucursales hay que elegir una en la barra superior;
  en "Todas" no se puede cambiar). En el producto queda la suma de todas, igual que al editarlo a mano.
- `Moneda`: `ARS` o `USD` (USD solo si el negocio vende en dólares).

## Reglas
- **No crea productos nuevos.** Un código de barras o nombre que no existe es un error de esa fila. Si el nombre lo tienen varios productos, también (agregar el código de barras).
- **El stock no se modifica desde el CSV**: tiene que moverse con compras o ajustes para quedar registrado. Si el
  archivo trae una columna `Stock`, se avisa en la vista previa que se ignora.
- `Marca` y `Categoría` tienen que existir (no se crean desde acá; para eso están Marcas y categorías o el importador).
- Combinaciones de un modelo (ropa): se pueden cambiar precios, moneda y stock mínimo, pero **no** la
  marca ni la categoría, que viven en el modelo (si el valor del archivo es igual al actual no hay problema).
- Las **promociones** (#114) no se editan desde acá: no salen en la plantilla y una fila que apunte a una da error ("se edita desde Promociones"). Tampoco las toca Actualizar Precios.
- Precio minorista en 0: error, salvo en productos de precio abierto.
- Un mismo producto dos veces en el archivo: la segunda fila es un error.
- Números: `1500`, `1500,50`, `1.500,50`, `$ 1.500`. Los precios se redondean a 2 decimales.
- CSV separado por coma, punto y coma o tabulación (se detecta solo; el Excel en español usa punto y coma);
  UTF-8 o Windows-1252. Hasta 5.000 filas y 4 MB. Un `.xlsx` no se acepta: guardarlo como CSV.
- Una fila con **cualquier** error no se aplica ni en parte. Las demás sí se aplican: la vista previa avisa
  cuántas quedan afuera antes de confirmar.

## Qué se guarda
- **Todo en una transacción**: si algo falla al aplicar, no se cambia nada.
- Cada precio que cambia (costo, minorista, mayorista) queda en el **historial de precios** con origen
  *Actualización Masiva* (igual que la actualización masiva por porcentaje) y detalle "Actualización desde CSV".
  El historial no registra moneda, nombre, marca, categoría ni stock mínimo.
- Al confirmar se vuelve a leer el archivo y a compararlo con la base (nunca se confía en lo que mostró la
  pantalla), así el "valor anterior" del historial es el que había en ese momento.
- El `updatedAt` de cada producto cambia, así que la copia del catálogo para vender sin conexión se actualiza sola.

## Excel y los códigos de barras
Excel convierte los códigos largos a notación científica (`7,79E+12`) y al guardar el CSV pierde los dígitos.
Para evitarlo, la plantilla escribe los códigos numéricos como `="7790000000001"` (Excel los muestra completos y
al guardar queda el número); al leer se saca ese envoltorio. Si igual llega un código en notación científica,
la fila se busca por nombre si lo trae; si no, da error con la explicación.

## Actualizar Precios: ajuste distinto por producto (sin planilla)
Productos → Actualizar Precios → paso 2, "¿Cómo querés ajustar?":
- **El mismo ajuste para todos**: un porcentaje o monto fijo para todos los productos elegidos (como siempre).
- **Un ajuste distinto por producto**: una lista con el precio actual y un campo de ajuste por producto (% o monto
  fijo, según lo que se elija arriba; acepta `7,5` y negativos). Muestra el precio nuevo mientras se escribe, tiene
  "Poner a todos" para completar rápido y los productos con el campo vacío no se tocan.
En los dos casos se elige qué precios se modifican (venta, costo, mayorista, oferta) y los cambios van al historial
de precios con origen *Actualización Masiva*. La lógica está en `src/lib/actualizar-precios-masivo.ts` y el cálculo
en `src/lib/calculos/ajuste-precios.ts`; la ruta es `POST /api/productos/actualizar-precios` (con `ajustes` en vez de
`productoIds` + `valor` para el ajuste por producto).

## Dónde está el código
- `src/lib/actualizar-productos-formato.ts`: columnas y nombres aceptados (también lo usa la pantalla).
- `src/lib/actualizar-productos-parseo.ts`: leer el CSV, validar fila por fila y generar la plantilla (sin base de datos).
- `src/lib/actualizar-productos-plan.ts`: comparar con los productos actuales y armar los cambios (función pura).
- `src/lib/actualizar-productos.ts`: vista previa y aplicación en transacción, y los datos de la plantilla.
- `src/app/(dashboard)/productos/actualizar-csv-actions.ts`: acciones del servidor (previsualizar / aplicar).
- `src/app/api/productos/actualizar-csv/plantilla/route.ts`: descarga de la plantilla.
- `src/components/productos/actualizar-csv-modal.tsx`: pantalla.
- `src/components/productos/menu-importar.tsx`: el botón "Importar / actualizar" con sus dos opciones.
- `src/lib/actualizar-productos.test.ts`: pruebas (`npm test`, sin base de datos).

Reutiliza del importador (`src/lib/importar-productos-parseo.ts`) el lector de CSV, la lectura de números y los límites.
