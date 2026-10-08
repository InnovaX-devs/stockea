"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Guía para el cliente: cómo conectar Stockea con ARCA. Se muestra dentro de
 * Configuración → Facturación electrónica. Los pasos de prueba están
 * verificados contra ARCA; los de producción hay que confirmarlos con el
 * primer cliente que pase a producción (ver docs/FACTURACION-ARCA.md).
 */

function Bloque({ titulo, children, abiertoInicial = false }: { titulo: string; children: React.ReactNode; abiertoInicial?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <div className="border-t border-border first:border-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm font-medium text-text hover:text-primary"
      >
        {titulo}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-dim transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && <div className="space-y-2 pb-3 text-sm text-text-dim">{children}</div>}
    </div>
  );
}

const Pasos = ({ children }: { children: React.ReactNode }) => (
  <ol className="list-decimal space-y-1.5 pl-5 text-text">{children}</ol>
);

export function GuiaArca({ entorno }: { entorno: "HOMOLOGACION" | "PRODUCCION" }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <HelpCircle className="h-4 w-4 text-primary" /> ¿Cómo conecto Stockea con ARCA?
        </span>
        <ChevronDown className={cn("h-4 w-4 text-text-dim transition-transform", abierta && "rotate-180")} />
      </button>

      {abierta && (
        <div className="px-4 pb-3">
          <Bloque titulo="Qué es cada cosa" abiertoInicial>
            <p>
              <strong className="text-text">ARCA</strong> (ex AFIP) es quien autoriza cada factura electrónica. Stockea le envía los
              datos de la venta y ARCA devuelve el <strong className="text-text">CAE</strong>, el código que hace válida la factura.
            </p>
            <p>
              <strong className="text-text">Clave fiscal:</strong> tu usuario de ARCA. Se saca con el DNI desde la app de ARCA o en una
              oficina.
            </p>
            <p>
              <strong className="text-text">Certificado digital:</strong>{" "}es la &quot;llave&quot; con la que Stockea se identifica ante ARCA
              en nombre de tu CUIT. Stockea genera la solicitud, vos la subís a ARCA y pegás acá el certificado que te devuelve. Vence
              cada dos años, aproximadamente.
            </p>
            <p>
              <strong className="text-text">Punto de venta:</strong> el número que va en tus facturas (por ejemplo 0003-00000125). Para
              usar Stockea tiene que ser uno de tipo <strong className="text-text">Web Services</strong>, distinto del que usás en
              &quot;Comprobantes en línea&quot;.
            </p>
            <p>
              <strong className="text-text">Prueba (homologación) y producción:</strong> en prueba las facturas no son reales y sirven
              para verificar que todo funciona. En producción son facturas reales. Cada entorno usa su propio certificado.
            </p>
          </Bloque>

          <Bloque titulo="Paso a paso en PRUEBA (homologación)" abiertoInicial={entorno === "HOMOLOGACION"}>
            <Pasos>
              <li>Completá tus datos fiscales acá abajo (paso 1). En punto de venta podés poner 1: en prueba no hace falta darlo de alta.</li>
              <li>Tocá &quot;Generar solicitud de certificado&quot; (paso 2). Se descarga un archivo .csr; abrilo con el Bloc de notas.</li>
              <li>
                Entrá a ARCA con tu clave fiscal → <strong>Administrador de Relaciones de Clave Fiscal</strong> → Adherir servicio → ARCA
                (puede figurar como AFIP) → Servicios interactivos → <strong>WSASS - Autogestión Certificados Homologación</strong>{" "}→
                Confirmar. Si la página queda en blanco con un link &quot;aquí&quot;, está bien: el trámite se hizo.
              </li>
              <li>Cerrá sesión en ARCA, volvé a entrar y abrí <strong>WSASS</strong>.</li>
              <li>
                <strong>Nuevo Certificado:</strong> en nombre poné <code>stockea</code> y pegá todo el texto del .csr. Tocá &quot;Crear DN y
                obtener certificado&quot; y copiá todo el texto que aparece en &quot;Resultado&quot;.
              </li>
              <li>
                <strong>Crear autorización a servicio:</strong> elegí el certificado <code>stockea</code>, tu CUIT como representado y el
                servicio <strong>wsfe - Facturación Electrónica</strong>. Tiene que decir &quot;OK. Autorización fue creada&quot;.
              </li>
              <li>Pegá el certificado acá (paso 2), guardalo y tocá &quot;Probar conexión con ARCA&quot; (paso 3).</li>
            </Pasos>
          </Bloque>

          <Bloque titulo="Paso a paso en PRODUCCIÓN (facturas reales)" abiertoInicial={entorno === "PRODUCCION"}>
            <p>Hacelo recién cuando la prueba haya dado bien. Los nombres de los menús de ARCA pueden variar un poco.</p>
            <Pasos>
              <li>
                <strong>Punto de venta:</strong> en ARCA, en <strong>Administración de puntos de venta y domicilios</strong>, dá de alta un
                punto de venta nuevo de tipo <strong>Web Services</strong> (para monotributo suele llamarse &quot;Factura Electrónica -
                Monotributo - Web Services&quot;). Cargá ese número en el paso 1.
              </li>
              <li>Acá, en el paso 3, pasá el entorno a <strong>Producción</strong>. Podés usar la misma solicitud (.csr) que ya generaste.</li>
              <li>
                En ARCA, adherí y abrí el servicio <strong>Administración de Certificados Digitales</strong>. Agregá un alias (por ejemplo{" "}
                <code>stockea</code>), subí el .csr y descargá el certificado.
              </li>
              <li>
                En <strong>Administrador de Relaciones de Clave Fiscal</strong> → Nueva Relación → ARCA → WebServices →{" "}
                <strong>Facturación Electrónica</strong>. Como representante, elegí el certificado <code>stockea</code> y confirmá.
              </li>
              <li>Abrí el certificado (.crt) con el Bloc de notas, pegalo acá, guardalo y probá la conexión.</li>
            </Pasos>
          </Bloque>

          <Bloque titulo="Si algo falla">
            <ul className="list-disc space-y-1.5 pl-5 text-text">
              <li>
                <strong>&quot;No está autorizado para facturar&quot;:</strong> falta autorizar el certificado para el servicio wsfe
                (prueba) o crear la relación con Facturación Electrónica (producción).
              </li>
              <li>
                <strong>&quot;ARCA no reconoce el certificado&quot;:</strong> el certificado es del otro entorno. Revisá que el entorno
                elegido coincida con donde lo generaste.
              </li>
              <li>
                <strong>&quot;No corresponde a la solicitud&quot;:</strong> el certificado se generó con otro .csr. Descargá la solicitud
                de nuevo desde acá y repetí el paso en ARCA.
              </li>
              <li>
                <strong>&quot;Ya entregó un ticket de acceso&quot;:</strong> probaste varias veces seguidas. Esperá unos minutos.
              </li>
              <li>
                <strong>Error con el punto de venta:</strong> en producción tiene que ser de tipo Web Services y estar dado de alta para tu
                CUIT.
              </li>
              <li>
                <strong>Los servidores de ARCA no responden:</strong> suele ser una caída de ARCA. Probá más tarde.
              </li>
            </ul>
          </Bloque>
        </div>
      )}
    </div>
  );
}
