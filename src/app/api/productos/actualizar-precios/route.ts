import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";

export const dynamic = "force-dynamic";

interface ActualizarPreciosPayload {
  productoIds: number[];
  tipoAjuste: "PORCENTAJE" | "VALOR_FIJO";
  valor: number;
  tiposPrecio: ("costo" | "minorista" | "mayorista" | "oferta")[];
}

export async function POST(request: NextRequest) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const body: ActualizarPreciosPayload = await request.json();
    const { productoIds, tipoAjuste, valor, tiposPrecio } = body;

    // Validaciones
    if (!productoIds || !Array.isArray(productoIds) || productoIds.length === 0) {
      return NextResponse.json(
        { error: "Debes seleccionar al menos un producto" },
        { status: 400 }
      );
    }

    if (isNaN(valor) || valor === 0) {
      return NextResponse.json(
        { error: "El valor de ajuste debe ser un número distinto de 0" },
        { status: 400 }
      );
    }

    if (!tiposPrecio || tiposPrecio.length === 0) {
      return NextResponse.json(
        { error: "Debes seleccionar al menos un tipo de precio para ajustar" },
        { status: 400 }
      );
    }

    // Obtener los productos actuales a actualizar (solo de esta empresa —
    // si algún id de productoIds pertenece a otra empresa, queda afuera).
    const productos = await prisma.producto.findMany({
      where: { id: { in: productoIds }, empresaId },
    });

    if (productos.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron los productos seleccionados" },
        { status: 404 }
      );
    }

    // Función auxiliar de cálculo de precio
    const calcularNuevoPrecio = (precioActual: number | null): number | null => {
      if (precioActual === null) return null;
      let nuevo = 0;
      if (tipoAjuste === "PORCENTAJE") {
        nuevo = precioActual * (1 + valor / 100);
      } else {
        nuevo = precioActual + valor;
      }
      return Math.max(0, Math.round(nuevo * 100) / 100);
    };

    const historialRegistros: any[] = [];
    const updatesPromises: any[] = [];

    // Mapeo de campos en el modelo
    const campoMap: Record<string, string> = {
      costo: "precioCosto",
      minorista: "precioVenta",
      mayorista: "precioMayorista",
      oferta: "precioOferta",
    };

    for (const prod of productos) {
      const dataUpdate: Record<string, number | null> = {};

      for (const t of tiposPrecio) {
        const campo = campoMap[t];
        const precioAnterior = (prod as any)[campo] as number | null;

        if (precioAnterior !== null && precioAnterior !== undefined) {
          const nuevoPrecio = calcularNuevoPrecio(precioAnterior);

          if (nuevoPrecio !== null && nuevoPrecio !== precioAnterior) {
            dataUpdate[campo] = nuevoPrecio;

            // Historial de Precio por cada cambio. El historial no tiene el
            // tipo "oferta" (CampoPrecio: COSTO / MINORISTA / MAYORISTA): antes
            // se intentaba guardar "OFERTA" y fallaba TODA la actualización.
            const campoHistorial = ({ costo: "COSTO", minorista: "MINORISTA", mayorista: "MAYORISTA" } as const)[
              t as "costo" | "minorista" | "mayorista"
            ];
            if (campoHistorial) {
              historialRegistros.push({
                productoId: prod.id,
                empresaId,
                campo: campoHistorial,
                valorAnterior: precioAnterior,
                valorNuevo: nuevoPrecio,
                origen: "ACTUALIZACION_MASIVA",
              });
            }
          }
        }
      }

      if (Object.keys(dataUpdate).length > 0) {
        updatesPromises.push(
          prisma.producto.update({
            where: { id: prod.id },
            data: dataUpdate,
          })
        );
      }
    }

    // Ejecutar actualización e historial en una sola transacción
    await prisma.$transaction([
      ...updatesPromises,
      ...(historialRegistros.length > 0
        ? [prisma.historialPrecio.createMany({ data: historialRegistros })]
        : []),
    ]);

    return NextResponse.json({
      message: "Precios actualizados con éxito",
      cantidadAfectados: updatesPromises.length,
    });
  } catch (error: any) {
    console.error("Error al actualizar precios masivamente:", error);
    return NextResponse.json(
      { error: error.message || "Error interno al actualizar precios" },
      { status: 500 }
    );
  }
}