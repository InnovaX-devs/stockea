import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerSucursalIdActual, requerirSucursalId } from "@/lib/sucursal";
import { ajustarStock } from "@/lib/stock";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const empresaId = await obtenerEmpresaIdActual();
    const { id } = await params;
    const productoId = Number(id);

    if (isNaN(productoId)) {
      return NextResponse.json(
        { error: "El ID del producto debe ser un número válido" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const productoAnterior = await prisma.producto.findFirst({
      where: { id: productoId, empresaId },
    });

    if (!productoAnterior) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    // Conversión segura de precios
    const nuevoCosto = Number(body.precioCosto);
    const nuevoVenta = Number(body.precioVenta);

    if (isNaN(nuevoCosto) || isNaN(nuevoVenta)) {
      return NextResponse.json(
        { error: "Los precios deben ser números válidos" },
        { status: 400 }
      );
    }

    const nuevoMayorista =
      body.precioMayorista !== undefined &&
      body.precioMayorista !== "" &&
      body.precioMayorista !== null &&
      !isNaN(Number(body.precioMayorista))
        ? Number(body.precioMayorista)
        : null;

    const nuevoOferta =
      body.precioOferta !== undefined &&
      body.precioOferta !== "" &&
      body.precioOferta !== null &&
      !isNaN(Number(body.precioOferta))
        ? Number(body.precioOferta)
        : null;

    // Ubicación en depósito
    const ubicacionDeposito =
      body.ubicacion && String(body.ubicacion).trim() !== ""
        ? String(body.ubicacion).trim()
        : null;

    // Contenido en ml de la botella
    const contenidoMl =
      body.contenidoMl !== undefined &&
      body.contenidoMl !== "" &&
      body.contenidoMl !== null &&
      !isNaN(Number(body.contenidoMl))
        ? Number(body.contenidoMl)
        : null;

    // Código de barras
    const codigoBarras =
      body.codigoBarras && String(body.codigoBarras).trim() !== ""
        ? String(body.codigoBarras).trim()
        : null;

    // Marca y Categoría (Int)
    const marcaId =
      body.marcaId && !isNaN(Number(body.marcaId))
        ? Number(body.marcaId)
        : null;

    const categoriaId =
      body.categoriaId && !isNaN(Number(body.categoriaId))
        ? Number(body.categoriaId)
        : null;

    const stockActual = !isNaN(Number(body.stockActual))
      ? Number(body.stockActual)
      : 0;

    // Stock: el formulario manda también el stock que había cuando se abrió
    // (stockOriginal). Se aplica SOLO la diferencia que cargó el usuario, así
    // no se pisan las ventas o pedidos armados mientras el formulario estaba
    // abierto. Si no cambió el stock, no se toca.
    const stockOriginal =
      body.stockOriginal !== undefined && body.stockOriginal !== null && !isNaN(Number(body.stockOriginal))
        ? Number(body.stockOriginal)
        : null;
    // La diferencia se aplica en la sucursal actual (src/lib/stock.ts mantiene
    // el total del producto). Sin stockOriginal (pantallas viejas), la
    // diferencia es contra el total guardado.
    const diferenciaStock =
      stockOriginal === null ? stockActual - productoAnterior.stockActual : stockActual - stockOriginal;
    let sucursalId: number | null = null;
    if (diferenciaStock !== 0) {
      try {
        sucursalId = await requerirSucursalId();
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Elegí una sucursal para cambiar el stock." },
          { status: 400 }
        );
      }
    }

    const stockMinimo = !isNaN(Number(body.stockMinimo))
      ? Number(body.stockMinimo)
      : 0;

    // El stock mínimo también es por sucursal. Con una sola sucursal se
    // guarda en la principal; en "Todas" (donde se ve la suma) no se puede
    // cambiar, hay que elegir una sucursal.
    const sucursalMinimo = await obtenerSucursalIdActual();
    const cambiaMinimo = body.stockMinimo !== undefined && stockMinimo !== productoAnterior.stockMinimo;
    if (sucursalMinimo == null && cambiaMinimo) {
      return NextResponse.json(
        { error: "Elegí una sucursal en la barra superior para cambiar el stock mínimo." },
        { status: 400 }
      );
    }

    // Auditoría e historial de precios.
    // Se arma ANTES del update para comparar contra los valores previos.
    const registrosHistorial: Prisma.HistorialPrecioCreateManyInput[] = [];

    // Cambio en Precio Costo
    if (Number(productoAnterior.precioCosto) !== nuevoCosto) {
      registrosHistorial.push({
        productoId,
        empresaId,
        campo: "COSTO",
        valorAnterior: Number(productoAnterior.precioCosto),
        valorNuevo: nuevoCosto,
        origen: "MANUAL",
      });
    }

    // Cambio en Precio Venta Minorista
    if (Number(productoAnterior.precioVenta) !== nuevoVenta) {
      registrosHistorial.push({
        productoId,
        empresaId,
        campo: "MINORISTA",
        valorAnterior: Number(productoAnterior.precioVenta),
        valorNuevo: nuevoVenta,
        origen: "MANUAL",
      });
    }

    // Cambio en Precio Mayorista
    const mayoristaAnterior = productoAnterior.precioMayorista
      ? Number(productoAnterior.precioMayorista)
      : null;

    if (mayoristaAnterior !== nuevoMayorista && nuevoMayorista !== null) {
      registrosHistorial.push({
        productoId,
        empresaId,
        campo: "MAYORISTA",
        valorAnterior: mayoristaAnterior,
        valorNuevo: nuevoMayorista,
        origen: "MANUAL",
      });
    }

    if (marcaId) {
      const marca = await prisma.marca.findFirst({ where: { id: marcaId, empresaId } });
      if (!marca) {
        return NextResponse.json({ error: "La marca seleccionada no existe" }, { status: 400 });
      }
    }
    if (categoriaId) {
      const categoria = await prisma.categoria.findFirst({ where: { id: categoriaId, empresaId } });
      if (!categoria) {
        return NextResponse.json({ error: "La categoría seleccionada no existe" }, { status: 400 });
      }
    }

    // Update del producto e inserción del historial en una misma transacción.
    // El where solo usa "id" porque la pertenencia a la empresa ya se validó
    // arriba (productoAnterior); Prisma.update no acepta un where compuesto
    // sobre una FK no-única.
    const productoActualizado = await prisma.$transaction(async (tx) => {
      // Stock primero (orden de bloqueo de src/lib/stock.ts).
      if (sucursalId != null) {
        await ajustarStock(tx, empresaId, sucursalId, productoId, diferenciaStock);
      }
      // Mínimo de la sucursal; en "Producto" queda la suma de todas.
      let minimoTotal = productoAnterior.stockMinimo;
      if (sucursalMinimo != null && body.stockMinimo !== undefined) {
        await tx.stockSucursal.upsert({
          where: { productoId_sucursalId: { productoId, sucursalId: sucursalMinimo } },
          create: { productoId, sucursalId: sucursalMinimo, stockMinimo },
          update: { stockMinimo },
        });
        const suma = await tx.stockSucursal.aggregate({ where: { productoId }, _sum: { stockMinimo: true } });
        minimoTotal = suma._sum.stockMinimo ?? 0;
      }
      const actualizado = await tx.producto.update({
        where: { id: productoId },
        data: {
          nombre: String(body.nombre || "").trim(),
          codigoBarras,
          ubicacionDeposito,
          contenidoMl,
          marcaId,
          categoriaId,
          stockMinimo: minimoTotal,
          destacado: Boolean(body.destacado),
          monedaPrecio: body.monedaPrecio || "USD",
          precioCosto: nuevoCosto,
          precioVenta: nuevoVenta,
          precioMayorista: nuevoMayorista,
          precioOferta: nuevoOferta,
          // Solo si viene (pantallas que no la muestran no la tocan).
          ...([0, 2.5, 5, 10.5, 21, 27].includes(Number(body.alicuotaIva)) ? { alicuotaIva: Number(body.alicuotaIva) } : {}),
          fotoUrl: body.fotoUrl !== undefined ? body.fotoUrl : undefined,
        },
      });
      if (registrosHistorial.length > 0) {
        await tx.historialPrecio.createMany({ data: registrosHistorial });
      }
      return actualizado;
    });

    // La foto vieja se borra recién ahora, con el producto ya guardado: si el
    // guardado fallaba, el producto quedaba apuntando a una foto borrada.
    const fotoAnterior = productoAnterior.fotoUrl;
    if (
      body.fotoUrl !== undefined &&
      fotoAnterior &&
      fotoAnterior !== body.fotoUrl &&
      fotoAnterior.includes("public.blob.vercel-storage.com")
    ) {
      try {
        await del(fotoAnterior);
      } catch (err) {
        console.warn("No se pudo eliminar la imagen anterior de Vercel Blob:", err);
      }
    }

    return NextResponse.json(productoActualizado);
  } catch (error: any) {
    console.error("Error al actualizar producto:", error);
    return NextResponse.json(
      { error: error.message || "Error interno al actualizar el producto" },
      { status: 500 }
    );
  }
}