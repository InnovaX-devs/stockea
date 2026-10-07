"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, FileKey2, Loader2, PlugZap, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  cambiarEntorno,
  cambiarHabilitacion,
  generarSolicitudCertificado,
  guardarCertificado,
  guardarDatosFiscales,
  probarConexion,
  type EstadoFacturacion,
  type PasoPrueba,
} from "@/app/(dashboard)/configuracion/facturacion-actions";
import { GuiaArca } from "@/components/configuracion/guia-arca";

/**
 * Configuración → Facturación electrónica (ARCA). Etapas 1 y 2: datos
 * fiscales, certificado, entorno y prueba de conexión. La emisión de
 * facturas desde las ventas llega en la etapa 3.
 */

const INPUT =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL = "mb-1 block text-sm text-text-dim";
const BOTON =
  "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const BOTON_SEC =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-50";

function Paso({ numero, titulo, listo, children }: { numero: number; titulo: string; listo: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
            listo ? "bg-success text-white" : "bg-surface-hover text-text-dim"
          )}
        >
          {listo ? "✓" : numero}
        </span>
        <h3 className="text-sm font-semibold text-text">{titulo}</h3>
      </div>
      {children}
    </section>
  );
}

export function FacturacionSection({ estado }: { estado: EstadoFacturacion }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [datos, setDatos] = useState({
    cuit: estado.cuit ?? "",
    razonSocial: estado.razonSocial ?? "",
    condicionIva: estado.condicionIva ?? "MONOTRIBUTO",
    puntoVenta: estado.puntoVenta ? String(estado.puntoVenta) : "",
    domicilioFiscal: estado.domicilioFiscal ?? "",
    ingresosBrutos: estado.ingresosBrutos ?? "",
    inicioActividades: estado.inicioActividades ?? "",
  });
  const [certificado, setCertificado] = useState("");
  const [pasos, setPasos] = useState<PasoPrueba[] | null>(null);
  const [probando, setProbando] = useState(false);
  const enPrueba = estado.entorno === "HOMOLOGACION";

  const cambiar = (campo: keyof typeof datos, valor: string) => setDatos((d) => ({ ...d, [campo]: valor }));

  function guardarDatos() {
    startTransition(async () => {
      const r = await guardarDatosFiscales({ ...datos, puntoVenta: Number(datos.puntoVenta) } as Parameters<typeof guardarDatosFiscales>[0]);
      if (!r.success) return void toast.error(r.error);
      toast.success("Datos fiscales guardados.");
      router.refresh();
    });
  }

  function descargarCsr(csr: string) {
    const url = URL.createObjectURL(new Blob([csr], { type: "application/pkcs10" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `solicitud-certificado-${estado.cuit ?? "arca"}.csr`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generarCsr() {
    if (estado.certificado === "LISTO" && !confirm("Se va a reemplazar el certificado actual y vas a tener que cargar uno nuevo de ARCA. ¿Seguir?")) return;
    startTransition(async () => {
      const r = await generarSolicitudCertificado();
      if (!r.success) return void toast.error(r.error);
      descargarCsr(r.csr);
      toast.success("Solicitud generada y descargada.");
      router.refresh();
    });
  }

  function guardarCert() {
    startTransition(async () => {
      const r = await guardarCertificado(certificado);
      if (!r.success) return void toast.error(r.error);
      toast.success("Certificado guardado. Ahora probá la conexión.");
      setCertificado("");
      router.refresh();
    });
  }

  function elegirEntorno(entorno: "HOMOLOGACION" | "PRODUCCION") {
    if (entorno === estado.entorno) return;
    const texto =
      entorno === "PRODUCCION"
        ? "En producción las facturas son REALES ante ARCA. Vas a tener que cargar el certificado de producción. ¿Pasar a producción?"
        : "Vas a volver al entorno de prueba y tendrás que cargar el certificado de prueba. ¿Seguir?";
    if (!confirm(texto)) return;
    startTransition(async () => {
      const r = await cambiarEntorno(entorno);
      if (!r.success) return void toast.error(r.error);
      setPasos(null);
      router.refresh();
    });
  }

  async function probar() {
    setProbando(true);
    setPasos(null);
    const r = await probarConexion();
    setPasos(r.pasos);
    setProbando(false);
    if (r.success) toast.success("Conexión con ARCA OK.");
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text">Facturación electrónica (ARCA)</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            enPrueba ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
          )}
        >
          {enPrueba ? "Entorno de prueba" : "Producción"}
        </span>
      </div>
      <p className="mb-5 text-sm text-text-dim">
        Opcional. Permite emitir facturas desde Stockea con el CUIT del negocio. Seguí los pasos en orden.
      </p>

      <GuiaArca entorno={estado.entorno} />

      <div className="space-y-5">
        <Paso numero={1} titulo="Datos fiscales" listo={estado.datosCompletos}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>CUIT</label>
              <input value={datos.cuit} onChange={(e) => cambiar("cuit", e.target.value)} placeholder="20-12345678-9" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Condición frente al IVA</label>
              <select value={datos.condicionIva} onChange={(e) => cambiar("condicionIva", e.target.value)} className={INPUT}>
                <option value="MONOTRIBUTO">Monotributista (Factura C)</option>
                <option value="RESPONSABLE_INSCRIPTO">Responsable inscripto (Factura A y B)</option>
                <option value="EXENTO">Exento (Factura C)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Razón social</label>
              <input value={datos.razonSocial} onChange={(e) => cambiar("razonSocial", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Punto de venta (web services)</label>
              <input
                value={datos.puntoVenta}
                onChange={(e) => cambiar("puntoVenta", e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Ej. 3"
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Inicio de actividades</label>
              <input type="date" value={datos.inicioActividades} onChange={(e) => cambiar("inicioActividades", e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Domicilio fiscal</label>
              <input value={datos.domicilioFiscal} onChange={(e) => cambiar("domicilioFiscal", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Ingresos brutos (opcional)</label>
              <input value={datos.ingresosBrutos} onChange={(e) => cambiar("ingresosBrutos", e.target.value)} className={INPUT} />
            </div>
          </div>
          <p className="text-xs text-text-dim">
            El punto de venta tiene que estar dado de alta en ARCA como &quot;Factura electrónica - Web services&quot; (no sirve el de
            &quot;Comprobantes en línea&quot;).
          </p>
          <button type="button" onClick={guardarDatos} disabled={pendiente} className={BOTON}>
            Guardar datos fiscales
          </button>
        </Paso>

        <Paso numero={2} titulo="Certificado digital" listo={estado.certificado === "LISTO"}>
          {!estado.datosCompletos ? (
            <p className="text-sm text-text-dim">Primero guardá los datos fiscales.</p>
          ) : estado.certificado === "LISTO" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-sm text-text">
                <FileKey2 className="h-4 w-4 text-success" />
                Certificado cargado
                {estado.certificadoVence && `, vence el ${new Date(estado.certificadoVence).toLocaleDateString("es-AR")}`}.
              </p>
              <button type="button" onClick={generarCsr} disabled={pendiente} className={BOTON_SEC}>
                Reemplazar certificado
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {estado.certificado === "SIN_CLAVE" ? (
                <button type="button" onClick={generarCsr} disabled={pendiente} className={BOTON}>
                  <FileKey2 className="h-4 w-4" /> Generar solicitud de certificado
                </button>
              ) : (
                <>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text">
                    <li>
                      <button type="button" onClick={() => estado.csr && descargarCsr(estado.csr)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        <Download className="h-3.5 w-3.5" /> Descargá la solicitud (.csr)
                      </button>
                    </li>
                    <li>
                      Entrá a ARCA con la clave fiscal del negocio, al servicio{" "}
                      <strong>{enPrueba ? "WSASS - Autogestión Certificados Homologación" : "Administración de Certificados Digitales"}</strong>, y
                      generá el certificado subiendo esa solicitud.
                    </li>
                    <li>
                      {enPrueba ? (
                        <>En el mismo WSASS, autorizá el certificado para el servicio <strong>wsfe</strong>.</>
                      ) : (
                        <>
                          En <strong>Administrador de Relaciones de Clave Fiscal</strong>, agregá una relación con el servicio de{" "}
                          <strong>Facturación Electrónica</strong> y elegí ese certificado como representante.
                        </>
                      )}
                    </li>
                    <li>Abrí el certificado que te da ARCA (.crt) con el Bloc de notas, copiá todo y pegalo acá:</li>
                  </ol>
                  <textarea
                    value={certificado}
                    onChange={(e) => setCertificado(e.target.value)}
                    rows={5}
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    className={cn(INPUT, "font-mono text-xs")}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={guardarCert} disabled={pendiente || !certificado.includes("BEGIN CERTIFICATE")} className={BOTON}>
                      Guardar certificado
                    </button>
                    <button type="button" onClick={generarCsr} disabled={pendiente} className={BOTON_SEC}>
                      Generar otra solicitud
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </Paso>

        <Paso numero={3} titulo="Entorno y prueba de conexión" listo={!!pasos && pasos.every((p) => p.ok)}>
          <div className="inline-flex rounded-lg border border-border bg-white p-1 text-sm">
            {(["HOMOLOGACION", "PRODUCCION"] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => elegirEntorno(e)}
                disabled={pendiente}
                className={cn("rounded-md px-3 py-1.5", estado.entorno === e ? "bg-primary text-white" : "text-text-dim hover:text-text")}
              >
                {e === "HOMOLOGACION" ? "Prueba (homologación)" : "Producción"}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-dim">
            En prueba, las facturas no son reales: sirve para verificar que todo funcione. Cada entorno usa su propio certificado.
          </p>
          <button type="button" onClick={probar} disabled={probando || estado.certificado !== "LISTO"} className={BOTON_SEC}>
            {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {probando ? "Probando..." : "Probar conexión con ARCA"}
          </button>
          {pasos && (
            <ul className="space-y-1.5 rounded-xl bg-surface p-3">
              {pasos.map((p) => (
                <li key={p.paso} className="flex items-start gap-2 text-sm">
                  {p.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <span>
                    <span className="font-medium text-text">{p.paso}:</span> <span className="text-text-dim">{p.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Paso>

        <Paso numero={4} titulo="Activar la facturación" listo={estado.habilitada}>
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="text-sm font-medium text-text">Facturación activada</span>
              <span className="block text-xs text-text-dim">
                Aparece el interruptor &quot;Emitir factura&quot; en Nueva venta y el botón &quot;Facturar&quot; en el historial.
              </span>
            </span>
            <input
              type="checkbox"
              checked={estado.habilitada}
              disabled={pendiente || !estado.datosCompletos || estado.certificado !== "LISTO"}
              onChange={(e) => {
                const habilitada = e.target.checked;
                startTransition(async () => {
                  const r = await cambiarHabilitacion({ habilitada });
                  if (!r.success) return void toast.error(r.error);
                  router.refresh();
                });
              }}
              className="mt-1 h-4 w-4"
            />
          </label>
          {estado.habilitada && (
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="text-sm font-medium text-text">Emitir factura por defecto</span>
                <span className="block text-xs text-text-dim">
                  El interruptor de Nueva venta viene prendido. Igual se puede apagar en cada venta.
                </span>
              </span>
              <input
                type="checkbox"
                checked={estado.facturarPorDefecto}
                disabled={pendiente}
                onChange={(e) => {
                  const facturarPorDefecto = e.target.checked;
                  startTransition(async () => {
                    const r = await cambiarHabilitacion({ facturarPorDefecto });
                    if (!r.success) return void toast.error(r.error);
                    router.refresh();
                  });
                }}
                className="mt-1 h-4 w-4"
              />
            </label>
          )}
          {estado.habilitada && estado.entorno === "HOMOLOGACION" && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-text">
              Estás en el entorno de prueba: las facturas que emitas no son reales. Cuando esté todo probado, pasá a Producción en el paso 3.
            </p>
          )}
        </Paso>
      </div>
    </div>
  );
}
