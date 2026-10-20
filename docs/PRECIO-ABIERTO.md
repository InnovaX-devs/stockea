# Productos de precio abierto (verdura, fiambre…)

En la verdulería / fiambrería anotan solo el total ("$2.100 de verdura"). Se
resuelve con productos especiales ("Verdura", "Fiambre"…) que, al venderse,
piden el monto.

## Enfoque

Son **productos comunes** con marcas nuevas, no ítems sueltos sin producto. Así
siguen funcionando los reportes ("cuánto vendí de verdura"), las categorías, la
facturación (con la alícuota de IVA del producto), la copia sin conexión y la
cola de ventas.

| Campo (`Producto`)  | Qué hace |
| ------------------- | -------- |
| `precioAbierto`     | `true` = el monto se carga al vender. Sin precio ni costo fijos. |
| `controlaStock`     | `false` = no descuenta ni suma stock, y no aparece en "sin stock" / "stock bajo". |
| `costoEstimadoPct`  | % del precio vendido que se toma como costo (ej. 60) para que los reportes no muestren 100% de ganancia. Opcional, solo con precio abierto. |

Migración: `20261020130000_precio_abierto` (columnas con valor por defecto; los
productos existentes quedan como siempre: precio fijo y con control de stock).

## Dónde está cada cosa

- **Stock** — `src/lib/stock.ts`: `descontarStock`, `descontarStockPermitiendoNegativo`
  y `sumarStockSucursal` (y por lo tanto `sumarStock`, transferencias y ajustes)
  ignoran los productos con `controlaStock = false` (`soloConControl`). La
  confirmación de compras (`api/compras/[id]/confirmar`) tampoco les suma al total.
- **Alta / edición** — `src/lib/precio-abierto.ts` valida los tres campos;
  `api/productos` (POST) y `api/productos/[id]` (PUT) los guardan. El formulario
  (`producto-form-modal.tsx`) tiene las casillas "Precio abierto (se carga el
  monto al vender)" y "No controlar stock", y el campo "% de costo estimado".
- **Nueva venta** — `components/ventas/precio-abierto.tsx`: botones rápidos con los
  productos de precio abierto arriba del buscador y el modal que pide el monto
  (Enter confirma, Escape cancela). Se agrega una línea con cantidad 1 y ese
  precio; se puede repetir. También se pide el monto si se elige desde el buscador.
- **Servidor** — `crearVentaInterna` (`src/lib/ventas.ts`): para un producto de
  precio abierto el monto que manda la pantalla debe ser un número mayor a cero
  (y la cantidad un entero ≥ 1); si no, rechaza la venta. Aplica también a las
  ventas que llegan de la cola sin conexión.
- **Costos / ganancia** — `costoEstimadoDeLinea` (`src/lib/reportes.ts`): en
  reportes, dashboard, historial y detalle de pedido, el costo de una línea de
  precio abierto es `costoEstimadoPct` % del precio al que se vendió.
- **Sin stock / stock bajo** — `reportes/inventario/queries.ts`, `sucursales/queries.ts`
  y los filtros del listado de productos excluyen los que no controlan stock.
- **Copia sin conexión** — el catálogo sincroniza `precioAbierto` y `controlaStock`
  (`api/sync/catalogo`); la base local pasó a la versión 5 (fuerza una
  sincronización completa). Los botones rápidos y el stock local de la cola de
  ventas respetan las marcas.
- Las listas de precios / catálogo en PDF no incluyen los de precio abierto.

## Criterio de aceptación

- Venta con Verdura $2.100 + Verdura $500 + un producto común: total correcto
  ($2.600 + el producto común), y el stock baja solo en el producto común.
- En reportes aparece "Verdura" con lo vendido.
