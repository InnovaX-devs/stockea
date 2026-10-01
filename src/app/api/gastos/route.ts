import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";

export async function GET(request: NextRequest) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarGastosFlujoCaja) {
    return NextResponse.json({ error: "Los gastos no están disponibles en tu plan actual." }, { status: 403 });
  }

  const empresaId = await obtenerEmpresaIdActual();
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const estado = searchParams.get("estado") ?? "todos"; // todos | pendiente | pagado
  const categoriaId = searchParams.get("categoriaId");

  const gastos = await prisma.gasto.findMany({
    where: { empresaId },
    orderBy: { fecha: "desc" },
    include: {
      categoria: { select: { id: true, nombre: true } },
      proveedor: { select: { id: true, nombre: true } },
      movimientosCaja: {
        select: {
          cuenta: { select: { id: true, nombre: true, tipo: true } },
        },
      },
    },
  });

  const cuentasActivas = await prisma.cuenta.findMany({
    where: { activa: true, empresaId },
    select: { tipo: true, saldoActual: true },
  });

  const cotizacionUSD = configuracion.cotizacionUSD ?? 0;

  const totalARS = cuentasActivas
    .filter((c) => c.tipo === "EFECTIVO_ARS" || c.tipo === "BANCO_ARS")
    .reduce((acc, c) => acc + c.saldoActual, 0);

  const totalUSD = cuentasActivas
    .filter((c) => c.tipo === "EFECTIVO_USD" || c.tipo === "BANCO_USD")
    .reduce((acc, c) => acc + c.saldoActual, 0);

  const cajaDisponible = totalARS + totalUSD * cotizacionUSD;

  const resumen = {
    totalGastos: gastos.reduce((acc, g) => acc + g.monto, 0),
    cajaDisponible,
  };

  const items = gastos
    .filter((g) => {
      const coincideBusqueda = q ? g.concepto.toLowerCase().includes(q) : true;
      const coincideEstado =
        estado === "pendiente"
          ? g.estadoPago === "PENDIENTE"
          : estado === "pagado"
          ? g.estadoPago === "PAGADO"
          : true;
      const coincideCategoria = categoriaId ? g.categoriaId === Number(categoriaId) : true;
      return coincideBusqueda && coincideEstado && coincideCategoria;
    })
    .map(({ movimientosCaja, ...g }) => ({
      ...g,
      cuenta: movimientosCaja[0]?.cuenta ?? null,
  }));

  return NextResponse.json({ items, resumen });
}

export async function POST(request: NextRequest) {
  try {
    const configuracion = await obtenerConfiguracion();
    if (!configuracion.habilitarGastosFlujoCaja) {
      return NextResponse.json({ error: "Los gastos no están disponibles en tu plan actual." }, { status: 403 });
    }

    const empresaId = await obtenerEmpresaIdActual();
    const body = await request.json();

    const monto = Number(body.monto);
    if (!monto || monto <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
    }
    if (!body.concepto?.trim()) {
      return NextResponse.json({ error: "El concepto es obligatorio" }, { status: 400 });
    }
    if (!body.cuentaId) {
      return NextResponse.json({ error: "Elegí la cuenta de origen del pago" }, { status: 400 });
    }

    const cuentaId = Number(body.cuentaId);

    if (body.categoriaId) {
      const categoria = await prisma.categoriaGasto.findFirst({
        where: { id: Number(body.categoriaId), empresaId },
      });
      if (!categoria) {
        return NextResponse.json({ error: "La categoría seleccionada no existe" }, { status: 400 });
      }
    }
    if (body.proveedorId) {
      const proveedor = await prisma.proveedor.findFirst({
        where: { id: Number(body.proveedorId), empresaId },
      });
      if (!proveedor) {
        return NextResponse.json({ error: "El proveedor seleccionado no existe" }, { status: 400 });
      }
    }

    const dataBase: Prisma.GastoCreateInput = {
      empresa: { connect: { id: empresaId } },
      monto,
      concepto: body.concepto.trim(),
      observaciones: body.observaciones?.trim() || null,
      estadoPago: "PAGADO",
      ...(body.categoriaId ? { categoria: { connect: { id: Number(body.categoriaId) } } } : {}),
      ...(body.proveedorId ? { proveedor: { connect: { id: Number(body.proveedorId) } } } : {}),
    };

    const resultado = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
      if (!cuenta) throw new Error("CUENTA_NO_ENCONTRADA");

      const esCuentaUSD = cuenta.tipo === "EFECTIVO_USD" || cuenta.tipo === "BANCO_USD";

      let montoADescontar = monto;
      if (esCuentaUSD) {
        const config = await tx.configuracion.findUnique({ where: { empresaId } });
        const cotizacion = config?.cotizacionUSD ?? 0;
        if (!cotizacion) throw new Error("SIN_COTIZACION");
        montoADescontar = monto / cotizacion;
      }

      if (cuenta.saldoActual - montoADescontar < 0) {
        throw new Error("SALDO_INSUFICIENTE");
      }

      const nuevoGasto = await tx.gasto.create({ data: dataBase });

      // Se resta sobre el saldo de ESTE momento (no uno leído antes).
      const cuentaActualizada = await tx.cuenta.update({
        where: { id: cuentaId },
        data: { saldoActual: { decrement: montoADescontar } },
      });
      if (cuentaActualizada.saldoActual < 0) throw new Error("SALDO_INSUFICIENTE");

      await tx.movimientoCaja.create({
        data: {
          empresaId,
          cuentaId,
          tipo: "EGRESO",
          concepto: "GASTO",
          monto: montoADescontar,
          saldoResultante: cuentaActualizada.saldoActual,
          gastoId: nuevoGasto.id,
        },
      });

      return nuevoGasto;
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error: any) {
    if (error?.message === "CUENTA_NO_ENCONTRADA") {
      return NextResponse.json({ error: "La cuenta seleccionada no existe" }, { status: 404 });
    }
    if (error?.message === "SIN_COTIZACION") {
      return NextResponse.json({ error: "No hay una cotización de USD configurada" }, { status: 400 });
    }
    if (error?.message === "SALDO_INSUFICIENTE") {
      return NextResponse.json({ error: "La cuenta no tiene saldo suficiente para este gasto" }, { status: 409 });
    }
    console.error("Error al crear gasto:", error);
    return NextResponse.json({ error: "Error al crear el gasto" }, { status: 500 });
  }
}