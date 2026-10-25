/**
 * Impuestos que se suman al costo de un producto (plan Premium).
 *
 * Para un comerciante monotributista el IVA y las percepciones que cobra el
 * proveedor no se recuperan: son parte del costo. Por producto se cargan tres
 * porcentajes que SE SUMAN sobre el costo de compra:
 *
 *   costo final = costo de compra × (1 + (IIBB + percepción IVA + IVA) / 100)
 *
 * Ej.: $1.000 con 3% + 3% + 21% = $1.270. Después se aplica la ganancia sobre
 * ese costo final, como siempre.
 *
 * Producto.precioCosto guarda el costo FINAL: reportes, ganancias y compras
 * siguen usando precioCosto sin cambios. El costo de compra (sin impuestos)
 * no se guarda aparte: se obtiene dividiendo por el factor.
 */

export type ImpuestosCosto = {
  iibbPct?: number | null;
  percepcionIvaPct?: number | null;
  ivaCostoPct?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Suma de los porcentajes cargados (los vacíos cuentan 0). */
export function sumaImpuestos(p: ImpuestosCosto): number {
  return r2((p.iibbPct ?? 0) + (p.percepcionIvaPct ?? 0) + (p.ivaCostoPct ?? 0));
}

export function tieneImpuestos(p: ImpuestosCosto): boolean {
  return sumaImpuestos(p) > 0;
}

/** Costo de compra → costo final con impuestos. */
export function costoConImpuestos(costoCompra: number, p: ImpuestosCosto): number {
  return r2(costoCompra * (1 + sumaImpuestos(p) / 100));
}

/** Costo final → costo de compra sin impuestos (para mostrarlo en el formulario). */
export function costoSinImpuestos(costoFinal: number, p: ImpuestosCosto): number {
  return r2(costoFinal / (1 + sumaImpuestos(p) / 100));
}

/**
 * Lee los tres porcentajes del cuerpo del formulario de producto. Devuelve solo
 * los que vinieron. Sin el plan Premium no se tocan.
 */
export function leerImpuestosCosto(
  body: Record<string, unknown>,
  habilitado: boolean
): { ok: true; datos: ImpuestosCosto } | { ok: false; error: string } {
  const datos: ImpuestosCosto = {};
  if (!habilitado) return { ok: true, datos };
  const campos = [
    ["iibbPct", "Ingresos Brutos"],
    ["percepcionIvaPct", "Percepción de IVA"],
    ["ivaCostoPct", "IVA"],
  ] as const;
  for (const [campo, nombre] of campos) {
    const crudo = body[campo];
    if (crudo === undefined) continue;
    if (crudo === null || crudo === "") {
      datos[campo] = null;
      continue;
    }
    const n = Number(crudo);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, error: `El % de ${nombre} tiene que estar entre 0 y 100.` };
    }
    datos[campo] = n === 0 ? null : r2(n);
  }
  return { ok: true, datos };
}
