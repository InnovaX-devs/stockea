/**
 * Da de alta una empresa nueva (cliente nuevo del sistema) sin tocar las
 * empresas existentes. A diferencia de prisma/seed.ts (que es para la
 * primera empresa / desarrollo local), este script se corre UNA VEZ por
 * cada cliente nuevo que sumás al mismo deploy.
 *
 * Uso:
 *   NOMBRE_NEGOCIO="Perfumería Sur" ADMIN_EMAIL="admin@perfumeriasur.com" \
 *   ADMIN_PASSWORD="unaClaveSegura123" COTIZACION_USD=1200 LICENCIA=PREMIUM \
 *   npx tsx scripts/crear-empresa.ts
 *
 * LICENCIA es opcional: BASICO (default) o PREMIUM.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const nombreNegocio = process.env.NOMBRE_NEGOCIO;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const cotizacionUSD = process.env.COTIZACION_USD ? Number(process.env.COTIZACION_USD) : 1000;
  const licencia = process.env.LICENCIA === "PREMIUM" ? "PREMIUM" : "BASICO";

  if (!nombreNegocio || !email || !password) {
    console.error(
      "Faltan variables. Uso:\n" +
        'NOMBRE_NEGOCIO="Perfumería Sur" ADMIN_EMAIL="admin@perfumeriasur.com" ADMIN_PASSWORD="unaClaveSegura123" LICENCIA=PREMIUM npx tsx scripts/crear-empresa.ts'
    );
    process.exit(1);
  }

  const emailExistente = await prisma.usuario.findUnique({ where: { email } });
  if (emailExistente) {
    console.error(`Ya existe un usuario con el email ${email}. Elegí otro.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const empresa = await prisma.empresa.create({
    data: { nombre: nombreNegocio },
  });

  await prisma.configuracion.create({
    data: { empresaId: empresa.id, nombreNegocio, cotizacionUSD, licencia },
  });

  // Toda empresa arranca con una sucursal. Las adicionales (solo PREMIUM)
  // se agregan con scripts/crear-sucursal.ts.
  await prisma.sucursal.create({ data: { empresaId: empresa.id, nombre: "Principal" } });

  const admin = await prisma.usuario.create({
    data: {
      nombre: "Administrador",
      email,
      passwordHash,
      activo: true,
      empresaId: empresa.id,
    },
  });

  console.log("✅ Empresa creada:", empresa.nombre, `(id ${empresa.id})`);
  console.log("✅ Licencia:", licencia);
  console.log("✅ Usuario admin:", admin.email);
  console.log(`   Ya puede loguearse con el email y la contraseña que definiste.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
