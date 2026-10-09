import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";
import { toArs } from "@/lib/currency";
import { conStockDeSucursal, sucursalParaMostrarStock } from "@/lib/stock-sucursal";

export type ProductoInventarioItem = {
  id: number;
  nombre: string;
  marca: string | null;
  stockActual: number;
  stockMinimo: number;
  costoUnitarioARS: number;
  valorStockARS: number;
  ultimaVenta: Date | null;
};

export type InventarioData = {
  valorStockCostoARS: number;
  valorStockVentaARS: number;
  cantidadSinStock: number;
  cantidadStockBajo: number;
  productosStockBajo: ProductoInventarioItem[];
  productosSinMovimiento: ProductoInventarioItem[];
  diasSinMovimiento: number;
};

export async function obtenerInventario(diasSinMovimiento = 60): Promise<InventarioData> {
  const empresaId = await obtenerEmpresaIdActual();
  const configuracion = await obtenerConfiguracion();
  const cotizacion = configuracion.cotizacionUSD || 1;

  // Inventario de la sucursal actual; en "Todas", el de toda la empresa.
  const sucursalId = await sucursalParaMostrarStock();
  const productosBase = await prisma.producto.findMany({
    where: { empresaId, activo: true },
    select: {
      id: true,
      nombre: true,
      precioCosto: true,
      precioVenta: true,
      monedaPrecio: true,
      stockActual: true,
      stockMinimo: true,
      marca: { select: { nombre: true } },
    },
  });
  const productos = await conStockDeSucursal(productosBase, sucursalId);

  // Última venta por producto: un groupBy alcanza, no hace falta traer cada
  // ItemVenta — sólo nos interesa la fecha más reciente por producto.
  const ultimasVentas = await prisma.itemVenta.groupBy({
    by: ["productoId"],
    where: {
      productoId: { not: null },
      venta: { empresaId, ...(sucursalId != null ? { sucursalId } : {}), estadoPago: { notIn: ["ANULADA", "CANCELADA"] } },
    },
    _max: { id: true },
  });

  // groupBy no puede traer la fecha de la venta relacionada directo, así que
  // resolvemos la fecha real en un segundo paso, sólo para los ítems más
  // recientes encontrados arriba (son pocos: uno por producto).
  const idsItems = ultimasVentas.map((u) => u._max.id).filter((id): id is number => id != null);
  const itemsConFecha = idsItems.length
    ? await prisma.itemVenta.findMany({
        where: { id: { in: idsItems } },
        select: { productoId: true, venta: { select: { fecha: true } } },
      })
    : [];
  const ultimaVentaPorProducto = new Map<number, Date>();
  for (const item of itemsConFecha) {
    if (item.productoId != null) ultimaVentaPorProducto.set(item.productoId, item.venta.fecha);
  }

  const limiteSinMovimiento = new Date();
  limiteSinMovimiento.setDate(limiteSinMovimiento.getDate() - diasSinMovimiento);

  let valorStockCostoARS = 0;
  let valorStockVentaARS = 0;
  let cantidadSinStock = 0;
  let cantidadStockBajo = 0;
  const productosStockBajo: ProductoInventarioItem[] = [];
  const productosSinMovimiento: ProductoInventarioItem[] = [];

  for (const p of productos) {
    const costoARS = toArs(p.precioCosto, p.monedaPrecio, cotizacion);
    const ventaARS = toArs(p.precioVenta, p.monedaPrecio, cotizacion);
    valorStockCostoARS += costoARS * p.stockActual;
    valorStockVentaARS += ventaARS * p.stockActual;

    const ultimaVenta = ultimaVentaPorProducto.get(p.id) ?? null;

    const item: ProductoInventarioItem = {
      id: p.id,
      nombre: p.nombre,
      marca: p.marca?.nombre ?? null,
      stockActual: p.stockActual,
      stockMinimo: p.stockMinimo,
      costoUnitarioARS: costoARS,
      valorStockARS: costoARS * p.stockActual,
      ultimaVenta,
    };

    if (p.stockActual <= 0) {
      cantidadSinStock++;
    } else if (p.stockActual <= p.stockMinimo) {
      cantidadStockBajo++;
      productosStockBajo.push(item);
    }

    if (!ultimaVenta || ultimaVenta < limiteSinMovimiento) {
      productosSinMovimiento.push(item);
    }
  }

  productosStockBajo.sort((a, b) => a.stockActual - b.stockActual);
  productosSinMovimiento.sort((a, b) => (a.ultimaVenta?.getTime() ?? 0) - (b.ultimaVenta?.getTime() ?? 0));

  return {
    valorStockCostoARS,
    valorStockVentaARS,
    cantidadSinStock,
    cantidadStockBajo,
    productosStockBajo,
    productosSinMovimiento,
    diasSinMovimiento,
  };
}
