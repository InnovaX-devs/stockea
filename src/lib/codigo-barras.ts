/**
 * Códigos de barras (issue #106).
 *
 * Los códigos que genera el sistema son EAN-13 de USO INTERNO: empiezan con
 * "2", el rango reservado para códigos dentro del comercio, así no chocan con
 * los de fábrica. Usamos "29": el 20–28 suele usarlo la balanza para las
 * etiquetas con peso/precio. El último dígito es el verificador, así que
 * cualquier lector los lee.
 *
 * Funciones puras (sin base de datos): se usan en el servidor y en el navegador.
 */

export const PREFIJO_INTERNO = "29";

/** Dígito verificador EAN-13 para los primeros 12 dígitos. */
export function digitoVerificadorEan13(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

export function esEan13Valido(codigo: string): boolean {
  return /^\d{13}$/.test(codigo) && digitoVerificadorEan13(codigo.slice(0, 12)) === Number(codigo[12]);
}

/** EAN-13 interno al azar (29 + 10 dígitos + verificador). La unicidad se controla contra la base. */
export function ean13InternoAlAzar(azar: () => number = Math.random): string {
  let cuerpo = PREFIJO_INTERNO;
  while (cuerpo.length < 12) cuerpo += Math.floor(azar() * 10).toString();
  return cuerpo + digitoVerificadorEan13(cuerpo);
}

/** Simbología con la que se dibuja un código ya cargado. */
export function simbologia(codigo: string): "ean13" | "upca" | "ean8" | "code128" {
  if (esEan13Valido(codigo)) return "ean13";
  if (/^\d{12}$/.test(codigo) && digitoVerificadorEan13(`0${codigo.slice(0, 11)}`) === Number(codigo[11])) return "upca";
  if (/^\d{8}$/.test(codigo)) {
    const d = codigo.split("").map(Number);
    const suma = d.slice(0, 7).reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
    if ((10 - (suma % 10)) % 10 === d[7]) return "ean8";
  }
  return "code128";
}
