import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPresupuestoPorId } from "../queries";
import { calcularEstadoEfectivo } from "@/lib/presupuestos";
import { obtenerConfiguracion } from "@/lib/configuracion";

export default async function DetallePresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarPresupuestos) notFound();

  const { id } = await params;
  const presupuestoId = Number(id);
  if (Number.isNaN(presupuestoId)) notFound();

  const presupuesto = await obtenerPresupuestoPorId(presupuestoId);
  if (!presupuesto) notFound();

  const estadoEfectivo = calcularEstadoEfectivo(presupuesto.estado, presupuesto.fechaVencimiento);
  const esBorrador = estadoEfectivo === "BORRADOR";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Presupuesto #{presupuesto.id}</h1>
          <EstadoBadge estado={estadoEfectivo} />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/presupuestos" className="text-sm text-primary">
            ← Volver a la lista
          </Link>
          {esBorrador && (
            <Link
                href={`/ventas?presupuestoId=${presupuesto.id}`}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm"
            >
                Convertir a venta
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl m-4 border border-border overflow-y-auto p-6 space-y-6">
        <div>
          <p className="text-sm text-text-dim">Cliente</p>
          <p className="text-base font-medium text-text">
            {presupuesto.cliente
              ? `${presupuesto.cliente.nombre} ${presupuesto.cliente.apellido ?? ""}`.trim()
              : "Consumidor final"}
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-dim">
              <th className="py-2">Ítem</th>
              <th className="py-2">Cant.</th>
              <th className="py-2">Precio unit.</th>
              <th className="py-2">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {presupuesto.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-2">{item.descripcion}</td>
                <td className="py-2">{item.cantidad}</td>
                <td className="py-2">${item.precioUnitario.toLocaleString("es-AR")}</td>
                <td className="py-2">{item.tipoPrecio === "MAYORISTA" ? "Mayorista" : "Minorista"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end text-base font-semibold text-text">
          Total: ${presupuesto.total.toLocaleString("es-AR")}
        </div>

        {presupuesto.observaciones && (
          <div>
            <p className="text-sm text-text-dim">Observaciones</p>
            <p className="text-sm text-text">{presupuesto.observaciones}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: "BORRADOR" | "VENCIDO" | "CONVERTIDO" }) {
  const estilos: Record<string, string> = {
    BORRADOR: "bg-[#eef2ff] text-primary",
    VENCIDO: "bg-[#fef3c7] text-[#92400e]",
    CONVERTIDO: "bg-[#dcfce7] text-[#166534]",
  };
  return (
    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${estilos[estado]}`}>
      {estado}
    </span>
  );
}