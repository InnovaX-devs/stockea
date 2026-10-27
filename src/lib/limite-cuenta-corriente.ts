/**
 * Límite de cuenta corriente de clientes. Funciones puras: las usan el
 * servidor (al registrar la venta) y la interfaz (para avisar antes).
 *
 * Reglas:
 * - Cada cliente puede tener un límite propio (Cliente.limiteCuentaCorriente).
 *   Si no tiene (null), usa el general de la empresa
 *   (Configuracion.limiteCuentaCorriente). Si tampoco hay general: sin límite.
 * - Solo cuenta lo que queda debiendo: una venta pagada completa nunca choca
 *   con el límite.
 *
 * Qué pasa al superarlo (decidido en el issue):
 * - Empleado: la venta se bloquea; se le muestra cuánto tiene disponible el
 *   cliente y que pida autorización a un administrador.
 * - Administrador: ve el mismo aviso y puede autorizarla en el momento.
 * - Ventas hechas sin conexión: no se frenan al sincronizar, porque ya se
 *   hicieron en el mostrador (ver api/sync/ventas).
 */

/** Diferencias de menos de medio peso no cuentan (la deuda se lleva en pesos enteros). */
const TOLERANCIA = 0.5;

/** El límite que aplica a un cliente: el suyo o, si no tiene, el general. null = sin límite. */
export function limiteEfectivo(limiteCliente: number | null | undefined, limiteGeneral: number | null | undefined) {
  return limiteCliente ?? limiteGeneral ?? null;
}

export type EvaluacionLimite =
  | { aplica: false }
  | {
      aplica: true;
      limite: number;
      deudaActual: number;
      /** Lo que se puede sumar a cuenta sin pasarse (nunca negativo). */
      disponible: number;
      /** Deuda que quedaría con esta venta. */
      deudaResultante: number;
      excede: boolean;
    };

/** ¿Sumar `saldoNuevo` a la deuda actual supera el límite? */
export function evaluarLimite(deudaActual: number, saldoNuevo: number, limite: number | null): EvaluacionLimite {
  if (limite == null) return { aplica: false };
  const deudaResultante = Math.round((deudaActual + Math.max(0, saldoNuevo)) * 100) / 100;
  return {
    aplica: true,
    limite,
    deudaActual,
    disponible: Math.max(0, Math.round((limite - deudaActual) * 100) / 100),
    deudaResultante,
    excede: saldoNuevo > 0 && deudaResultante > limite + TOLERANCIA,
  };
}

const pesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** "Debe $80.000 de $100.000" o "Debe $80.000" si no hay límite. */
export function textoDeudaConLimite(deuda: number, limite: number | null) {
  return limite == null ? `Debe ${pesos(deuda)}` : `Debe ${pesos(deuda)} de ${pesos(limite)}`;
}

/** Mensaje cuando una venta supera el límite. */
export function mensajeLimiteExcedido(e: Extract<EvaluacionLimite, { aplica: true }>, puedeAutorizar: boolean) {
  const base =
    `Esta venta deja al cliente debiendo ${pesos(e.deudaResultante)} y su límite es de ${pesos(e.limite)}. ` +
    (e.disponible > 0
      ? `Le quedan ${pesos(e.disponible)} disponibles para dejar a cuenta.`
      : `Ya no tiene saldo disponible para dejar a cuenta.`);
  return puedeAutorizar ? base : `${base} Pedile a un administrador que autorice la venta.`;
}

export { pesos as formatearPesosLimite };
