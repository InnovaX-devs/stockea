import { prisma } from "@/lib/prisma";
import { descifrar } from "@/lib/cifrado";
import { crearTRA, firmarTRA, loginCms, ArcaError, type Entorno } from "./wsaa";
import type { Auth } from "./wsfe";

/**
 * Ticket de acceso a ARCA para una empresa. Se reusa mientras le queden más
 * de 10 minutos (ARCA no deja pedir uno nuevo si el anterior sigue vigente).
 */
export async function obtenerAuth(empresaId: number): Promise<{ auth: Auth; entorno: Entorno }> {
  const c = await prisma.configuracion.findUnique({ where: { empresaId } });
  if (!c?.cuit || !c.arcaCertificado || !c.arcaClavePrivada) {
    throw new ArcaError("Falta completar los datos fiscales o el certificado de ARCA en Configuración → Facturación.");
  }
  const entorno = c.arcaEntorno as Entorno;

  if (c.arcaToken && c.arcaSign && c.arcaTokenVence && c.arcaTokenVence.getTime() - Date.now() > 10 * 60 * 1000) {
    return { auth: { token: c.arcaToken, sign: c.arcaSign, cuit: c.cuit }, entorno };
  }

  const cms = firmarTRA(crearTRA("wsfe"), c.arcaCertificado, descifrar(c.arcaClavePrivada));
  const ticket = await loginCms(cms, entorno);
  await prisma.configuracion.update({
    where: { empresaId },
    data: { arcaToken: ticket.token, arcaSign: ticket.sign, arcaTokenVence: ticket.vence },
  });
  return { auth: { token: ticket.token, sign: ticket.sign, cuit: c.cuit }, entorno };
}
