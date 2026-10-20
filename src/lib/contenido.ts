import { configRubro, esUnidadContenido, type UnidadContenido } from "@/lib/rubro";

/** Lo que se guarda en Producto para el contenido (RV-8). */
export type ContenidoGuardado = {
  contenido: number | null;
  unidadContenido: UnidadContenido | null;
  /**
   * DEPRECADO: se sigue escribiendo (solo si la unidad es ML) para que el código
   * viejo en producción siga viendo los ml. Se borra con la columna.
   */
  contenidoMl: number | null;
};

export type ResultadoContenido =
  | { ok: true; datos: ContenidoGuardado | undefined }
  | { ok: false; error: string };

const SIN_CONTENIDO: ContenidoGuardado = { contenido: null, unidadContenido: null, contenidoMl: null };

/**
 * Lee `contenido` + `unidadContenido` del body de un producto, validando contra
 * las unidades que ofrece el rubro.
 *
 * - Si el rubro no usa contenido (ej. Ropa) devuelve `datos: undefined`: el
 *   campo está oculto y NO se toca (cambiar de rubro nunca borra datos).
 * - Cantidad vacía → se borra el contenido (los tres campos en null).
 */
export function leerContenido(body: Record<string, unknown>, rubro: unknown): ResultadoContenido {
  const config = configRubro(rubro);
  if (!config.usaContenido) return { ok: true, datos: undefined };

  const crudo = body.contenido;
  if (crudo === undefined || crudo === null || crudo === "") return { ok: true, datos: SIN_CONTENIDO };

  const contenido = Number(crudo);
  if (!Number.isFinite(contenido) || contenido <= 0) {
    return { ok: false, error: "El contenido tiene que ser un número mayor a 0." };
  }
  const unidad = body.unidadContenido;
  if (!esUnidadContenido(unidad) || !config.unidadesContenido.includes(unidad)) {
    return { ok: false, error: "Elegí una unidad de contenido válida para el rubro." };
  }

  return {
    ok: true,
    datos: {
      contenido,
      unidadContenido: unidad,
      contenidoMl: unidad === "ML" ? Math.round(contenido) : null,
    },
  };
}
