import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

export type ClienteDeudaItem = {
  clienteId: number;
  nombre: string;
  telefono: string | null;
  pendienteARS: number;
  diasVencidoMax: number;
  bucket: "0-30" | "31-60" | "61-90" | "90+";
};

export type CuentasPorCobrarData = {
  totalPendienteARS: number;
  buckets: { label: "0-30" | "31-60" | "61-90" | "90+"; totalARS: number; cantidad: number }[];
  clientes: ClienteDeudaItem[];
};

function bucketDe(dias: number): ClienteDeudaItem["bucket"] {
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  return "90+";
}

export async function obtenerCuentasPorCobrar(): Promise<CuentasPorCobrarData> {
  const empresaId = await obtenerEmpresaIdActual();

  const ventasPendientes = await prisma.venta.findMany({
    where: { empresaId, estadoPago: "A_CUENTA" },
    select: {
      totalARS: true,
      montoPagado: true,
      fecha: true,
      cliente: { select: { id: true, nombre: true, apellido: true, telefono: true } },
    },
  });

  const ahora = Date.now();
  const porCliente = new Map<number, ClienteDeudaItem>();

  for (const v of ventasPendientes) {
    if (!v.cliente) continue; // venta a "consumidor final" sin cliente asociado no puede quedar "a cuenta"; por las dudas, se ignora

    // Pesos enteros, igual que en la lista de clientes: los centavos de la
    // conversión USD / descuentos no cuentan como deuda.
    const pendiente = Math.max(0, Math.round(v.totalARS) - v.montoPagado);
    if (pendiente < 0.5) continue;

    const dias = Math.floor((ahora - v.fecha.getTime()) / (1000 * 60 * 60 * 24));

    const actual = porCliente.get(v.cliente.id);
    const nombreCompleto = `${v.cliente.nombre} ${v.cliente.apellido ?? ""}`.trim();

    if (actual) {
      actual.pendienteARS += pendiente;
      actual.diasVencidoMax = Math.max(actual.diasVencidoMax, dias);
    } else {
      porCliente.set(v.cliente.id, {
        clienteId: v.cliente.id,
        nombre: nombreCompleto,
        telefono: v.cliente.telefono,
        pendienteARS: pendiente,
        diasVencidoMax: dias,
        bucket: "0-30", // se recalcula abajo, con el máximo ya definitivo
      });
    }
  }

  const clientes = Array.from(porCliente.values()).map((c) => ({
    ...c,
    bucket: bucketDe(c.diasVencidoMax),
  }));
  clientes.sort((a, b) => b.diasVencidoMax - a.diasVencidoMax);

  const totalPendienteARS = clientes.reduce((acc, c) => acc + c.pendienteARS, 0);

  const buckets = (["0-30", "31-60", "61-90", "90+"] as const).map((label) => {
    const enBucket = clientes.filter((c) => c.bucket === label);
    return {
      label,
      totalARS: enBucket.reduce((acc, c) => acc + c.pendienteARS, 0),
      cantidad: enBucket.length,
    };
  });

  return { totalPendienteARS, buckets, clientes };
}
