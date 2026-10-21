import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { requerirSucursalId } from "@/lib/sucursal";
import { mensajeSiCajaCerrada } from "@/lib/caja";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { validarCuentaParaSucursal } from "@/lib/cuenta-sucursal";
import { esCuentaUSD, redondearUSD } from "@/lib/currency";
import { cubreElTotal, redondearPesos } from "@/lib/compras-pago";
import { aplicarPago, deudaTotal, leerProveedorId, obtenerEstadoDeuda, type Aplicacion } from "@/lib/cuenta-corriente-proveedor";

class ErrorPago extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Pago de deuda a un proveedor (CP-2).
 * Body: { pagos: [{ cuentaId, monto }], compraId? }  — monto en ARS; varias cuentas permitidas.
 * Con compraId solo se paga el saldo de esa compra (botón Pagar del listado de Compras).
 * Se aplica a la deuda inicial y luego a las compras más viejas, y genera un
 * movimiento de caja (EGRESO / PAGO_A_PROVEEDOR) por cada compra tocada.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const proveedorId = leerProveedorId((await params).id);
    if (proveedorId === undefined) throw new ErrorPago("ID de proveedor inválido");

    const body = await request.json().catch(() => null);
    const compraId = body?.compraId == null ? undefined : Number(body.compraId);
    if (compraId !== undefined && (!Number.isInteger(compraId) || compraId <= 0)) {
      throw new ErrorPago("ID de compra inválido");
    }
    const crudos: unknown[] = Array.isArray(body?.pagos) ? body.pagos : [];
    // Si repiten una cuenta, se suman.
    const porCuenta = new Map<number, number>();
    for (const p of crudos as { cuentaId?: unknown; monto?: unknown }[]) {
      const cuentaId = Number(p?.cuentaId);
      const monto = redondearPesos(Number(p?.monto));
      if (!Number.isInteger(cuentaId) || cuentaId <= 0 || !Number.isFinite(monto) || monto <= 0) continue;
      porCuenta.set(cuentaId, redondearPesos((porCuenta.get(cuentaId) ?? 0) + monto));
    }
    if (porCuenta.size === 0) throw new ErrorPago("Ingresá un monto mayor a $0 y elegí la cuenta.");
    const pagos = [...porCuenta.entries()].map(([cuentaId, monto]) => ({ cuentaId, monto }));
    const total = redondearPesos(pagos.reduce((a, p) => a + p.monto, 0));

    let sucursalId: number;
    try {
      sucursalId = await requerirSucursalId();
    } catch (e) {
      throw new ErrorPago(e instanceof Error ? e.message : "Elegí una sucursal.");
    }
    const cajaCerrada = await mensajeSiCajaCerrada(empresaId, sucursalId);
    if (cajaCerrada) throw new ErrorPago(cajaCerrada, 409);

    const config = await obtenerConfiguracion();
    const cotizacionActual = config.usaCotizacionUSD && config.cotizacionUSD > 0 ? config.cotizacionUSD : 1;

    const resultado = await prisma.$transaction(
      async (tx) => {
        // Dos pagos al mismo proveedor a la vez se hacen uno detrás del otro: así la
        // deuda inicial no se puede pagar dos veces (las compras y los gastos ya
        // tienen su propio control, pero la deuda inicial no).
        if (proveedorId != null) {
          await tx.$queryRaw`SELECT id FROM "Proveedor" WHERE id = ${proveedorId} AND "empresaId" = ${empresaId} FOR UPDATE`;
        }
        const datos = await obtenerEstadoDeuda(tx, empresaId, proveedorId, compraId);
        if (!datos) throw new ErrorPago("Proveedor no encontrado", 404);
        const { proveedor, estado } = datos;

        const deuda = deudaTotal(estado);
        if (deuda < 0.5) {
          throw new ErrorPago(compraId !== undefined ? "Esa compra no tiene saldo pendiente." : "El proveedor no tiene deuda pendiente.");
        }
        if (total > deuda + 0.01) {
          throw new ErrorPago(
            `El pago ($${total.toLocaleString("es-AR")}) supera la deuda ($${deuda.toLocaleString("es-AR")}).`
          );
        }

        // 1) Plan en memoria: qué se paga con cada cuenta y a qué se aplica.
        const plan: { cuentaId: number; esUSD: boolean; sucursalCuenta: number | null; aplicaciones: Aplicacion[] }[] = [];
        for (const pago of pagos) {
          const cuenta = await validarCuentaParaSucursal(tx, empresaId, pago.cuentaId, sucursalId).catch((e) => {
            throw new ErrorPago(e instanceof Error ? e.message : "Cuenta inválida.");
          });
          const activa = await tx.cuenta.findFirst({ where: { id: cuenta.id, empresaId }, select: { activa: true } });
          if (!activa?.activa) throw new ErrorPago(`La cuenta "${cuenta.nombre}" está inactiva.`);
          const { aplicaciones, sobrante } = aplicarPago(estado, pago.monto);
          if (sobrante > 0.01) {
            throw new ErrorPago(
              `Sobran $${sobrante.toLocaleString("es-AR")}: los gastos pendientes se pagan completos. Ajustá el monto para que alcance justo.`
            );
          }
          plan.push({ cuentaId: cuenta.id, esUSD: esCuentaUSD(cuenta.tipo), sucursalCuenta: cuenta.sucursalId, aplicaciones });
        }

        // 2) Registro del pago y detalle por compra.
        const todas = plan.flatMap((p) => p.aplicaciones);
        const aDeudaInicial = redondearPesos(todas.filter((a) => a.tipo === "INICIAL").reduce((a, x) => a + x.monto, 0));
        const pagoProveedor = await tx.pagoProveedor.create({
          data: {
            empresaId,
            proveedorId,
            sucursalId,
            montoARS: total,
            aplicadoDeudaInicial: aDeudaInicial,
            compras: {
              create: todas.filter((a) => a.tipo === "COMPRA").map((a) => ({ compraId: a.compra!.id, montoARS: a.monto })),
            },
          },
        });

        // 3) Caja: una baja por cuenta y un movimiento por cada compra tocada.
        for (const p of plan) {
          if (p.aplicaciones.length === 0) continue;
          // Cuenta en dólares: se descuenta monto ÷ cotización de la compra (como en CP-1).
          const debitos = p.aplicaciones.map((a) =>
            p.esUSD ? redondearUSD(a.monto / (a.compra?.cotizacionUsada || cotizacionActual)) : a.monto
          );
          const totalDebito = debitos.reduce((a, x) => a + x, 0);
          const cuenta = await tx.cuenta.update({
            where: { id: p.cuentaId },
            data: { saldoActual: { decrement: totalDebito } },
          });
          if (cuenta.saldoActual < 0) {
            throw new ErrorPago("La cuenta seleccionada no tiene saldo suficiente para ese pago.", 409);
          }
          let saldo = cuenta.saldoActual + totalDebito;
          await tx.movimientoCaja.createMany({
            data: p.aplicaciones.map((a, i) => {
              saldo -= debitos[i];
              return {
                empresaId,
                cuentaId: p.cuentaId,
                tipo: "EGRESO" as const,
                // Un gasto pendiente que se salda acá sigue siendo un GASTO: con ese concepto
                // lo cuentan el estado de resultados y el análisis de gastos (igual que /gastos/[id]/pagar).
                concepto: a.tipo === "GASTO" ? ("GASTO" as const) : ("PAGO_A_PROVEEDOR" as const),
                monto: debitos[i],
                saldoResultante: saldo,
                compraId: a.compra?.id ?? null,
                gastoId: a.gasto?.id ?? null,
                pagoProveedorId: pagoProveedor.id,
                sucursalId,
                detalle:
                  a.tipo === "COMPRA"
                    ? `Pago a ${proveedor.nombre} — compra #${a.compra!.numero}`
                    : a.tipo === "GASTO"
                      ? `Pago a ${proveedor.nombre} — gasto: ${a.gasto!.concepto}`
                      : `Pago a ${proveedor.nombre} — deuda inicial`,
              };
            }),
          });
        }

        // 3b) Gastos pagados: se marcan PAGADO (con guard contra pagos simultáneos).
        for (const a of todas.filter((x) => x.tipo === "GASTO")) {
          const marcado = await tx.gasto.updateMany({
            where: { id: a.gasto!.id, empresaId, estadoPago: "PENDIENTE" },
            data: { estadoPago: "PAGADO" },
          });
          if (marcado.count === 0) {
            throw new ErrorPago("Un gasto ya fue pagado por otra persona. Revisá y probá de nuevo.", 409);
          }
        }

        // 4) Compras: sumar lo pagado (con guard contra pagos simultáneos).
        const porCompra = new Map<number, { compra: NonNullable<Aplicacion["compra"]>; cuentaId: number }>();
        for (const p of plan) {
          for (const a of p.aplicaciones) {
            if (!a.compra) continue;
            const previo = porCompra.get(a.compra.id);
            porCompra.set(a.compra.id, {
              compra: a.compra,
              cuentaId: previo?.cuentaId ?? p.cuentaId,
            });
          }
        }
        for (const { compra, cuentaId } of porCompra.values()) {
          // aplicarPago ya subió compra.montoPagado en memoria; el guard usa el valor original.
          const actualizada = await tx.compra.updateMany({
            where: { id: compra.id, empresaId, montoPagado: compra.montoPagadoInicial },
            data: {
              montoPagado: compra.montoPagado,
              pagada: cubreElTotal(compra.montoPagado, compra.totalARS),
              ...(compra.cuentaId == null ? { cuentaId } : {}),
            },
          });
          if (actualizada.count === 0) {
            throw new ErrorPago("La deuda cambió mientras se registraba el pago. Revisá y probá de nuevo.", 409);
          }
        }

        return { id: pagoProveedor.id, total, deudaRestante: deudaTotal(estado) };
      },
      { timeout: 30000 }
    );

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorPago) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error al pagar al proveedor:", error);
    return NextResponse.json({ error: "Ocurrió un error al registrar el pago." }, { status: 500 });
  }
}
