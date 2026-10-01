import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const cuentaId = Number(id);
    if (Number.isNaN(cuentaId)) {
      return NextResponse.json({ error: "ID de cuenta inválido" }, { status: 400 });
    }

    const body = await request.json();
    const nuevoSaldo = Number(body.nuevoSaldo);
    const concepto: string | undefined = body.concepto?.trim() || undefined;

    if (Number.isNaN(nuevoSaldo)) {
      return NextResponse.json({ error: "El nuevo saldo debe ser un número" }, { status: 400 });
    }
    if (nuevoSaldo < 0) {
      return NextResponse.json({ error: "El saldo de una cuenta no puede ser negativo" }, { status: 400 });
    }

    const cuenta = await prisma.cuenta.findFirst({ where: { id: cuentaId, empresaId } });
    if (!cuenta) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const diferencia = nuevoSaldo - cuenta.saldoActual;
    if (diferencia === 0) {
      return NextResponse.json({ error: "El nuevo saldo es igual al actual" }, { status: 400 });
    }

    const [cuentaActualizada] = await prisma.$transaction([
      prisma.cuenta.update({
        where: { id: cuentaId },
        data: { saldoActual: nuevoSaldo },
      }),
      prisma.movimientoCaja.create({
        data: {
          empresaId,
          cuentaId,
          tipo: diferencia > 0 ? "INGRESO" : "EGRESO",
          concepto: "AJUSTE_SALDO",
          monto: Math.abs(diferencia),
          saldoResultante: nuevoSaldo,
          detalle: concepto,
        },
      }),
    ]);

    return NextResponse.json(cuentaActualizada);
  } catch (error) {
    console.error("Error al ajustar saldo:", error);
    return NextResponse.json({ error: "Error al ajustar el saldo" }, { status: 500 });
  }
}