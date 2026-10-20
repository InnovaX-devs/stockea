import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { saldoPendiente } from "@/lib/compras-pago";

const WHERE_COMPRA_REAL = {
  confirmada: true,
  cancelada: false,
} satisfies Prisma.CompraWhereInput;

export async function GET(request: NextRequest) {
  const empresaId = await obtenerEmpresaIdActual();
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const estado = searchParams.get("estado") ?? "todos";

  const proveedores = await prisma.proveedor.findMany({
    where: { empresaId },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      personaContacto: true,
      telefono: true,
      email: true,
      deudaInicial: true,
      notas: true,
      createdAt: true,
      compras: {
        where: WHERE_COMPRA_REAL,
        select: { totalUSD: true, totalARS: true, montoPagado: true },
      },
    },
  });

  // Compras confirmadas y no canceladas que NO tienen proveedor asignado
  const comprasSinProveedor = await prisma.compra.findMany({
    where: { ...WHERE_COMPRA_REAL, proveedorId: null, empresaId },
    select: { totalUSD: true, totalARS: true, montoPagado: true },
  });

  const proveedoresConCalculos = proveedores.map((p) => {
    const cantidadCompras = p.compras.length;
    const totalComprado = p.compras.reduce((acc, c) => acc + (c.totalARS ?? 0), 0);
    const totalCompradoUSD = p.compras.reduce((acc, c) => acc + c.totalUSD, 0);
    // Deuda = deudaInicial + lo que falta pagar de cada compra confirmada (CP-1).
    const deudaCompras = p.compras.reduce((acc, c) => acc + saldoPendiente(c), 0);
    const deuda = p.deudaInicial + deudaCompras;

    return {
      id: String(p.id),
      nombre: p.nombre,
      personaContacto: p.personaContacto,
      telefono: p.telefono,
      email: p.email,
      deudaInicial: p.deudaInicial,
      notas: p.notas,
      cantidadCompras,
      totalComprado,
      totalCompradoUSD,
      deuda,
      alDia: deuda <= 0,
      esVirtual: false as const,
    };
  });

  // Fila virtual "Sin especificar" — solo se muestra si hay compras sin proveedor
  const cantidadComprasSinProveedor = comprasSinProveedor.length;
  const totalCompradoSinProveedor = comprasSinProveedor.reduce(
    (acc, c) => acc + (c.totalARS ?? 0),
    0
  );
  const totalCompradoSinProveedorUSD = comprasSinProveedor.reduce(
    (acc, c) => acc + c.totalUSD,
    0
  );
  const deudaSinProveedor = comprasSinProveedor.reduce((acc, c) => acc + saldoPendiente(c), 0);

  const itemSinEspecificar =
    cantidadComprasSinProveedor > 0
      ? {
          id: "sin-especificar",
          nombre: "Sin especificar",
          personaContacto: null,
          telefono: null,
          email: null,
          deudaInicial: 0,
          notas: null,
          cantidadCompras: cantidadComprasSinProveedor,
          totalComprado: totalCompradoSinProveedor,
          totalCompradoUSD: totalCompradoSinProveedorUSD,
          deuda: deudaSinProveedor,
          alDia: deudaSinProveedor <= 0,
          esVirtual: true as const,
        }
      : null;

  const resumen = {
    totalProveedores: proveedoresConCalculos.length,
    totalComprado:
      proveedoresConCalculos.reduce((acc, p) => acc + p.totalComprado, 0) +
      (itemSinEspecificar?.totalComprado ?? 0),
    deudasTotales:
      proveedoresConCalculos.reduce((acc, p) => acc + Math.max(p.deuda, 0), 0) +
      Math.max(itemSinEspecificar?.deuda ?? 0, 0),
  };

  const cumpleFiltro = (p: { nombre: string; deuda: number }) => {
    const coincideBusqueda = q ? p.nombre.toLowerCase().includes(q) : true;
    const coincideEstado =
      estado === "con-deuda"
        ? p.deuda > 0
        : estado === "al-dia"
        ? p.deuda <= 0
        : true;
    return coincideBusqueda && coincideEstado;
  };

  const items = [
    ...proveedoresConCalculos.filter(cumpleFiltro),
    ...(itemSinEspecificar && cumpleFiltro(itemSinEspecificar) ? [itemSinEspecificar] : []),
  ];

  return NextResponse.json({ items, resumen });
}

export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const body = await request.json();

    if (!body.nombre?.trim()) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }

    const nuevoProveedor = await prisma.proveedor.create({
      data: {
        empresaId,
        nombre: body.nombre.trim(),
        personaContacto: body.personaContacto?.trim() || null,
        telefono: body.telefono?.trim() || null,
        email: body.email?.trim() || null,
        deudaInicial: body.deudaInicial ? Number(body.deudaInicial) : 0,
        notas: body.notas?.trim() || null,
      },
    });

    return NextResponse.json(nuevoProveedor, { status: 201 });
  } catch (error) {
    console.error("Error al crear proveedor:", error);
    return NextResponse.json({ error: "Error al crear el proveedor" }, { status: 500 });
  }
}