import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Este seed crea UNA empresa de ejemplo (útil para desarrollo local o para
// el primer cliente). Sistema multi-tenant: para dar de alta un cliente
// nuevo después de este, no se vuelve a correr este script — se crea la
// Empresa (+ Usuario + Configuracion) directo en la base, igual que ya
// hacíamos con los flags de licencia por instalación.
async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const nombreNegocio = process.env.NOMBRE_NEGOCIO ?? "Mi negocio";

  // Sin esto en 0, cualquier producto cargado en USD divide por cero al
  // convertir a ARS (ver lib/currency.ts) y el sistema queda inutilizable
  // hasta que alguien lo corrija a mano en Configuración.
  const cotizacionUSD = process.env.COTIZACION_USD
    ? Number(process.env.COTIZACION_USD)
    : 1000;

  const licencia = process.env.LICENCIA === "PREMIUM" ? "PREMIUM" : "BASICO";

  const passwordHash = await bcrypt.hash(password, 10);

  let empresa = await prisma.empresa.findFirst({ where: { nombre: nombreNegocio } });
  if (!empresa) {
    empresa = await prisma.empresa.create({ data: { nombre: nombreNegocio } });
  }

  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nombre: "Administrador",
      email,
      passwordHash,
      activo: true,
      empresaId: empresa.id,
    },
  });

  await prisma.configuracion.upsert({
    where: { empresaId: empresa.id },
    update: {},
    create: {
      empresaId: empresa.id,
      nombreNegocio,
      cotizacionUSD,
      licencia,
    },
  });

  const tieneSucursal = await prisma.sucursal.count({ where: { empresaId: empresa.id } });
  if (!tieneSucursal) {
    await prisma.sucursal.create({ data: { empresaId: empresa.id, nombre: "Principal" } });
  }

  console.log("Empresa creada/verificada:", empresa.nombre, `(id ${empresa.id})`);
  console.log("Usuario admin creado/verificado:", admin.email);
  console.log("Configuración inicial:", { nombreNegocio, cotizacionUSD, licencia });

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.warn(
      "⚠️  Estás usando credenciales por defecto. Definí ADMIN_EMAIL y ADMIN_PASSWORD antes de correr el seed en un cliente nuevo."
    );
  }
  if (!process.env.COTIZACION_USD) {
    console.warn(
      "⚠️  Cotización USD sin definir, quedó en 1000 por defecto. Corregila en Configuración antes de cargar productos en dólares."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
