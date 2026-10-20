import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { filtroPorSucursal, obtenerSucursalIdActual } from "@/lib/sucursal";
import { calcularReporteRopa } from "@/lib/reportes-ropa";
import type { ReporteRopaData } from "@/types/reporte-ropa";

export async function obtenerReporteRopa(rango: { desde: Date; hasta: Date }): Promise<ReporteRopaData> {
  const empresaId = await obtenerEmpresaIdActual();
  const sucursalId = await obtenerSucursalIdActual();

  const ventas = await prisma.venta.findMany({
    where: {
      empresaId,
      ...filtroPorSucursal(sucursalId),
      fecha: { gte: rango.desde, lt: rango.hasta },
      estadoPago: { notIn: ["ANULADA", "CANCELADA"] },
    },
    select: {
      totalARS: true,
      montoPagado: true,
      cotizacionUsada: true,
      items: {
        select: {
          cantidad: true,
          precioUnitarioUSD: true,
          producto: {
            select: { modeloId: true, talle: true, color: true, modelo: { select: { nombre: true } } },
          },
        },
      },
    },
  });

  return calcularReporteRopa(
    ventas.map((v) => ({
      totalARS: v.totalARS,
      montoPagado: v.montoPagado,
      cotizacionUsada: v.cotizacionUsada,
      items: v.items.map((i) => ({
        cantidad: i.cantidad,
        precioUnitarioUSD: i.precioUnitarioUSD,
        modeloId: i.producto?.modeloId ?? null,
        modeloNombre: i.producto?.modelo?.nombre ?? null,
        talle: i.producto?.talle ?? null,
        color: i.producto?.color ?? null,
      })),
    }))
  );
}