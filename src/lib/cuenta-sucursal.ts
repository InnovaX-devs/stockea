import type { Prisma } from "@prisma/client";

/**
 * Cuentas por sucursal (issue #33).
 *
 * - Cuenta con sucursal: es la caja (o cuenta) de ese local y solo se usa ahí.
 * - Cuenta sin sucursal: compartida por todas (bancos, Mercado Pago).
 *
 * Al cobrar o pagar en una sucursal solo se pueden usar sus cuentas y las
 * compartidas. En "Todas las sucursales" (solo admin, solo consulta) se
 * ven todas.
 */

type Db = Prisma.TransactionClient;

/** where para listar las cuentas que se pueden usar en una sucursal. */
export function filtroCuentasDeSucursal(sucursalId: number | null): Prisma.CuentaWhereInput {
  if (sucursalId == null) return {};
  return { OR: [{ sucursalId }, { sucursalId: null }] };
}

/**
 * Verifica que la cuenta sea de la empresa y que se pueda usar en la
 * sucursal de la operación. Lanza con un mensaje claro si no.
 */
export async function validarCuentaParaSucursal(db: Db, empresaId: number, cuentaId: number, sucursalId: number | null) {
  const cuenta = await db.cuenta.findFirst({
    where: { id: cuentaId, empresaId },
    select: { id: true, nombre: true, tipo: true, sucursalId: true, sucursal: { select: { nombre: true } } },
  });
  if (!cuenta) throw new Error("La cuenta seleccionada no existe.");
  if (sucursalId != null && cuenta.sucursalId != null && cuenta.sucursalId !== sucursalId) {
    throw new Error(`La cuenta "${cuenta.nombre}" es de la sucursal ${cuenta.sucursal?.nombre ?? ""}: usá una cuenta de esta sucursal o una compartida.`);
  }
  return cuenta;
}

/**
 * Sucursal que se guarda en un movimiento de caja: la de la operación
 * (venta, compra, gasto o la sucursal elegida) y, si no hay, la de la cuenta.
 */
export function sucursalDelMovimiento(sucursalOperacion: number | null | undefined, sucursalCuenta: number | null | undefined) {
  return sucursalOperacion ?? sucursalCuenta ?? null;
}
