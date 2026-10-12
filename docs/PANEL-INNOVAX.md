# Panel InnovaX (`/innovax`)

Panel interno para los desarrolladores de InnovaX. Desde ahí se hace lo que antes requería scripts o SQL:

| Antes | Ahora en el panel |
|---|---|
| `scripts/crear-empresa.ts` | **Nueva empresa** (con su sucursal "Principal" y el usuario admin) |
| `UPDATE "Configuracion" SET licencia = ...` | **Pasar a Premium / Básico** |
| `scripts/crear-sucursal.ts` | **Agregar, editar, activar o desactivar sucursales** |
| `prisma/scripts/reset-password.ts` | **Cambiar contraseña** de cualquier usuario |
| — | **Suspender / reactivar** una empresa o un usuario |
| — | **Agregar otro admin** a una empresa |

Los scripts siguen funcionando, pero ya no hace falta usarlos.

## Quién puede entrar

Solo los usuarios marcados como desarrolladores (`Usuario.esDesarrollador`). Entran con su usuario de siempre y en el engranaje de la barra aparece **Panel InnovaX**. Cualquier otro usuario que abra `/innovax` ve "página no encontrada", y todas las acciones del panel vuelven a verificar el permiso en el servidor.

> ⚠️ No marques como desarrollador al usuario de una cuenta de demostración (por ejemplo, Perfumería Sur): cualquiera que use esa demo tendría acceso al panel. Usen sus propios usuarios dentro de la empresa **InnovaX**.

## Marcar a un desarrollador (una sola vez, por SQL)

En el SQL Editor de Supabase:

```sql
-- Ver los usuarios de la empresa InnovaX
SELECT id, nombre, email, "esDesarrollador" FROM "Usuario" WHERE "empresaId" = 1;

-- Marcar
UPDATE "Usuario" SET "esDesarrollador" = true WHERE email = 'tu-email@innovax.com';

-- Sacar el permiso
UPDATE "Usuario" SET "esDesarrollador" = false WHERE email = 'ex-desarrollador@innovax.com';
```

Para que cada desarrollador tenga su propio usuario: el primero que esté marcado entra al panel, abre la empresa **InnovaX**, usa **Agregar admin** para crear el usuario del compañero, y después se lo marca con el `UPDATE` de arriba. (Tiene que ser admin: los empleados no pueden entrar al panel.)

## Reglas que respeta el panel

- **Básico:** una sola sucursal activa. Para agregar más, primero pasar la empresa a Premium.
- No se puede desactivar la única sucursal activa de una empresa.
- No podés suspender tu propia empresa ni desactivar tu propio usuario (te quedarías afuera).
- Bajar de Premium a Básico no borra sucursales: el sistema usa solo la primera y los empleados dejan de poder entrar.
