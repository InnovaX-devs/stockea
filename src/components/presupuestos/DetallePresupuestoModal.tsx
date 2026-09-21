"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerDetallePresupuesto, type DetallePresupuesto } from "@/app/(dashboard)/presupuestos/actions";
import { formatFechaAR } from "@/lib/timezone";

const ESTADO_STYLES: Record<string, string> = {
  BORRADOR: "bg-surface-hover text-text-dim",
  VENCIDO: "bg-[#ffdad6] text-[#93000a]",
  CONVERTIDO: "bg-warning/20 text-warning",
};

const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  VENCIDO: "Vencido",
  CONVERTIDO: "Convertido",
};

export default function DetallePresupuestoModal({
  presupuestoId,
  onClose,
}: {
  presupuestoId: number;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<DetallePresupuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    obtenerDetallePresupuesto(presupuestoId).then((res) => {
      if (!activo) return;
      if (!res.success) {
        setError(res.error);
      } else {
        setDetalle(res.data);
      }
      setCargando(false);
    });

    return () => {
      activo = false;
    };
  }, [presupuestoId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Presupuesto #{presupuestoId}</h2>
              {detalle && (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTADO_STYLES[detalle.estado]}`}>
                  {ESTADO_LABEL[detalle.estado]}
                </span>
              )}
            </div>
            {detalle && (
              <p className="text-sm text-white mt-1">
                Creado {formatFechaAR(detalle.fecha)} · Vence{" "}
                {formatFechaAR(detalle.fechaVencimiento)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-white text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cargando && <p className="text-sm text-text-dim">Cargando...</p>}
          {error && <p className="text-sm text-danger">{error}</p>}

          {detalle && (
            <>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Cliente</p>
                <p className="text-base font-medium text-text">
                  {detalle.clienteNombre ?? "Consumidor final"}
                </p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-dim">
                    <th className="py-2">Producto</th>
                    <th className="py-2 text-right">Cant.</th>
                    <th className="py-2 text-right">P. Unit.</th>
                    <th className="py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((item) => (
                    <tr key={item.id} className="border-b border-border">
                      <td className="py-2">{item.descripcion}</td>
                      <td className="py-2 text-right">{item.cantidad}</td>
                      <td className="py-2 text-right">
                        ${item.precioUnitario.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 text-right font-medium">
                        ${item.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end text-base font-semibold text-text">
                Total: ${detalle.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </div>

              {detalle.observaciones && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
                    Observaciones
                  </p>
                  <p className="text-sm text-text">{detalle.observaciones}</p>
                </div>
              )}
            </>
          )}
        </div>

        {detalle?.puedeConvertir && (
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <Link
              href={`/ventas?presupuestoId=${detalle.id}`}
              className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium"
            >
              Convertir a venta
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}