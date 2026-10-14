# Ventas sin conexión (issue #41)

Si se cae internet, **Confirmar venta** sigue andando: la venta se guarda en la
compu y sube sola cuando vuelve la conexión.

## Cómo funciona

1. Al confirmar, la compu le pone a la venta un `idCliente` (uuid). Con
   conexión se manda directo (`confirmarVenta`); sin conexión —o si el pedido se
   corta a medias— queda en la **cola** (IndexedDB, tabla `outbox` de
   `src/lib/offline/db.ts`) y baja el stock de la copia local.
2. Al volver la red (evento `online`, o cada 3 minutos) `SincronizadorCatalogo`
   sube las ventas **en orden y de a una** a `POST /api/sync/ventas`, y después
   baja el catálogo.
3. El servidor usa la misma `crearVentaInterna` (`src/lib/ventas.ts`) y le
   asigna el número (la numeración es por empresa y vive en el servidor).
   Hasta entonces la venta se muestra como **Pendiente** (Nueva venta →
   "Ventas hechas en este equipo"); después muestra su `#número`.

## Reglas

- **Sin duplicados.** `Venta.idCliente` tiene un índice único por empresa
  (`empresaId + idCliente`). Si la misma venta llega dos veces (reintento,
  respuesta perdida, dos pestañas), el servidor devuelve la que ya estaba
  (`duplicada: true`) sin tocar stock, caja ni numeración. Reenviar siempre es seguro.
- **Stock negativo permitido.** La mercadería ya salió del mostrador: si no
  alcanza, la venta se guarda igual, el stock de la sucursal queda negativo y la
  venta se marca (`Venta.stockNegativo`). El panel central muestra un aviso
  mientras haya productos con stock negativo (se apaga solo al corregirlo).
- **Caja.** Abrir y cerrar la caja requieren conexión. Sin red solo se vende si
  la última vez que se vio con internet la caja estaba abierta. Al sincronizar,
  el servidor no rechaza una venta porque la caja esté cerrada *ahora*. No se
  puede cerrar la caja mientras haya ventas de ese equipo sin subir.
- **Qué NO se puede hacer sin conexión:** registrar pedidos, "solo descontar
  stock", convertir presupuestos, facturar (se pide desde el historial una vez subida).
- **Fecha.** Se guarda la fecha real de la venta (acotada: ni futura ni de hace
  más de 30 días, por si el reloj de la compu está mal).
- **Sucursal.** La venta lleva la sucursal donde se hizo. El servidor no se fía:
  la valida contra las que ese usuario puede usar (empleado: solo la suya).
- **Errores.** Si el servidor rechaza una venta (producto o cuenta que ya no
  existen…) queda "Con error" con el motivo, no frena a las demás, y se puede
  reintentar o descartar. Nunca se borra sola. Los errores de red o 5xx se reintentan solos.
- **Cerrar sesión** no borra la cola. Cada venta sabe de qué empresa es y solo
  sube con la sesión de esa empresa.

## Para programar

- Cola: `src/lib/offline/cola-ventas.ts`. Endpoint: `src/app/api/sync/ventas/route.ts`.
- Descuento de stock sin tope: `descontarStockPermitiendoNegativo` en `src/lib/stock.ts`
  (solo para este flujo; todo lo demás sigue usando `descontarStock`).
- Migración: `prisma/migrations/20261019120000_ventas_sin_conexion`
  (corre con `npx prisma migrate deploy`).
