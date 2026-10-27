"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import {
  importarProductosAction,
  previsualizarImportacionAction,
  type PrevisualizacionImportacion,
} from "@/app/(dashboard)/productos/importar-actions";
import type { ResultadoImportacion } from "@/lib/importar-productos";
import { columnasPlantilla, filasEjemplo, type OpcionesParseo } from "@/lib/importar-productos-formato";
import { formatCurrency } from "@/lib/currency";
import { useRubro } from "@/components/layout/rubro-context";

/**
 * Importar productos desde Excel (plan Pro). Tres pasos: elegir el archivo
 * (con un ejemplo de cómo tiene que verse y la plantilla para descargar),
 * revisar el resumen (todavía no se guardó nada) y confirmar.
 */

type Paso = "archivo" | "revision" | "resultado";

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;
const lista = (nombres: string[]) => nombres.join(", ");

/** Cartel de "así debe verse tu archivo": tabla de ejemplo, reglas y descarga de la plantilla. */
function EjemploFormato({ opciones, onCerrar }: { opciones: OpcionesParseo; onCerrar: () => void }) {
  const columnas = columnasPlantilla(opciones);
  const filas = filasEjemplo(opciones);
  const obligatorias = columnas.filter((c) => c.obligatoria).map((c) => c.titulo);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-hover/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-text">Así debe verse tu archivo</h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ejemplo" className="rounded p-1 text-text-dim hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Son descargas de archivo, no páginas: <Link> no corresponde. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/productos/importar/plantilla?formato=csv"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
        >
          <Download className="h-4 w-4" /> Descargar plantilla CSV
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/productos/importar/plantilla"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
        >
          <Download className="h-4 w-4" /> Descargar plantilla Excel
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-surface-hover">
            <tr>
              {columnas.map((c) => (
                <th key={c.campo} className="whitespace-nowrap px-3 py-2 font-semibold text-text">
                  {c.titulo}
                  {c.obligatoria && <span className="text-success"> *</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((valor, j) => (
                  <td key={j} className="whitespace-nowrap px-3 py-1.5 text-text-dim">
                    {valor}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-text">
        <li>
          <span className="font-semibold">{lista(obligatorias)}</span> son obligatorios (los marcados con *). El costo es opcional: si lo dejás vacío se carga en 0.
        </li>
        {opciones.usaTallesColores && (
          <li>Una fila por cada combinación de talle y color, repitiendo el nombre del modelo. Sin talle ni color, se carga como producto común.</li>
        )}
        <li>Las plantillas traen filas de ejemplo: borralas antes de cargar tus productos.</li>
        <li>Las marcas y categorías que no existan se crean solas.</li>
        <li>Los productos que ya existen no se modifican: se omiten.</li>
        <li>
          Archivo Excel (.xlsx) o CSV (.csv, separado por coma o punto y coma), hasta 5.000 filas.
        </li>
      </ul>

    </div>
  );
}

export function ImportarProductosModal({
  abierto,
  onCerrar,
  onImportado,
  permiteUSD = false,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onImportado: () => void;
  /** La empresa vende en dólares: el ejemplo y la plantilla incluyen la columna Moneda. */
  permiteUSD?: boolean;
}) {
  const rubro = useRubro();
  const [paso, setPaso] = useState<Paso>("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [vista, setVista] = useState<PrevisualizacionImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [verEjemplo, setVerEjemplo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  if (!abierto) return null;

  const opciones: OpcionesParseo = { usaTallesColores: rubro.usaTallesColores, permiteUSD };
  const obligatorias = columnasPlantilla(opciones).filter((c) => c.obligatoria).map((c) => c.titulo);

  function cerrar() {
    if (trabajando) return;
    setPaso("archivo");
    setArchivo(null);
    setVista(null);
    setResultado(null);
    setVerEjemplo(false);
    onCerrar();
  }

  function formulario(f: File) {
    const datos = new FormData();
    datos.set("archivo", f);
    return datos;
  }

  async function elegir(f: File | null) {
    setArchivo(f);
    if (!f) return;
    setVerEjemplo(false);
    setTrabajando(true);
    try {
      const r = await previsualizarImportacionAction(formulario(f));
      if (!r.success) {
        toast.error(r.error);
        setArchivo(null);
        if (entrada.current) entrada.current.value = "";
        return;
      }
      setVista(r.data);
      setPaso("revision");
    } catch {
      toast.error("No se pudo leer el archivo. Probá de nuevo.");
      setArchivo(null);
    } finally {
      setTrabajando(false);
    }
  }

  async function confirmar() {
    if (!archivo) return;
    setTrabajando(true);
    try {
      const r = await importarProductosAction(formulario(archivo));
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setResultado(r.data);
      setPaso("resultado");
      onImportado();
    } catch {
      toast.error("Se cortó la conexión. Revisá la lista de productos antes de volver a importar: puede que una parte haya entrado.");
    } finally {
      setTrabajando(false);
    }
  }

  const tarjeta = "rounded-lg border border-border bg-surface px-3 py-2";
  const bloqueLista = "max-h-32 overflow-y-auto rounded-lg border border-border px-3 py-2 text-xs text-text-dim";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold text-text">Importar productos desde Excel o CSV</h2>
          <p className="text-sm text-text-dim">Cargá todo tu inventario de una vez. Antes de guardar vas a ver un resumen.</p>
        </div>

        {paso === "archivo" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text">Productos</p>
              <button
                type="button"
                onClick={() => setVerEjemplo((v) => !v)}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Ver ejemplo de formato
              </button>
            </div>

            {verEjemplo && <EjemploFormato opciones={opciones} onCerrar={() => setVerEjemplo(false)} />}

            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-10 text-center text-sm text-text-dim hover:bg-surface-hover ${trabajando ? "pointer-events-none opacity-60" : ""}`}
            >
              {trabajando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              <span className="font-semibold text-text">{trabajando ? "Leyendo el archivo…" : "Subí un archivo .xlsx o .csv"}</span>
              {!trabajando && <span>Columnas obligatorias: {lista(obligatorias)}</span>}
              <input
                ref={entrada}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={trabajando}
                onChange={(e) => elegir(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="flex items-center gap-1.5 text-xs text-text-dim">
              <FileSpreadsheet className="h-3.5 w-3.5" /> ¿No sabés cómo armarlo? Abrí el ejemplo y descargá la plantilla (Excel o CSV) para completarla directamente.
            </p>
          </div>
        )}

        {paso === "revision" && vista && (
          <div className="space-y-4">
            <p className="text-sm text-text-dim">
              Archivo: <span className="font-medium text-text">{archivo?.name}</span> · {plural(vista.total, "fila", "filas")}
            </p>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className={tarjeta}>
                <p className="text-2xl font-semibold text-success">{vista.nuevas.toLocaleString("es-AR")}</p>
                <p className="text-xs text-text-dim">se van a crear</p>
              </div>
              <div className={tarjeta}>
                <p className="text-2xl font-semibold text-text">{vista.omitidas.toLocaleString("es-AR")}</p>
                <p className="text-xs text-text-dim">ya existen (se omiten)</p>
              </div>
              <div className={tarjeta}>
                <p className={`text-2xl font-semibold ${vista.conError > 0 ? "text-danger" : "text-text"}`}>{vista.conError.toLocaleString("es-AR")}</p>
                <p className="text-xs text-text-dim">con errores (no se cargan)</p>
              </div>
            </div>

            {vista.nuevas > 0 && (
              <div className="space-y-2 text-sm text-text">
                {(vista.modelosNuevos > 0 || vista.modelosExistentes > 0) && (
                  <p>
                    {vista.modelosNuevos > 0 && <>Se crean {plural(vista.modelosNuevos, "modelo nuevo", "modelos nuevos")}. </>}
                    {vista.modelosExistentes > 0 && <>Se agregan combinaciones a {plural(vista.modelosExistentes, "modelo que ya existía", "modelos que ya existían")}.</>}
                  </p>
                )}
                <p>
                  Stock a cargar: <span className="font-medium">{vista.stockTotal.toLocaleString("es-AR")} unidades</span>
                  {vista.sucursal ? (
                    <>
                      {" "}
                      en la sucursal <span className="font-medium">{vista.sucursal}</span>
                    </>
                  ) : null}
                  .
                </p>

                {vista.marcasNuevas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text">Marcas nuevas que se van a crear ({vista.marcasNuevas.length}):</p>
                    <p className={bloqueLista}>{lista(vista.marcasNuevas)}</p>
                  </div>
                )}
                {vista.categoriasNuevas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text">Categorías nuevas que se van a crear ({vista.categoriasNuevas.length}):</p>
                    <p className={bloqueLista}>{lista(vista.categoriasNuevas)}</p>
                  </div>
                )}

                <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-xs">
                  {vista.muestra.map((m) => (
                    <li key={m.fila} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="truncate">{m.nombre}</span>
                      <span className="shrink-0 text-text-dim">
                        {formatCurrency(m.precioVenta, m.moneda)} · stock {m.stock}
                      </span>
                    </li>
                  ))}
                  {vista.nuevas > vista.muestra.length && (
                    <li className="px-3 py-1.5 text-text-dim">y {(vista.nuevas - vista.muestra.length).toLocaleString("es-AR")} más…</li>
                  )}
                </ul>
              </div>
            )}

            {vista.bloqueo && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{vista.bloqueo}</p>}

            {vista.conError > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-danger">Filas con errores (corregilas en el Excel y volvé a subirlo, o importá igual el resto):</p>
                <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border text-xs">
                  {vista.errores.map((e, i) => (
                    <li key={`${e.fila}-${i}`} className="px-3 py-1.5">
                      <span className="font-medium text-text">Fila {e.fila}:</span> <span className="text-text-dim">{e.mensaje}</span>
                    </li>
                  ))}
                  {vista.erroresOcultos > 0 && <li className="px-3 py-1.5 text-text-dim">y {vista.erroresOcultos.toLocaleString("es-AR")} errores más…</li>}
                </ul>
              </div>
            )}

            {vista.omitidas > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-text-dim">Ver los {vista.omitidas.toLocaleString("es-AR")} que ya existen</summary>
                <ul className="mt-1 max-h-32 divide-y divide-border overflow-y-auto rounded-lg border border-border text-xs">
                  {vista.omitidasDetalle.map((o) => (
                    <li key={o.fila} className="px-3 py-1.5">
                      <span className="font-medium text-text">Fila {o.fila}:</span> <span className="text-text-dim">{o.nombre}</span>
                    </li>
                  ))}
                  {vista.omitidasOcultas > 0 && <li className="px-3 py-1.5 text-text-dim">y {vista.omitidasOcultas.toLocaleString("es-AR")} más…</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        {paso === "resultado" && resultado && (
          <div className="space-y-3 text-sm text-text">
            <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 font-medium text-success">
              Listo: se crearon {plural(resultado.creados, "producto", "productos")}.
            </p>

            {resultado.modelosCreados.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text">{plural(resultado.modelosCreados.length, "modelo nuevo creado", "modelos nuevos creados")}:</p>
                <p className={bloqueLista}>{lista(resultado.modelosCreados)}</p>
              </div>
            )}
            {resultado.marcasCreadas.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text">{plural(resultado.marcasCreadas.length, "marca nueva creada", "marcas nuevas creadas")}:</p>
                <p className={bloqueLista}>{lista(resultado.marcasCreadas)}</p>
              </div>
            )}
            {resultado.categoriasCreadas.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text">{plural(resultado.categoriasCreadas.length, "categoría nueva creada", "categorías nuevas creadas")}:</p>
                <p className={bloqueLista}>{lista(resultado.categoriasCreadas)}</p>
              </div>
            )}

            {resultado.productosCreados.length > 0 && (
              <details>
                <summary className="cursor-pointer text-text-dim">Ver los productos creados</summary>
                <ul className="mt-1 max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-xs">
                  {resultado.productosCreados.map((nombre) => (
                    <li key={nombre} className="px-3 py-1.5">
                      {nombre}
                    </li>
                  ))}
                  {resultado.productosOcultos > 0 && <li className="px-3 py-1.5 text-text-dim">y {resultado.productosOcultos.toLocaleString("es-AR")} más…</li>}
                </ul>
              </details>
            )}

            {resultado.fallidas.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-danger">{plural(resultado.fallidas.length, "fila no se pudo crear", "filas no se pudieron crear")}:</p>
                <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-xs">
                  {resultado.fallidas.map((f) => (
                    <li key={f.fila} className="px-3 py-1.5">
                      <span className="font-medium">Fila {f.fila}:</span> <span className="text-text-dim">{f.mensaje}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {paso === "revision" && (
            <button
              type="button"
              onClick={() => {
                setPaso("archivo");
                setArchivo(null);
                setVista(null);
                if (entrada.current) entrada.current.value = "";
              }}
              disabled={trabajando}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50"
            >
              Elegir otro archivo
            </button>
          )}
          <button
            type="button"
            onClick={cerrar}
            disabled={trabajando}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50"
          >
            {paso === "resultado" ? "Cerrar" : "Cancelar"}
          </button>
          {paso === "revision" && vista && (
            <button
              type="button"
              onClick={confirmar}
              disabled={trabajando || vista.nuevas === 0 || vista.bloqueo != null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {trabajando && <Loader2 className="h-4 w-4 animate-spin" />}
              {trabajando ? "Importando…" : `Importar ${plural(vista.nuevas, "producto", "productos")}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
