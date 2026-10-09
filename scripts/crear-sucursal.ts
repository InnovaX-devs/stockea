/**
 * Da de alta una sucursal adicional para una empresa PREMIUM. Las sucursales
 * extra las crea InnovaX (no hay UI para que el cliente las agregue): el plan
 * BASICO tiene una sola sucursal y el PREMIUM puede tener varias.
 *
 * Uso:
 *   EMPRESA_ID=3 NOMBRE="Sucursal Centro" DIRECCION="San Martín 123" \
 *   npx tsx scripts/crear-sucursal.ts
 *
 * Para ver las sucursales de una empresa sin crear nada:
 *   EMPRESA_ID=3 npx tsx scripts/crear-sucursal.ts
 *
 * Para renombrar una existente (por ejemplo la "Principal"):
 *   EMPRESA_ID=3 SUCURSAL_ID=7 NOMBRE="Casa central" npx tsx scripts/crear-sucursal.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function listar(empresaId: number) {
  const sucursales = await prisma.sucursal.findMany({
    where: { empresaId },
    orderBy: { id: "asc" },
    include: { usuarios: { where: { rol: "EMPLEADO" }, select: { email: true } } },
  });
  console.log(`Sucursales de la empresa ${empresaId}:`);
  for (const s of sucursales) {
    const empleados = s.usuarios.map((u) => u.email).join(", ") || "sin empleado";
    console.log(`  #${s.id}  ${s.nombre}${s.direccion ? ` (${s.direccion})` : ""}${s.activa ? "" : " [inactiva]"} · ${empleados}`);
  }
}

async function main() {
  const empresaId = Number(process.env.EMPRESA_ID);
  const nombre = process.env.NOMBRE?.trim();
  const direccion = process.env.DIRECCION?.trim() || null;
  const sucursalId = process.env.SUCURSAL_ID ? Number(process.env.SUCURSAL_ID) : null;

  if (!empresaId) {
    console.error('Falta EMPRESA_ID. Uso: EMPRESA_ID=3 NOMBRE="Sucursal Centro" npx tsx scripts/crear-sucursal.ts');
    process.exit(1);
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: { configuracion: { select: { licencia: true } } },
  });
  if (!empresa) {
    console.error(`No existe la empresa ${empresaId}.`);
    process.exit(1);
  }

  if (!nombre) {
    await listar(empresaId);
    return;
  }

  // Renombrar / cambiar dirección de una existente.
  if (sucursalId) {
    const existente = await prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    if (!existente) {
      console.error(`La sucursal ${sucursalId} no es de la empresa ${empresaId}.`);
      process.exit(1);
    }
    await prisma.sucursal.update({
      where: { id: sucursalId },
      data: { nombre, ...(process.env.DIRECCION !== undefined ? { direccion } : {}) },
    });
    console.log(`✅ Sucursal #${sucursalId} actualizada: ${nombre}`);
    await listar(empresaId);
    return;
  }

  const actuales = await prisma.sucursal.count({ where: { empresaId, activa: true } });
  if (empresa.configuracion?.licencia !== "PREMIUM" && actuales >= 1) {
    console.error(
      `La empresa "${empresa.nombre}" tiene licencia BASICO, que permite una sola sucursal. ` +
        "Pasala a PREMIUM antes de agregar otra."
    );
    process.exit(1);
  }

  const repetida = await prisma.sucursal.findFirst({ where: { empresaId, nombre } });
  if (repetida) {
    console.error(`Ya existe una sucursal "${nombre}" en esta empresa (#${repetida.id}).`);
    process.exit(1);
  }

  const sucursal = await prisma.sucursal.create({ data: { empresaId, nombre, direccion } });
  console.log(`✅ Sucursal creada: ${sucursal.nombre} (#${sucursal.id}) en "${empresa.nombre}"`);
  console.log("   El admin ya la ve en el selector de la barra y puede asignarle un empleado en Configuración › Usuarios.");
  await listar(empresaId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
