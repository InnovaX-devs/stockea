import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toArs } from "@/lib/currency";
import type { Prisma } from "@prisma/client";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { obtenerEmpresaIdActual, obtenerUsuarioActual } from "@/lib/empresa";

export const dynamic = "force-dynamic";

// El empleado ve el catálogo sin costos: se saca acá, del lado del servidor.
function sinCosto<T extends { precioCosto?: number }>(item: T): Omit<T, "precioCosto"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { precioCosto, ...resto } = item;
  return resto;
}

export async function GET(request: NextRequest) {
  try {
    const { empresaId, rol } = await obtenerUsuarioActual();
    const esEmpleado = rol === "EMPLEADO";
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q")?.trim() ?? "";
    const fetchAll = searchParams.get("all") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));

    const where: Prisma.ProductoWhereInput = {
      empresaId,
      ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
    };

    const selectFields = {
      id: true,
      nombre: true,
      codigoBarras: true,
      ubicacionDeposito: true,
      fotoUrl: true,
      contenidoMl: true,
      stockActual: true,
      stockMinimo: true,
      destacado: true,
      monedaPrecio: true,
      precioCosto: true,
      precioVenta: true,
      precioMayorista: true,
      precioOferta: true,
      activo: true,
      marcaId: true,
      categoriaId: true,
      marca: { select: { id: true, nombre: true } },
      categoria: { select: { id: true, nombre: true } },
    };

    if (fetchAll) {
      const items = await prisma.producto.findMany({
        where,
        orderBy: { nombre: "asc" },
        select: selectFields,
      });

      return NextResponse.json({
        items: esEmpleado ? items.map(sinCosto) : items,
        total: items.length,
        page: 1,
        pageSize: items.length,
      });
    }

        const [items, total, aggregateBase] = await Promise.all([
      prisma.producto.findMany({
        where,
        orderBy: { nombre: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: selectFields,
      }),
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where: { empresaId, activo: true },
        select: {
          stockActual: true,
          precioCosto: true,
          precioVenta: true,
          monedaPrecio: true,
        },
      }),
    ]);

    const config = await obtenerConfiguracion(); 
    const cotizacionUSD = config.cotizacionUSD;   

    let stockCostoArs = 0;
    let stockVentaArs = 0;

    for (const p of aggregateBase) {
      stockCostoArs += p.stockActual * toArs(p.precioCosto, p.monedaPrecio, cotizacionUSD);
      stockVentaArs += p.stockActual * toArs(p.precioVenta, p.monedaPrecio, cotizacionUSD);
    }

    if (esEmpleado) {
      return NextResponse.json({ items: items.map(sinCosto), total, page, pageSize });
    }

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      summary: {
        stockCostoArs,
        stockVentaArs,
        gananciaPotencialArs: stockVentaArs - stockCostoArs,
      },
    });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    return NextResponse.json(
      { error: "Error al obtener productos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const body = await request.json();

    if (
      !body.nombre ||
      typeof body.nombre !== "string" ||
      !body.nombre.trim() ||
      body.stockActual === undefined ||
      body.stockActual === "" ||
      body.precioCosto === undefined ||
      body.precioCosto === "" ||
      body.precioVenta === undefined ||
      body.precioVenta === ""
    ) {
      return NextResponse.json(
        { error: "Nombre, stock actual, precio de costo y precio de venta son obligatorios" },
        { status: 400 }
      );
    }

    const codigoBarras = body.codigoBarras && String(body.codigoBarras).trim() !== "" 
      ? String(body.codigoBarras).trim() 
      : null;

    const ubicacionDeposito = body.ubicacion && String(body.ubicacion).trim() !== "" 
      ? String(body.ubicacion).trim() 
      : null;

    const contenidoMl = body.contenidoMl !== undefined && body.contenidoMl !== "" && body.contenidoMl !== null
      ? Number(body.contenidoMl)
      : null;

    const marcaId = body.marcaId && String(body.marcaId).trim() !== "" 
      ? Number(body.marcaId) 
      : null;

    const categoriaId = body.categoriaId && String(body.categoriaId).trim() !== "" 
      ? Number(body.categoriaId) 
      : null;

    const stockActual = Number(body.stockActual);
    const stockMinimo = body.stockMinimo !== undefined && body.stockMinimo !== "" ? Number(body.stockMinimo) : 0;
    const precioCosto = Number(body.precioCosto);
    const precioVenta = Number(body.precioVenta);

    const precioMayorista = body.precioMayorista !== undefined && body.precioMayorista !== "" && body.precioMayorista !== null
      ? Number(body.precioMayorista) 
      : null;

    const precioOferta = body.precioOferta !== undefined && body.precioOferta !== "" && body.precioOferta !== null
      ? Number(body.precioOferta) 
      : null;

    // Evitar duplicados por nombre (insensible a mayúsculas), solo entre
    // productos activos — un producto desactivado con el mismo nombre no bloquea el alta.
    const nombreNormalizado = body.nombre.trim();
    const productoExistente = await prisma.producto.findFirst({
      where: {
        empresaId,
        nombre: { equals: nombreNormalizado, mode: "insensitive" },
      },
      select: { id: true, nombre: true, activo: true },
    });

    if (productoExistente) {
      return NextResponse.json(
        {
          error: `Ya existe un producto llamado "${productoExistente.nombre}", pero está inactivo. Podés reactivarlo en vez de crear uno nuevo.`, productoInactivoId: productoExistente.id,
        },
        { status: 409 }
      );
    }

  
    if (codigoBarras) {
      const productoConMismoCodigo = await prisma.producto.findFirst({
        where: { empresaId, codigoBarras },
        select: { id: true, nombre: true, codigoBarras: true, activo: true },
      });

      if (productoConMismoCodigo) {
        if (!productoConMismoCodigo.activo) {
          return NextResponse.json(
            {
              error: `El código de barras "${productoConMismoCodigo.codigoBarras}" ya está asignado al producto "${productoConMismoCodigo.nombre}", que está inactivo. Podés reactivarlo en vez de crear uno nuevo.`,
              productoInactivoId: productoConMismoCodigo.id,
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            error: `El código de barras "${productoConMismoCodigo.codigoBarras}" ya está asignado al producto "${productoConMismoCodigo.nombre}". Modificá el producto existente en vez de crear uno nuevo.`,
          },
          { status: 409 }
        );
      }
    }

    if (marcaId) {
      const marca = await prisma.marca.findFirst({ where: { id: marcaId, empresaId } });
      if (!marca) {
        return NextResponse.json({ error: "La marca seleccionada no existe" }, { status: 400 });
      }
    }
    if (categoriaId) {
      const categoria = await prisma.categoria.findFirst({ where: { id: categoriaId, empresaId } });
      if (!categoria) {
        return NextResponse.json({ error: "La categoría seleccionada no existe" }, { status: 400 });
      }
    }

    const nuevoProducto = await prisma.producto.create({
      data: {
        empresaId,
        nombre: body.nombre.trim(),
        codigoBarras,
        ubicacionDeposito,
        contenidoMl,
        marcaId,
        categoriaId,
        stockActual,
        stockMinimo,
        destacado: Boolean(body.destacado),
        monedaPrecio: body.monedaPrecio === "ARS" ? "ARS" : "USD",
        precioCosto,
        precioVenta,
        precioMayorista,
        precioOferta,
        fotoUrl: body.fotoUrl || null,
        activo: true,
      },
    });

    return NextResponse.json(nuevoProducto, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear producto:", error);

    if (error.code === "P2002") {
      const targetField = error.meta?.target?.[0] || "campo";
      return NextResponse.json(
        { error: `El valor ingresado para ${targetField} ya existe en el sistema` },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Error al crear el producto" },
      { status: 500 }
    );
  }
}