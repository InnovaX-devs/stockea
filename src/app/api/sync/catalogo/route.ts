import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import { filtroCuentasDeSucursal } from "@/lib/cuenta-sucursal";
import { conStockDeSucursal } from "@/lib/stock-sucursal";
import { obtenerConfiguracion } from "@/lib/configuracion";

export const dynamic = "force-dynamic";

/** Se resta al "sincronizadoEn" para no perder cambios de transacciones en vuelo. */
const SOLAPE_MS = 5000;

/**
 * Sincronización del catálogo para la copia local (issue #40).
 *
 * GET /api/sync/catalogo?desde=<ISO>&alcance=<empresa:sucursal>
 * - Sin `desde`, o si el `alcance` no coincide (cambió de sucursal/empresa):
 *   respuesta COMPLETA (`completo: true`) → el cliente reemplaza todo.
 * - Con `desde`: solo lo modificado después (`updatedAt > desde`). Los productos
 *   desactivados vienen con `activo: false` para que el cliente los borre.
 * - Cuentas: siempre completas (pocas filas, y así se enteran de bajas).
 *
 * Nunca se envía precioCosto (ni a admin): la copia local no lo necesita y
 * así no queda guardado en el dispositivo. Stock = el de la sucursal actual.
 */
export async function GET(request: NextRequest) {
  const inicio = Date.now();
  const { empresaId } = await obtenerUsuarioActual();
  // La copia del catálogo para vender sin conexión es del plan Premium.
  // (La subida de ventas que ya quedaron en cola, /api/sync/ventas, no se
  // bloquea: si una empresa baja de plan, esas ventas no se pierden.)
  if (!(await obtenerConfiguracion()).habilitarSinConexion) {
    return NextResponse.json({ error: "Vender sin conexión está disponible en el plan Pro." }, { status: 403 });
  }
  const { actual } = await obtenerContextoSucursal();
  const sucursalId = actual?.id ?? null;
  const alcance = `${empresaId}:${sucursalId ?? "todas"}`;

  const params = request.nextUrl.searchParams;
  const desdeParam = params.get("desde");
  const desdeFecha = desdeParam ? new Date(desdeParam) : null;
  const desdeValido = desdeFecha && !Number.isNaN(desdeFecha.getTime()) ? desdeFecha : null;
  const cambios = desdeValido && params.get("alcance") === alcance ? desdeValido : null;

  const whereProductos: Prisma.ProductoWhereInput = {
    empresaId,
    ...(cambios
      ? {
          OR: [
            { updatedAt: { gt: cambios } },
            { stocks: { some: { updatedAt: { gt: cambios }, ...(sucursalId ? { sucursalId } : {}) } } },
          ],
        }
      : { activo: true }),
  };

  const [productosDb, clientes, cuentas, config] = await Promise.all([
    prisma.producto.findMany({
      where: whereProductos,
      select: {
        id: true,
        nombre: true,
        codigoBarras: true,
        stockActual: true,
        monedaPrecio: true,
        precioVenta: true,
        precioMayorista: true,
        contenido: true,
        unidadContenido: true,
        activo: true,
        precioAbierto: true,
        controlaStock: true,
        marca: { select: { nombre: true } },
        modeloId: true,
        talle: true,
        color: true,
        modelo: { select: { nombre: true } },
      },
    }),
    prisma.cliente.findMany({
      where: { empresaId, ...(cambios ? { updatedAt: { gt: cambios } } : {}) },
      select: { id: true, nombre: true, apellido: true, telefono: true, esMayorista: true },
    }),
    prisma.cuenta.findMany({
      where: { empresaId, activa: true, AND: [filtroCuentasDeSucursal(sucursalId)] },
      orderBy: [{ favorita: "desc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, tipo: true, favorita: true, color: true },
    }),
    prisma.configuracion.findUnique({
      where: { empresaId },
      select: { cotizacionUSD: true, usaCotizacionUSD: true },
    }),
  ]);

  // Stock de la sucursal actual (o total si es "Todas" / sucursal única).
  const productos = (await conStockDeSucursal(productosDb)).map(({ marca, modelo, ...p }) => ({
    ...p,
    marcaNombre: marca?.nombre ?? null,
    modeloNombre: modelo?.nombre ?? null,
  }));

  return NextResponse.json(
    {
      sincronizadoEn: new Date(inicio - SOLAPE_MS).toISOString(),
      completo: cambios === null,
      alcance,
      productos,
      clientes,
      cuentas,
      cotizacionUSD: config?.cotizacionUSD ?? 0,
      usaCotizacionUSD: config?.usaCotizacionUSD ?? false,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}