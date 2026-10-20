import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { requerirSucursalId } from "@/lib/sucursal";
import { sumarStockSucursal } from "@/lib/stock";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { validarCuentaParaSucursal } from "@/lib/cuenta-sucursal";
import { cubreElTotal, redondearPesos } from "@/lib/compras-pago";
import {
  agruparPorProducto,
  costoPonderado,
  redondearPrecio,
  type ModoCosto,
} from "@/lib/calculos/actualizacion-precios";

const TIPOS_CUENTA_USD = ["EFECTIVO_USD", "BANCO_USD"];

class SaldoInsuficienteError extends Error {}

/**
 * Pago al confirmar (CP-1). `monto` en ARS: 0 = no pagar ahora, menos que el
 * total = pago parcial. Si el body no trae `pago` (llamada vieja), se paga
 * todo desde la cuenta elegida al crear la compra, como antes.
 */
type PagoBody = { monto?: unknown; cuentaId?: unknown };

type Moneda = "USD" | "ARS";

/**
 * GET: vista previa de cómo quedarían costos y precios si se confirma.
 * POST: confirma la compra (stock, costos, precios y caja).
 *
 * El POST acepta { pago: { monto, cuentaId } } (ver PagoBody) y,
 * opcionalmente, { precios: DecisionPrecio[] } con lo que se
 * eligió en la ventana de confirmación. Sin `precios` se comporta como
 * siempre: actualiza el costo solo si Configuración tiene el promedio
 * ponderado activado, y no toca precios de venta.
 */
type DecisionPrecio = {
  productoId: number;
  /** null = no tocar el costo. */
  costo: ModoCosto | null;
  /** null / ausente = no tocar ese precio. */
  precioVenta?: number | null;
  precioMayorista?: number | null;
};

async function cargarCompra(compraId: number, empresaId: number) {
  return prisma.compra.findFirst({
    where: { id: compraId, empresaId },
    include: { items: true, cuenta: true },
  });
}

function validarCompra(compra: Awaited<ReturnType<typeof cargarCompra>>) {
  if (!compra) return { error: "Compra no encontrada", status: 404 };
  if (compra.cancelada) return { error: "No se puede confirmar una compra cancelada", status: 400 };
  if (compra.confirmada) return { error: "La compra ya fue confirmada", status: 400 };
  if (compra.items.length === 0) return { error: "La compra no tiene ítems", status: 400 };
  return null;
}

async function contexto() {
  const config = await obtenerConfiguracion();
  // Si el negocio no opera con dólares, la cotización siempre es 1: lo que
  // se cargó como "costoUnitarioUSD" es en realidad el costo directo en
  // ARS, y no hay que multiplicarlo por ningún valor viejo que haya
  // quedado en Configuración.
  const cotizacion = config.usaCotizacionUSD && config.cotizacionUSD > 0 ? config.cotizacionUSD : 1;
  const modoPorDefecto: ModoCosto = config.costoPromedioPonderado ?? true ? "PONDERADO" : "COMPRA";
  return { cotizacion, modoPorDefecto };
}

function idDesdeParams(id: string) {
  const compraId = Number(id);
  return Number.isNaN(compraId) ? null : compraId;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const compraId = idDesdeParams((await params).id);
    if (compraId == null) return NextResponse.json({ error: "El ID de la compra debe ser un número válido" }, { status: 400 });

    const compra = await cargarCompra(compraId, empresaId);
    const invalida = validarCompra(compra);
    if (invalida) return NextResponse.json({ error: invalida.error }, { status: invalida.status });

    const { cotizacion, modoPorDefecto } = await contexto();
    const productos = await prisma.producto.findMany({
      where: { id: { in: compra!.items.map((i) => i.productoId) }, empresaId },
      select: {
        id: true, nombre: true, stockActual: true, monedaPrecio: true,
        precioCosto: true, precioVenta: true, precioMayorista: true,
      },
    });
    const porId = new Map<number, (typeof productos)[number]>(productos.map((p) => [p.id, p]));
    const grupos = agruparPorProducto(compra!.items, (id) => (porId.get(id)?.monedaPrecio ?? "USD") as Moneda, cotizacion);

    return NextResponse.json({
      numero: compra!.numero,
      // Para la sección de pago: total en ARS con la cotización de hoy y la
      // cuenta elegida al cargar la compra (si se eligió).
      totalARS: redondearPesos(compra!.totalUSD * cotizacion),
      totalUSD: compra!.totalUSD,
      cotizacion,
      cuentaId: compra!.cuentaId,
      modoPorDefecto,
      productos: grupos
        .filter((g) => porId.has(g.productoId))
        .map((g) => {
          const p = porId.get(g.productoId)!;
          const moneda = p.monedaPrecio as Moneda;
          return {
            productoId: p.id,
            nombre: p.nombre,
            moneda,
            cantidad: g.cantidad,
            costoActual: p.precioCosto,
            costoCompra: g.costoCompra,
            costoPonderado: costoPonderado({
              stockActual: p.stockActual, costoActual: p.precioCosto,
              cantidadNueva: g.cantidad, costoNuevo: g.costoCompra, moneda,
            }),
            precioVenta: p.precioVenta,
            precioMayorista: p.precioMayorista,
          };
        }),
    });
  } catch (error: any) {
    console.error("Error al preparar la confirmación de la compra:", error);
    return NextResponse.json({ error: error.message || "Error al preparar la confirmación" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const compraId = idDesdeParams((await params).id);
    if (compraId == null) return NextResponse.json({ error: "El ID de la compra debe ser un número válido" }, { status: 400 });

    const body = await request.json().catch(() => null);
    const decisiones: DecisionPrecio[] | null = Array.isArray(body?.precios) ? body.precios : null;
    for (const d of decisiones ?? []) {
      for (const precio of [d.precioVenta, d.precioMayorista]) {
        if (precio != null && (!Number.isFinite(precio) || precio <= 0)) {
          return NextResponse.json({ error: "Los precios de venta tienen que ser mayores a cero" }, { status: 400 });
        }
      }
      if (d.costo != null && d.costo !== "PONDERADO" && d.costo !== "COMPRA") {
        return NextResponse.json({ error: "Opción de costo inválida" }, { status: 400 });
      }
    }

    const compra = await cargarCompra(compraId, empresaId);
    const invalida = validarCompra(compra);
    if (invalida) return NextResponse.json({ error: invalida.error }, { status: invalida.status });

    // La mercadería entra en la sucursal de la compra.
    // Compras viejas (sin sucursal): la sucursal elegida al confirmar.
    let sucursalId: number;
    try {
      sucursalId = compra!.sucursalId ?? (await requerirSucursalId());
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Elegí una sucursal." }, { status: 400 });
    }

    const { cotizacion, modoPorDefecto } = await contexto();
    const totalARS = redondearPesos(compra!.totalUSD * cotizacion);

    // ---- Pago ----
    const pagoBody: PagoBody | null = body?.pago && typeof body.pago === "object" ? body.pago : null;
    let montoPago: number;
    let cuentaPagoId: number | null;
    if (!pagoBody) {
      // Llamada vieja: todo, desde la cuenta de la compra.
      if (compra!.cuentaId == null) {
        return NextResponse.json({ error: "Elegí cuánto pagar y desde qué cuenta." }, { status: 400 });
      }
      montoPago = totalARS;
      cuentaPagoId = compra!.cuentaId;
    } else {
      montoPago = Number(pagoBody.monto ?? 0);
      if (!Number.isFinite(montoPago) || montoPago < 0) {
        return NextResponse.json({ error: "El monto a pagar tiene que ser cero o más." }, { status: 400 });
      }
      montoPago = redondearPesos(montoPago);
      if (montoPago - totalARS > 0.005) {
        return NextResponse.json({ error: "No podés pagar más que el total de la compra." }, { status: 400 });
      }
      if (cubreElTotal(montoPago, totalARS)) montoPago = totalARS;
      cuentaPagoId = null;
      if (montoPago > 0) {
        cuentaPagoId = Number(pagoBody.cuentaId);
        if (!Number.isInteger(cuentaPagoId) || cuentaPagoId <= 0) {
          return NextResponse.json({ error: "Elegí la cuenta desde la que se paga." }, { status: 400 });
        }
      }
    }
    const pagaTodo = cubreElTotal(montoPago, totalARS);

    // Cuenta del pago: de la empresa, usable en la sucursal y activa.
    let cuentaEsUSD = false;
    let montoADebitar = 0;
    if (montoPago > 0 && cuentaPagoId != null) {
      try {
        await validarCuentaParaSucursal(prisma, empresaId, cuentaPagoId, sucursalId);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Cuenta inválida." }, { status: 400 });
      }
      const cuentaPago = await prisma.cuenta.findFirst({
        where: { id: cuentaPagoId, empresaId },
        select: { tipo: true, activa: true, saldoActual: true },
      });
      if (!cuentaPago?.activa) {
        return NextResponse.json({ error: "La cuenta seleccionada está inactiva." }, { status: 400 });
      }
      cuentaEsUSD = TIPOS_CUENTA_USD.includes(cuentaPago.tipo);
      // Cuenta en dólares: se descuenta el equivalente con la cotización de la
      // compra. Pagando todo se usa el total en USD exacto (sin redondeos).
      montoADebitar = cuentaEsUSD
        ? pagaTodo
          ? compra!.totalUSD
          : Math.round((montoPago / cotizacion) * 100) / 100
        : montoPago;
      // Aviso temprano; el control definitivo se hace dentro de la transacción.
      if (cuentaPago.saldoActual - montoADebitar < 0) {
        return NextResponse.json(
          { error: "La cuenta seleccionada no tiene saldo suficiente para ese pago." },
          { status: 409 }
        );
      }
    }

    const compraActualizada = await prisma.$transaction(async (tx) => {
      const productos = await tx.producto.findMany({
        where: { id: { in: compra!.items.map((i) => i.productoId) }, empresaId },
        select: { id: true, stockActual: true, precioCosto: true, precioVenta: true, precioMayorista: true, monedaPrecio: true },
      });
      const porId = new Map<number, (typeof productos)[number]>(productos.map((p) => [p.id, p]));
      for (const item of compra!.items) {
        if (!porId.has(item.productoId)) throw new Error(`El producto ${item.productoId} de la compra ya no existe`);
      }
      const grupos = agruparPorProducto(compra!.items, (id) => porId.get(id)!.monedaPrecio as Moneda, cotizacion);

      // Se arma todo en memoria y se guarda en pocas consultas, sin importar
      // cuántos productos tenga la compra (antes eran ~5 consultas por
      // producto y las compras grandes vencían el tiempo de la transacción).
      const cambios: { id: number; cantidad: number; costo: number | null; venta: number | null; mayorista: number | null }[] = [];
      const historial: Prisma.HistorialPrecioCreateManyInput[] = [];

      for (const g of grupos) {
        const producto = porId.get(g.productoId)!;
        const moneda = producto.monedaPrecio as Moneda;
        const cambio = { id: producto.id, cantidad: g.cantidad, costo: null as number | null, venta: null as number | null, mayorista: null as number | null };
        const registrar = (campo: "COSTO" | "MINORISTA" | "MAYORISTA", anterior: number | null, nuevo: number, detalle: string) =>
          historial.push({ productoId: producto.id, empresaId, campo, valorAnterior: anterior, valorNuevo: nuevo, origen: "COMPRA_CONFIRMADA", detalle });

        // Sin decisiones (llamada vieja): lo de siempre, según Configuración.
        const decision: DecisionPrecio | undefined = decisiones
          ? decisiones.find((d) => d.productoId === g.productoId)
          : modoPorDefecto === "PONDERADO"
            ? { productoId: g.productoId, costo: "PONDERADO" }
            : undefined;

        if (decision?.costo) {
          // El costo se recalcula acá (no se toma del navegador).
          const nuevoCosto =
            decision.costo === "PONDERADO"
              ? costoPonderado({
                  stockActual: producto.stockActual, costoActual: producto.precioCosto,
                  cantidadNueva: g.cantidad, costoNuevo: g.costoCompra, moneda,
                })
              : g.costoCompra;
          if (nuevoCosto !== producto.precioCosto) {
            cambio.costo = nuevoCosto;
            registrar("COSTO", producto.precioCosto, nuevoCosto,
              `Compra #${compra!.numero} confirmada (${decision.costo === "PONDERADO" ? "costo promedio ponderado" : "costo de la compra"})`);
          }
        }
        if (decision?.precioVenta != null) {
          const nuevo = redondearPrecio(decision.precioVenta, moneda);
          if (nuevo !== producto.precioVenta) {
            cambio.venta = nuevo;
            registrar("MINORISTA", producto.precioVenta, nuevo, `Compra #${compra!.numero} confirmada`);
          }
        }
        if (decision?.precioMayorista != null) {
          const nuevo = redondearPrecio(decision.precioMayorista, moneda);
          if (nuevo !== producto.precioMayorista) {
            cambio.mayorista = nuevo;
            registrar("MAYORISTA", producto.precioMayorista, nuevo, `Compra #${compra!.numero} confirmada`);
          }
        }
        cambios.push(cambio);
      }

      // 1) Stock de la sucursal (primero, por el orden de bloqueo de src/lib/stock.ts)…
      await sumarStockSucursal(tx, empresaId, sucursalId, cambios.map((c) => ({ productoId: c.id, cantidad: c.cantidad })));

      // …y stock total (sumado, no pisado) y precios de todos los productos en una consulta.
      const num = (v: number | null) => (v == null ? Prisma.sql`NULL::float8` : Prisma.sql`${v}::float8`);
      await tx.$executeRaw`
        UPDATE "Producto" AS p SET
          "stockActual" = p."stockActual" + v.cantidad,
          "precioCosto" = COALESCE(v.costo, p."precioCosto"),
          "precioVenta" = COALESCE(v.venta, p."precioVenta"),
          "precioMayorista" = COALESCE(v.mayorista, p."precioMayorista"),
          -- SQL directo: Prisma no toca @updatedAt solo. Sin esto, la copia
          -- local del catálogo (#40) de otras sucursales no se entera del
          -- precio nuevo hasta la sincronización completa diaria.
          "updatedAt" = now()
        FROM (VALUES ${Prisma.join(
          cambios.map((c) => Prisma.sql`(${c.id}::int, ${c.cantidad}::int, ${num(c.costo)}, ${num(c.venta)}, ${num(c.mayorista)})`)
        )}) AS v(id, cantidad, costo, venta, mayorista)
        WHERE p.id = v.id AND p."empresaId" = ${empresaId}`;

      // 2) Historial de precios en una consulta.
      if (historial.length > 0) await tx.historialPrecio.createMany({ data: historial });

      // 3) Pago (si se paga algo ahora): se RESTA del saldo actual (no se
      //    pisa con uno calculado antes) y se verifica que alcance con el
      //    saldo de este momento. El movimiento con compraId es el que
      //    cuentan el cierre de caja y el flujo de caja.
      if (montoPago > 0 && cuentaPagoId != null) {
        const cuenta = await tx.cuenta.update({
          where: { id: cuentaPagoId },
          data: { saldoActual: { decrement: montoADebitar } },
        });
        if (cuenta.saldoActual < 0) throw new SaldoInsuficienteError();

        await tx.movimientoCaja.create({
          data: {
            empresaId,
            cuentaId: cuentaPagoId,
            tipo: "EGRESO",
            concepto: "PAGO_A_PROVEEDOR",
            monto: montoADebitar,
            saldoResultante: cuenta.saldoActual,
            compraId: compra!.id,
            sucursalId,
            detalle: pagaTodo ? null : `Pago parcial de la compra #${compra!.numero}`,
          },
        });
      }

      // Guard atómico: si la confirmaron en otra pestaña, no se suma dos veces.
      const marcada = await tx.compra.updateMany({
        where: { id: compra!.id, empresaId, confirmada: false, cancelada: false },
        data: { confirmada: true },
      });
      if (marcada.count === 0) throw new Error("La compra ya fue confirmada o cancelada");

      return tx.compra.update({
        where: { id: compra!.id },
        data: {
          confirmada: true,
          recibida: true,
          pagada: pagaTodo,
          montoPagado: montoPago,
          // Sin pago no sale de ninguna cuenta.
          cuentaId: montoPago > 0 ? cuentaPagoId : null,
          cotizacionUsada: cotizacion,
          totalARS,
        },
        include: { items: true },
      });
    });

    return NextResponse.json(compraActualizada);
  } catch (error: any) {
    if (error instanceof SaldoInsuficienteError) {
      return NextResponse.json(
        { error: "La cuenta seleccionada no tiene saldo suficiente para pagar esta compra" },
        { status: 409 }
      );
    }
    console.error("Error al confirmar compra:", error);
    return NextResponse.json(
      { error: error.message || "Error al confirmar la compra" },
      { status: 500 }
    );
  }
}
