import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import {
  agruparPorProducto,
  costoPonderado,
  redondearPrecio,
  type ModoCosto,
} from "@/lib/calculos/actualizacion-precios";

const TIPOS_CUENTA_USD = ["EFECTIVO_USD", "BANCO_USD"];

type Moneda = "USD" | "ARS";

/**
 * GET: vista previa de cómo quedarían costos y precios si se confirma.
 * POST: confirma la compra (stock, costos, precios y caja).
 *
 * El POST acepta opcionalmente { precios: DecisionPrecio[] } con lo que se
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

    const { cotizacion, modoPorDefecto } = await contexto();
    const totalARS = compra!.totalUSD * cotizacion;
    const cuentaEsUSD = TIPOS_CUENTA_USD.includes(compra!.cuenta.tipo);
    const montoADebitar = cuentaEsUSD ? compra!.totalUSD : totalARS;
    const nuevoSaldoCuenta = compra!.cuenta.saldoActual - montoADebitar;

    if (nuevoSaldoCuenta < 0) {
      return NextResponse.json(
        { error: "La cuenta seleccionada no tiene saldo suficiente para pagar esta compra" },
        { status: 409 }
      );
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

      for (const g of grupos) {
        const producto = porId.get(g.productoId)!;
        const moneda = producto.monedaPrecio as Moneda;
        const dataUpdate: Prisma.ProductoUpdateInput = { stockActual: producto.stockActual + g.cantidad };
        const historial: { campo: "COSTO" | "MINORISTA" | "MAYORISTA"; anterior: number | null; nuevo: number; detalle: string }[] = [];

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
            dataUpdate.precioCosto = nuevoCosto;
            historial.push({
              campo: "COSTO", anterior: producto.precioCosto, nuevo: nuevoCosto,
              detalle: `Compra #${compra!.id} confirmada (${decision.costo === "PONDERADO" ? "costo promedio ponderado" : "costo de la compra"})`,
            });
          }
        }
        if (decision?.precioVenta != null) {
          const nuevo = redondearPrecio(decision.precioVenta, moneda);
          if (nuevo !== producto.precioVenta) {
            dataUpdate.precioVenta = nuevo;
            historial.push({ campo: "MINORISTA", anterior: producto.precioVenta, nuevo, detalle: `Compra #${compra!.id} confirmada` });
          }
        }
        if (decision?.precioMayorista != null) {
          const nuevo = redondearPrecio(decision.precioMayorista, moneda);
          if (nuevo !== producto.precioMayorista) {
            dataUpdate.precioMayorista = nuevo;
            historial.push({
              campo: "MAYORISTA", anterior: producto.precioMayorista, nuevo, detalle: `Compra #${compra!.id} confirmada`,
            });
          }
        }

        await tx.producto.update({ where: { id: producto.id }, data: dataUpdate });
        for (const h of historial) {
          await tx.historialPrecio.create({
            data: {
              productoId: producto.id, empresaId, campo: h.campo,
              valorAnterior: h.anterior, valorNuevo: h.nuevo,
              origen: "COMPRA_CONFIRMADA", detalle: h.detalle,
            },
          });
        }
      }

      // Movimiento de caja: recién ahora sale la plata.
      await tx.cuenta.update({
        where: { id: compra!.cuentaId },
        data: { saldoActual: nuevoSaldoCuenta },
      });

      await tx.movimientoCaja.create({
        data: {
          empresaId,
          cuentaId: compra!.cuentaId,
          tipo: "EGRESO",
          concepto: "PAGO_A_PROVEEDOR",
          monto: montoADebitar,
          saldoResultante: nuevoSaldoCuenta,
          compraId: compra!.id,
        },
      });

      return tx.compra.update({
        where: { id: compra!.id },
        data: {
          confirmada: true,
          recibida: true,
          pagada: true,
          cotizacionUsada: cotizacion,
          totalARS,
        },
        include: { items: true },
      });
    });

    return NextResponse.json(compraActualizada);
  } catch (error: any) {
    console.error("Error al confirmar compra:", error);
    return NextResponse.json(
      { error: error.message || "Error al confirmar la compra" },
      { status: 500 }
    );
  }
}
