import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioActualOpcional } from "@/lib/empresa";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import { crearVentaInterna, type VentaInput } from "@/lib/ventas";

export const dynamic = "force-dynamic";

/** Una venta hecha sin conexión no puede ser de más de este tiempo atrás (reloj mal puesto). */
const MAX_ANTIGUEDAD_MS = 30 * 24 * 60 * 60 * 1000;
/** Tolerancia con relojes adelantados unos minutos. */
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sincronización de ventas hechas sin conexión (issue #41).
 *
 * POST /api/sync/ventas — UNA venta por pedido (la cola del navegador las
 * manda en orden, de a una). Cuerpo:
 *   { idCliente, empresaId, sucursalId, fecha, clienteId, items, pagos,
 *     descuentoMonto, descuentoPorcentaje, totalARS }
 *
 * Reutiliza crearVentaInterna (la misma que "Confirmar venta"), con tres
 * diferencias porque la venta YA pasó en el mostrador:
 * - Si no alcanza el stock, se vende igual: queda negativo y la venta se
 *   marca (Venta.stockNegativo) para avisarle al administrador.
 * - No se rechaza porque la caja esté cerrada ahora.
 * - Se guarda con la fecha real de la venta (acotada: ni futura ni de hace
 *   más de 30 días).
 *
 * Idempotente por `idCliente`: si esa venta ya está guardada, devuelve la
 * misma (`duplicada: true`) sin tocar stock, caja ni numeración.
 *
 * Respuestas:
 *   200 { success: true, ventaId, numero, duplicada?, stockNegativo?, productosStockNegativo? }
 *   400 / 422 { success: false, error, permanente: true }  → no reintentar sola
 *   409 { success: false, codigo: "OTRA_EMPRESA" }          → la venta es de otra empresa (otra sesión en esta compu)
 *   401 / 5xx                                              → reintentar más tarde
 *
 * Nunca se confía en el empresaId ni en el sucursalId del navegador: la
 * empresa se compara con la de la sesión y la sucursal se valida contra las
 * que ese usuario puede usar (igual que obtenerContextoSucursal).
 */

function rechazo(error: string, status: 400 | 422, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, permanente: true, ...extra }, { status });
}

const esEntero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const esMonto = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e12;

/** Valida el cuerpo a mano (viene del navegador: no se asume nada). */
function leerVenta(body: unknown): { ok: true; venta: VentaInput; sucursalId: number; empresaId: number; fecha: string } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Venta inválida." };
  const b = body as Record<string, unknown>;

  if (typeof b.idCliente !== "string" || !UUID.test(b.idCliente)) return { ok: false, error: "Falta el identificador de la venta." };
  if (!esEntero(b.empresaId)) return { ok: false, error: "Falta la empresa de la venta." };
  if (!esEntero(b.sucursalId)) return { ok: false, error: "Falta la sucursal de la venta." };
  if (typeof b.fecha !== "string") return { ok: false, error: "Falta la fecha de la venta." };
  if (b.clienteId != null && !esEntero(b.clienteId)) return { ok: false, error: "Cliente inválido." };
  if (!esMonto(b.totalARS)) return { ok: false, error: "Total inválido." };
  for (const campo of ["descuentoMonto", "descuentoPorcentaje"] as const) {
    if (b[campo] != null && !esMonto(b[campo])) return { ok: false, error: "Descuento inválido." };
  }

  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 500) return { ok: false, error: "La venta no tiene productos." };
  const items: VentaInput["items"] = [];
  for (const raw of b.items) {
    const it = raw as Record<string, unknown> | null;
    if (!it || !esEntero(it.productoId) || !esEntero(it.cantidad) || it.cantidad > 1_000_000) return { ok: false, error: "Producto inválido en la venta." };
    if (!esMonto(it.precioUnitarioArs)) return { ok: false, error: "Precio inválido en la venta." };
    if (it.tipoPrecio !== "MINORISTA" && it.tipoPrecio !== "MAYORISTA") return { ok: false, error: "Tipo de precio inválido." };
    items.push({ productoId: it.productoId, cantidad: it.cantidad, precioUnitarioArs: it.precioUnitarioArs, tipoPrecio: it.tipoPrecio });
  }

  if (!Array.isArray(b.pagos) || b.pagos.length > 20) return { ok: false, error: "Pagos inválidos." };
  const pagos: VentaInput["pagos"] = [];
  for (const raw of b.pagos) {
    const p = raw as Record<string, unknown> | null;
    if (!p || !esEntero(p.cuentaId) || !esMonto(p.monto)) return { ok: false, error: "Pago inválido." };
    if (p.montoUSD != null && !esMonto(p.montoUSD)) return { ok: false, error: "Pago en dólares inválido." };
    pagos.push({ cuentaId: p.cuentaId, monto: p.monto, montoUSD: (p.montoUSD as number | null | undefined) ?? null });
  }

  return {
    ok: true,
    sucursalId: b.sucursalId,
    empresaId: b.empresaId,
    fecha: b.fecha,
    venta: {
      idCliente: b.idCliente,
      clienteId: (b.clienteId as number | null | undefined) ?? null,
      items,
      pagos,
      descuentoMonto: (b.descuentoMonto as number | null | undefined) ?? null,
      descuentoPorcentaje: (b.descuentoPorcentaje as number | null | undefined) ?? null,
      totalARS: b.totalARS,
      cotizacionUSD: 0, // el servidor usa la de Configuración
      presupuestoId: null,
    },
  };
}

/** Momento real de la venta, sin dejar pasar fechas futuras ni disparatadas. */
function acotarFecha(iso: string): Date {
  const ahora = Date.now();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || t > ahora + TOLERANCIA_FUTURO_MS || t < ahora - MAX_ANTIGUEDAD_MS) return new Date(ahora);
  return new Date(Math.min(t, ahora));
}

export async function POST(request: NextRequest) {
  const usuario = await obtenerUsuarioActualOpcional();
  if (!usuario) return NextResponse.json({ success: false, error: "Sesión vencida." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rechazo("Venta inválida.", 400);
  }

  const leida = leerVenta(body);
  if (!leida.ok) return rechazo(leida.error, 400);

  // La venta tiene que ser de la empresa de la sesión. Si no (otro usuario
  // inició sesión en esta compu con ventas pendientes de otra empresa), no se
  // toca: el navegador la deja en la cola para cuando vuelva su dueño.
  if (leida.empresaId !== usuario.empresaId) {
    return NextResponse.json({ success: false, codigo: "OTRA_EMPRESA", error: "La venta es de otra empresa." }, { status: 409 });
  }

  // La sucursal tiene que ser una que este usuario pueda usar: el empleado,
  // solo la suya; el admin, cualquiera de las habilitadas (pudo haber
  // cambiado de sucursal mientras la venta esperaba).
  const contexto = await obtenerContextoSucursal();
  const permitida =
    contexto.puedeElegir || !contexto.actual
      ? contexto.sucursales.some((s) => s.id === leida.sucursalId)
      : contexto.actual.id === leida.sucursalId;
  if (!permitida) return rechazo("No tenés acceso a la sucursal donde se hizo esta venta.", 422, { codigo: "SUCURSAL_NO_PERMITIDA" });

  const resultado = await crearVentaInterna(leida.venta, true, {
    sucursalId: leida.sucursalId,
    fecha: acotarFecha(leida.fecha),
    permitirStockNegativo: true,
    omitirControlCaja: true,
  });

  if (!resultado.success) return rechazo(resultado.error, 422);
  return NextResponse.json(resultado);
}
