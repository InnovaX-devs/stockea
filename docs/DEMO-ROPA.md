# Demo de ropa y prueba del flujo completo (RV-7)

## Crear la empresa demo
```
ADMIN_PASSWORD="unaClaveSegura123" npx tsx scripts/crear-demo-ropa.ts
```
Crea "Indumentaria Norte" (rubro ROPA, licencia PREMIUM): 6 modelos, ~60 variantes
(talle × color), 2 sucursales (Principal y Sucursal Centro), 1 compra, 1 transferencia
y ~45 ventas de los últimos 25 días, sesgadas para que Reportes → Ropa muestre
diferencias claras (Remera básica, talle M/L y color Negro arriba).
Es idempotente: si la empresa ya existe no hace nada. No marcar su usuario como desarrollador.

## Checklist del flujo completo (con la demo)
1. **Alta de modelo**: Productos → nuevo modelo "Short deportivo", talles S–L, colores Negro y Azul → se crean 6 variantes.
2. **Compra**: Compras → nueva → cargar las 6 variantes, confirmar y recibir → el stock sube en la sucursal elegida.
3. **Venta con conexión**: Ventas → agregar 2 variantes por la grilla → cobrar → baja el stock.
4. **Venta sin conexión**: DevTools → Network → Offline → cobrar otra venta (aparece en "ventas sin conexión") → volver online → se sincroniza una sola vez (sin duplicar) y el stock baja.
5. **Transferencia**: Transferencias → nueva Principal → Centro → recibir con el usuario de destino → stock correcto en ambas sucursales.
6. **Reportes**: Reportes → Ropa → las ventas de los pasos 3 y 4 suman al modelo, talle y color. Cambiar de sucursal y de período (Diario / Mensual).
7. **Otros rubros**: entrar con Perfumería Sur → la pestaña "Ropa" NO aparece y /reportes/ropa da 404.

## Texto para landing / material de venta (rubro ropa)
**Título:** Stock de ropa sin planillas: talles, colores y sucursales en un solo lugar.
**Bajada:** Cargá cada modelo una sola vez y el sistema arma todas las variantes de talle y color.

- Alta de modelos con talles y colores en un paso.
- Vendé desde una grilla de talles × colores, también sin internet.
- Stock por sucursal y transferencias entre locales.
- Reportes: qué modelo, qué talle y qué color se vende más, para comprar mejor.
- Probalo con la demo "Indumentaria Norte".