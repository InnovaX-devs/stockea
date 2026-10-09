# Sucursales

Cada empresa tiene al menos una sucursal, la **Principal**, que se crea sola.

| Plan    | Sucursales                                                   |
|---------|--------------------------------------------------------------|
| BASICO  | Una sola (la Principal). No se le pueden agregar más.        |
| PREMIUM | Varias. Las adicionales las creamos nosotros con el script.  |

El cliente **no** puede crear sucursales desde el sistema. Cuando tiene más de una:

- El admin ve un selector en la barra de arriba para elegir en qué sucursal trabaja, o "Todas" para consultar.
- Cada sucursal puede tener **un empleado**, que se crea en *Configuración › Usuarios* y solo ve y vende en su sucursal.

> ⚠️ El script usa la base de datos de tu `.env`. Si tu `.env` apunta a producción, los cambios se hacen en producción.

Todos los comandos se corren desde la carpeta del proyecto (`~/erp-template`).

---

## 1) Buscar el ID de la empresa

En Supabase, tabla `Empresa`, columna `id`. O por SQL:

```sql
SELECT e.id, e.nombre, c.licencia
FROM "Empresa" e JOIN "Configuracion" c ON c."empresaId" = e.id
ORDER BY e.id;
```

## 2) Ver las sucursales que ya tiene

```bash
EMPRESA_ID=2 npx tsx scripts/crear-sucursal.ts
```

Muestra algo así:

```
Sucursales de la empresa 2:
  #1  Principal · empleado@perfumeriasur.com
```

El número con `#` es el ID de la sucursal (lo vas a necesitar para renombrarla).

## 3) Crear una sucursal nueva

```bash
EMPRESA_ID=2 NOMBRE="Sucursal Norte" DIRECCION="San Martín 123" npx tsx scripts/crear-sucursal.ts
```

- `DIRECCION` es opcional.
- El nombre no se puede repetir dentro de la misma empresa.
- Si la empresa es BASICO y ya tiene una sucursal, el script no la crea y avisa.

## 4) Renombrar una sucursal (por ejemplo la "Principal")

```bash
EMPRESA_ID=2 SUCURSAL_ID=1 NOMBRE="Casa central" DIRECCION="Belgrano 450" npx tsx scripts/crear-sucursal.ts
```

Si no pasás `DIRECCION`, se mantiene la que tenía.

## 5) Desactivar una sucursal

Por ahora es directo en la base (deja de aparecer en el selector; sus datos no se borran):

```sql
UPDATE "Sucursal" SET activa = false WHERE id = <id> AND "empresaId" = <empresaId>;
```

## Si se cambia de plan

- **BASICO → PREMIUM:** se pueden agregar sucursales con el paso 3.
- **PREMIUM → BASICO:** las sucursales no se borran, pero el sistema usa solo la primera (la más antigua) y deja de mostrar el selector. Los empleados no pueden entrar con plan BASICO.

## Para programar

- `src/lib/sucursal.ts`: `obtenerSucursalIdActual()` para consultas (devuelve `null` si el admin eligió "Todas") y `requerirSucursalId()` para operaciones que pasan en un local (vender, cobrar, abrir o cerrar caja).
- Nunca tomar un `sucursalId` que venga del navegador: siempre resolverlo con esas funciones, igual que `empresaId`.
