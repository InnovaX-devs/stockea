import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { siguienteNumero } from "@/lib/numeracion";

const FILTROS_VALIDOS = ["pendientes", "confirmadas", "canceladas"] as const;
type Filtro = (typeof FILTROS_VALIDOS)[number];

const PAGE_SIZE_DEFAULT = 15;
const PAGE_SIZE_MAX = 100;

function armarWhere(empresaId: number, filtro: string | null, busqueda: string | null): Prisma.CompraWhereInput {
  const where: Prisma.CompraWhereInput = { empresaId };

  switch (filtro as Filtro | null) {
    case "pendientes":
      Object.assign(where, { confirmada: false, cancelada: false });
      break;
    case "confirmadas":
      Object.assign(where, { confirmada: true, cancelada: false });
      break;
    case "canceladas":
      Object.assign(where, { cancelada: true });
      break;
    default:
      break;
  }

  const q = busqueda?.trim();
  if (q) {
    where.proveedor = { nombre: { contains: q, mode: "insensitive" } };
  }

  return where;
}

export async function GET(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const filtro = request.nextUrl.searchParams.get("filtro");
    const busqueda = request.nextUrl.searchParams.get("q");

    const pageParam = Number(request.nextUrl.searchParams.get("page"));
    const pageSizeParam = Number(request.nextUrl.searchParams.get("pageSize"));

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), PAGE_SIZE_MAX)
        : PAGE_SIZE_DEFAULT;

    const where = armarWhere(empresaId, filtro, busqueda);

    const [compras, totalCount] = await Promise.all([
      prisma.compra.findMany({
        where,
        orderBy: { fecha: "desc" },
        include: {
          proveedor: { select: { nombre: true } },
          cuenta: { select: { nombre: true, tipo: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.compra.count({ where }),
    ]);

    return NextResponse.json({
      items: compras,
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    });
  } catch (error: any) {
    console.error("Error al listar compras:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener las compras" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const body = await request.json();

    const proveedorId =
      body.proveedorId && String(body.proveedorId).trim() !== ""
        ? Number(body.proveedorId)
        : null;

    if (proveedorId != null) {
      const proveedor = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId } });
      if (!proveedor) {
        return NextResponse.json({ error: "El proveedor seleccionado no existe" }, { status: 400 });
      }
    }

    const cuentaId = Number(body.cuentaId);
    if (!Number.isFinite(cuentaId)) {
      return NextResponse.json(
        { error: "Tenés que elegir una cuenta desde la que se va a pagar la compra" },
        { status: 400 }
      );
    }

    const cuenta = await prisma.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
    if (!cuenta) {
      return NextResponse.json({ error: "La cuenta seleccionada no existe" }, { status: 400 });
    }
    if (!cuenta.activa) {
      return NextResponse.json(
        { error: "La cuenta seleccionada está inactiva" },
        { status: 400 }
      );
    }

    const itemsBody = Array.isArray(body.items) ? body.items : [];
    if (itemsBody.length === 0) {
      return NextResponse.json(
        { error: "La compra debe tener al menos un ítem" },
        { status: 400 }
      );
    }

    let items: { productoId: number; cantidad: number; costoUnitarioUSD: number }[];
    try {
      items = itemsBody.map((it: any) => {
        const productoId = Number(it.productoId);
        const cantidad = Number(it.cantidad);
        const costoUnitarioUSD = Number(it.costoUnitarioUSD);

        if (!Number.isFinite(productoId) || !Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error("Cada ítem necesita un producto y una cantidad mayor a 0");
        }
        if (!Number.isFinite(costoUnitarioUSD) || costoUnitarioUSD < 0) {
          throw new Error("El costo unitario debe ser un número válido");
        }

        return { productoId, cantidad, costoUnitarioUSD };
      });
    } catch (validationError: any) {
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }

    const productoIds = [...new Set(items.map((it) => it.productoId))];
    const productosValidos = await prisma.producto.count({
      where: { id: { in: productoIds }, empresaId },
    });
    if (productosValidos !== productoIds.length) {
      return NextResponse.json({ error: "Uno o más productos no son válidos" }, { status: 400 });
    }

    const totalUSD = items.reduce((acc, it) => acc + it.cantidad * it.costoUnitarioUSD, 0);

    // Número propio de la empresa, en la misma transacción que la compra.
    const compra = await prisma.$transaction(async (tx) => {
      const numero = await siguienteNumero(tx, empresaId, "compra");
      return tx.compra.create({
      data: {
        empresaId,
        numero,
        proveedorId,
        cuentaId,
        totalUSD,
        confirmada: false,
        pagada: false,
        recibida: false,
        cancelada: false,
        items: {
          create: items.map((it) => ({
            productoId: it.productoId,
            cantidad: it.cantidad,
            costoUnitarioUSD: it.costoUnitarioUSD,
          })),
        },
      },
      include: { items: true },
      });
    });

    return NextResponse.json(compra, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear compra:", error);
    return NextResponse.json(
      { error: error.message || "Error al crear la compra" },
      { status: 500 }
    );
  }
}