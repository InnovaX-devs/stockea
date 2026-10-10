import { prisma } from "@/lib/prisma";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import type { Configuracion } from "@prisma/client";

/**
 * Deriva los flags de "qué módulos ve este negocio" a partir de la
 * licencia. Es la ÚNICA fuente de verdad: nada más en el código debe
 * decidir esto mirando otra cosa.
 *
 * - usaCotizacionUSD: con licencia BASICO queda forzado a false sin
 *   importar lo que haya en la base (piso duro). Con PREMIUM, respeta el
 *   valor cargado en Configuración (un cliente Premium puede no vender en
 *   dólares igual).
 * - El resto de los módulos Premium (Presupuestos, Reportes avanzados,
 *   Gastos/Flujo de caja) están 100% atados a la licencia, sin un campo
 *   propio en la base — no tiene sentido tenerlos sueltos si siempre van
 *   juntos en el mismo paquete.
 */
function conFlagsDeLicencia<T extends Pick<Configuracion, "licencia" | "usaCotizacionUSD">>(
  configuracion: T
) {
  const esPremium = configuracion.licencia === "PREMIUM";
  return {
    ...configuracion,
    usaCotizacionUSD: esPremium && configuracion.usaCotizacionUSD,
    habilitarPresupuestos: esPremium,
    habilitarReportesAvanzados: esPremium,
    // Gastos (cargar, agendar y pagar) está en los dos planes: sin eso, la
    // caja del plan Básico no refleja los pagos y el cierre da faltantes.
    habilitarGastos: true,
    // Flujo de caja y análisis de gastos: Premium.
    habilitarFlujoCaja: esPremium,
    /** @deprecated usar habilitarFlujoCaja (Flujo de caja + análisis de gastos). */
    habilitarGastosFlujoCaja: esPremium,
  };
}

export async function obtenerConfiguracion() {
  const empresaId = await obtenerEmpresaIdActual();

  const configuracion = await prisma.configuracion.findUnique({
    where: { empresaId },
  });

  if (configuracion) {
    return conFlagsDeLicencia(configuracion);
  }

  // No debería pasar en operación normal (toda Empresa se crea junto con su
  // Configuracion), pero por las dudas la creamos con valores por defecto
  // en vez de romper toda la pantalla de Configuración.
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });

  const creada = await prisma.configuracion.create({
    data: {
      empresaId,
      nombreNegocio: empresa?.nombre ?? "Mi negocio",
      cotizacionUSD: 0,
    },
  });

  return conFlagsDeLicencia(creada);
}

export async function actualizarConfiguracion(
  data: Partial<{
    nombreNegocio: string;
    logoUrl: string | null;
    telefono: string;
    email: string;
    direccion: string;
    instagram: string;
    eslogan: string;
    remitenteNombre: string;
    remitenteDni: string;
    colorPrimario: string;
    colorSecundario: string;
    usaCotizacionUSD: boolean;
    cotizacionUSD: number;
    costoPromedioPonderado: boolean;
    horaAperturaCaja: string;
    cajaTurnoContinuo: boolean;
  }>
) {
  const empresaId = await obtenerEmpresaIdActual();

  return prisma.configuracion.update({
    where: { empresaId },
    data,
  });
}

export async function obtenerCotizacionUSD(): Promise<number> {
  const configuracion = await obtenerConfiguracion();
  return configuracion.cotizacionUSD;
}

export async function convertirUSDaARS(montoUSD: number): Promise<number> {
  const cotizacion = await obtenerCotizacionUSD();
  return montoUSD * cotizacion;
}