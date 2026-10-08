"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirAdmin } from "@/lib/empresa";
import { cifrar, descifrar } from "@/lib/cifrado";
import { generarClaveYCsr, normalizarCuit, validarCertificado } from "@/lib/arca/certificado";
import { obtenerAuth } from "@/lib/arca/ticket";
import { estadoServidores, ultimoAutorizado, TIPO_COMPROBANTE } from "@/lib/arca/wsfe";
import type { Entorno } from "@/lib/arca/wsaa";

/**
 * Configuración de la facturación electrónica (ARCA). Solo admin, en los
 * dos planes. Nunca se devuelve la clave privada ni el ticket de acceso.
 */

type CondicionIva = "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO" | "EXENTO";
type Resultado = { success: true } | { success: false; error: string };

export type EstadoFacturacion = {
  habilitada: boolean;
  facturarPorDefecto: boolean;
  cuit: string | null;
  razonSocial: string | null;
  condicionIva: CondicionIva | null;
  puntoVenta: number | null;
  domicilioFiscal: string | null;
  ingresosBrutos: string | null;
  inicioActividades: string | null;
  entorno: Entorno;
  /** SIN_CLAVE → CSR_GENERADO (falta pegar el certificado) → LISTO */
  certificado: "SIN_CLAVE" | "CSR_GENERADO" | "LISTO";
  certificadoVence: string | null;
  csr: string | null;
  datosCompletos: boolean;
};

const mensaje = (e: unknown, defecto: string) => (e instanceof Error ? e.message : defecto);

/** Factura C para monotributo/exento; B como referencia para inscriptos. */
export async function tipoDePrueba(condicion: CondicionIva | null) {
  return condicion === "RESPONSABLE_INSCRIPTO" ? TIPO_COMPROBANTE.FACTURA_B : TIPO_COMPROBANTE.FACTURA_C;
}

export async function obtenerFacturacion(): Promise<EstadoFacturacion> {
  const admin = await requerirAdmin();
  const c = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId: admin.empresaId } });
  const datosCompletos = Boolean(c.cuit && c.razonSocial && c.condicionIva && c.puntoVenta && c.domicilioFiscal && c.inicioActividades);
  return {
    habilitada: c.facturacionHabilitada,
    facturarPorDefecto: c.facturarPorDefecto,
    cuit: c.cuit,
    razonSocial: c.razonSocial,
    condicionIva: c.condicionIva as CondicionIva | null,
    puntoVenta: c.puntoVenta,
    domicilioFiscal: c.domicilioFiscal,
    ingresosBrutos: c.ingresosBrutos,
    inicioActividades: c.inicioActividades?.toISOString().slice(0, 10) ?? null,
    entorno: c.arcaEntorno as Entorno,
    certificado: c.arcaCertificado ? "LISTO" : c.arcaClavePrivada ? "CSR_GENERADO" : "SIN_CLAVE",
    certificadoVence: c.arcaCertificadoVence?.toISOString() ?? null,
    csr: c.arcaCsr,
    datosCompletos,
  };
}

export async function guardarDatosFiscales(input: {
  cuit: string;
  razonSocial: string;
  condicionIva: CondicionIva;
  puntoVenta: number;
  domicilioFiscal: string;
  ingresosBrutos?: string;
  inicioActividades: string; // YYYY-MM-DD
}): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();
    const cuit = normalizarCuit(input.cuit);
    if (!cuit) return { success: false, error: "El CUIT no es válido (revisá los 11 números)." };
    if (!input.razonSocial.trim()) return { success: false, error: "Completá la razón social." };
    if (!["MONOTRIBUTO", "RESPONSABLE_INSCRIPTO", "EXENTO"].includes(input.condicionIva)) {
      return { success: false, error: "Elegí la condición frente al IVA." };
    }
    const pv = Number(input.puntoVenta);
    if (!Number.isInteger(pv) || pv < 1 || pv > 99998) {
      return { success: false, error: "El punto de venta tiene que ser un número entre 1 y 99998." };
    }
    if (!input.domicilioFiscal.trim()) return { success: false, error: "Completá el domicilio fiscal." };
    const inicio = new Date(`${input.inicioActividades}T00:00:00-03:00`);
    if (Number.isNaN(inicio.getTime())) return { success: false, error: "Completá la fecha de inicio de actividades." };

    const actual = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId: admin.empresaId } });
    // Cambiar el CUIT invalida el certificado (está emitido para el CUIT anterior).
    const cambioCuit = actual.cuit != null && actual.cuit !== cuit;
    await prisma.configuracion.update({
      where: { empresaId: admin.empresaId },
      data: {
        cuit,
        razonSocial: input.razonSocial.trim(),
        condicionIva: input.condicionIva,
        puntoVenta: pv,
        domicilioFiscal: input.domicilioFiscal.trim(),
        ingresosBrutos: input.ingresosBrutos?.trim() || null,
        inicioActividades: inicio,
        ...(cambioCuit
          ? { arcaClavePrivada: null, arcaCsr: null, arcaCertificado: null, arcaCertificadoVence: null, arcaToken: null, arcaSign: null, arcaTokenVence: null, facturacionHabilitada: false }
          : {}),
      },
    });
    revalidatePath("/configuracion", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: mensaje(e, "No se pudieron guardar los datos fiscales.") };
  }
}

/** Genera la clave y la solicitud (CSR) para subir a ARCA. */
export async function generarSolicitudCertificado(): Promise<{ success: true; csr: string } | { success: false; error: string }> {
  try {
    const admin = await requerirAdmin();
    const c = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId: admin.empresaId } });
    if (!c.cuit || !c.razonSocial) return { success: false, error: "Primero guardá el CUIT y la razón social." };
    const { clavePrivadaPem, csrPem } = generarClaveYCsr({ cuit: c.cuit, razonSocial: c.razonSocial });
    await prisma.configuracion.update({
      where: { empresaId: admin.empresaId },
      data: {
        arcaClavePrivada: cifrar(clavePrivadaPem),
        arcaCsr: csrPem,
        arcaCertificado: null,
        arcaCertificadoVence: null,
        arcaToken: null,
        arcaSign: null,
        arcaTokenVence: null,
        facturacionHabilitada: false,
      },
    });
    revalidatePath("/configuracion", "layout");
    return { success: true, csr: csrPem };
  } catch (e) {
    return { success: false, error: mensaje(e, "No se pudo generar la solicitud de certificado.") };
  }
}

/** Guarda el certificado que devolvió ARCA (verifica que sea de nuestra clave). */
export async function guardarCertificado(certificadoPem: string): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();
    const c = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId: admin.empresaId } });
    if (!c.arcaClavePrivada) return { success: false, error: "Primero generá la solicitud de certificado." };
    const { vence, cuit } = validarCertificado(certificadoPem, descifrar(c.arcaClavePrivada));
    if (cuit && c.cuit && cuit !== c.cuit) {
      return { success: false, error: `El certificado es del CUIT ${cuit}, pero el negocio tiene cargado ${c.cuit}.` };
    }
    await prisma.configuracion.update({
      where: { empresaId: admin.empresaId },
      data: { arcaCertificado: certificadoPem.trim(), arcaCertificadoVence: vence, arcaToken: null, arcaSign: null, arcaTokenVence: null },
    });
    revalidatePath("/configuracion", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: mensaje(e, "No se pudo guardar el certificado.") };
  }
}

/**
 * Prueba o producción. Cada entorno usa un certificado distinto, así que al
 * cambiar se borra el certificado (la clave y la solicitud se conservan: se
 * puede usar la misma solicitud para pedir el certificado del otro entorno).
 */
export async function cambiarEntorno(entorno: Entorno): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();
    if (entorno !== "HOMOLOGACION" && entorno !== "PRODUCCION") return { success: false, error: "Entorno inválido." };
    await prisma.configuracion.update({
      where: { empresaId: admin.empresaId },
      data: { arcaEntorno: entorno, arcaCertificado: null, arcaCertificadoVence: null, arcaToken: null, arcaSign: null, arcaTokenVence: null, facturacionHabilitada: false },
    });
    revalidatePath("/configuracion", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: mensaje(e, "No se pudo cambiar el entorno.") };
  }
}

export type PasoPrueba = { paso: string; ok: boolean; detalle: string };

/** Prueba la conexión completa con ARCA, paso por paso. */
export async function probarConexion(): Promise<{ success: boolean; pasos: PasoPrueba[] }> {
  const admin = await requerirAdmin();
  const c = await prisma.configuracion.findUniqueOrThrow({ where: { empresaId: admin.empresaId } });
  const entorno = c.arcaEntorno as Entorno;
  const pasos: PasoPrueba[] = [];

  try {
    const s = await estadoServidores(entorno);
    const ok = s.app === "OK" && s.db === "OK" && s.auth === "OK";
    pasos.push({ paso: "Servidores de ARCA", ok, detalle: ok ? "Funcionando" : `App ${s.app}, base ${s.db}, autenticación ${s.auth}` });
    if (!ok) return { success: false, pasos };
  } catch (e) {
    pasos.push({ paso: "Servidores de ARCA", ok: false, detalle: mensaje(e, "No responden") });
    return { success: false, pasos };
  }

  let auth;
  try {
    auth = await obtenerAuth(admin.empresaId);
    pasos.push({ paso: "Certificado e inicio de sesión", ok: true, detalle: "ARCA aceptó el certificado" });
  } catch (e) {
    pasos.push({ paso: "Certificado e inicio de sesión", ok: false, detalle: mensaje(e, "Error") });
    return { success: false, pasos };
  }

  try {
    const tipo = await tipoDePrueba(c.condicionIva as CondicionIva | null);
    const ultimo = await ultimoAutorizado(entorno, auth.auth, c.puntoVenta!, tipo);
    pasos.push({
      paso: `Punto de venta ${c.puntoVenta}`,
      ok: true,
      detalle: `Habilitado. Última ${tipo === TIPO_COMPROBANTE.FACTURA_C ? "Factura C" : "Factura B"} emitida: N.º ${ultimo}`,
    });
  } catch (e) {
    pasos.push({ paso: `Punto de venta ${c.puntoVenta}`, ok: false, detalle: mensaje(e, "Error") });
    return { success: false, pasos };
  }

  return { success: true, pasos };
}

export async function cambiarHabilitacion(params: { habilitada?: boolean; facturarPorDefecto?: boolean }): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();
    const estado = await obtenerFacturacion();
    if (params.habilitada && (!estado.datosCompletos || estado.certificado !== "LISTO")) {
      return { success: false, error: "Completá los datos fiscales y el certificado antes de activar la facturación." };
    }
    await prisma.configuracion.update({
      where: { empresaId: admin.empresaId },
      data: {
        ...(params.habilitada !== undefined ? { facturacionHabilitada: params.habilitada } : {}),
        ...(params.facturarPorDefecto !== undefined ? { facturarPorDefecto: params.facturarPorDefecto } : {}),
      },
    });
    revalidatePath("/configuracion", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: mensaje(e, "No se pudo guardar.") };
  }
}
