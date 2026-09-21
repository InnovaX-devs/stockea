import { obtenerInventario } from "./queries";
import { formatCurrency } from "@/lib/currency";
import { TablaInventario } from "@/components/reportes/tabla-inventario";

export default async function InventarioReportePage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const params = await searchParams;
  const dias = Number(params.dias) > 0 ? Number(params.dias) : 60;
  const data = await obtenerInventario(dias);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">Stock a costo</p>
          <p className="mt-1 text-xl font-semibold text-text">
            {formatCurrency(data.valorStockCostoARS, "ARS")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">Stock a precio de venta</p>
          <p className="mt-1 text-xl font-semibold text-text">
            {formatCurrency(data.valorStockVentaARS, "ARS")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">Sin stock</p>
          <p className="mt-1 text-xl font-semibold text-danger">{data.cantidadSinStock}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-text-dim">Stock bajo</p>
          <p className="mt-1 text-xl font-semibold text-warning">{data.cantidadStockBajo}</p>
        </div>
      </div>

      <TablaInventario
        titulo="Productos con stock bajo"
        items={data.productosStockBajo}
        columnaExtra="stock"
        vacio="No hay productos con stock bajo."
      />

      <TablaInventario
        titulo={`Sin movimiento hace más de ${data.diasSinMovimiento} días`}
        items={data.productosSinMovimiento}
        columnaExtra="ultimaVenta"
        vacio="Todos los productos tuvieron movimiento reciente."
        filtroDias={data.diasSinMovimiento}
      />
    </div>
  );
}
