# STOCKEA by InnovaX

Sistema de gestión (productos, ventas, compras, caja, reportes) pensado para
desplegarse una vez por cliente: cada negocio tiene su propio deploy y su
propia base de datos, usando exactamente el mismo código.

Stack:

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Prisma** (ORM) + **PostgreSQL**
- **NextAuth** (login con email/contraseña)

## Instalación local

```bash
npm install
```

`npm install` corre `prisma generate` automáticamente. Esto **no** necesita
una base de datos conectada, solo lee `prisma/schema.prisma`.

## Levantar un cliente nuevo desde cero

Seguí estos pasos en orden. No hace falta cargar nada a mano desde Prisma
Studio — el seed deja el sistema usable solo.

### 1. Base de datos

Creá una base Postgres nueva y vacía para este cliente (Neon, Supabase,
Railway, RDS, etc.). **Cada cliente tiene su propia base, nunca compartida**
entre negocios distintos (sí puede ser compartida temporalmente entre
personas de un mismo equipo probando el mismo cliente).

### 2. Variables de entorno

Copiá `.env.example` a `.env` y completá:

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Conexión pooled (para la app en runtime) | Sí |
| `DIRECT_URL` | Conexión directa (para migraciones) | Sí |
| `AUTH_SECRET` | Firma las sesiones de NextAuth. Generar con `openssl rand -base64 32`, uno distinto por cliente | Sí |
| `BLOB_READ_WRITE_TOKEN` | Storage de logos (Vercel Blob) | Solo si vas a subir logo |
| `ADMIN_EMAIL` | Email del usuario admin inicial | No (default `admin@example.com`) |
| `ADMIN_PASSWORD` | Contraseña del usuario admin inicial | No (default `changeme123`, **cambiarla después del primer login**) |
| `NOMBRE_NEGOCIO` | Nombre del negocio para `Configuracion` | No (default `Mi negocio`) |
| `COTIZACION_USD` | Cotización USD→ARS inicial | No (default `1000`, **corregir en Configuración antes de cargar productos**, si no los precios en USD se muestran mal) |
| `MODULO_DECANT_HABILITADO` | `"true"` si el negocio revende perfumes fraccionados en decants (5ml/10ml), `"false"` para cualquier otro rubro (ropa, librería, kiosco, etc.) | No (default `false`) |

### 3. Migraciones

```bash
npx prisma migrate dev
```

Crea todas las tablas (`Usuario`, `Producto`, `Venta`, `Configuracion`,
etc.) en la base que pusiste en `DATABASE_URL`.

### 4. Seed (usuario admin + configuración inicial)

```bash
npx prisma db seed
```

Esto crea el usuario administrador y la fila de `Configuracion` con el
nombre del negocio, la cotización inicial y los flags de módulos que hayas
puesto en el `.env`. El sistema queda usable de una: podés loguearte y
navegar sin tocar la base de datos a mano.

### 5. Deploy

- Proyecto nuevo en Vercel (u otro hosting) apuntando al mismo
  repositorio/rama.
- Cargar ahí las mismas variables de entorno del paso 2.
- Asignar el dominio propio del cliente.

### 6. Primer ingreso

1. Login con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Configuración → Seguridad → cambiar la contraseña.
3. Configuración → completar logo, colores de marca, cotización real,
   Instagram, eslogan, y confirmar si el módulo de decant debe quedar
   activado o no.
4. Cargar marcas, categorías, cuentas y productos propios del cliente.

## Notas

- Cada base de datos es completamente independiente: no hay reportes ni
  datos cruzados entre clientes.
- Actualizaciones de código se despliegan por separado a cada proyecto de
  Vercel, y las migraciones (`prisma migrate deploy`) hay que correrlas en
  cada base de datos cuando corresponda.
