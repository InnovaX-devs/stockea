"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";
import {
  aplicarActualizacionAction,
  previsualizarActualizacionAction,
  type PrevisualizacionActualizacion,
} from "@/app/(dashboard)/productos/actualizar-csv-actions";
import type { ResultadoActualizacion } from "@/lib/actualizar-productos";

/**
 * Actualizar productos en lote desde un CSV (plan Pro, issue #109). Tres pasos:
 * elegir el archivo (con la plantilla de los productos actuales para descargar),
 * revisar qué cambia — todavía no se guardó nada — y aplicar.
 * Cancelar en la revisión no cambia nada: recién "Aplicar" escribe.
 */

type Paso = "archivo" | "revision" | "resultado";

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;

export function ActualizarCsvModal({
  abierto,
  onCerrar,
  onActualizado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama cuando se aplicaron cambios, para recargar la lista de productos. */
  onActualizado: () => void;
}) {
  const [paso, setPaso] = useState<Paso>("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [vista, setVista] = useState<PrevisualizacionActualizacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoActualizacion | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  if (!abierto) return null;

  function reiniciar() {
    setPaso("archivo");
    setArchivo(null);
    setVista(null);
    setResultado(null);
    if (entrada.current) entrada.current.value = "";
  }

  function cerrar() {
    if (trabajando) return;
    reiniciar();
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
    setTrabajando(true);
    try {
      const r = await previsualizarActualizacionAction(formulario(f));
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

  async function aplicar() {
    if (!archivo) return;
    setTrabajando(true);
    try {
      const r = await aplicarActualizacionAction(formulario(archivo));
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setResultado(r.data);
      setPaso("resultado");
      onActualizado();
    } catch {
      toast.error("Se cortó la conexión. Revisá la lista de productos antes de volver a subir el archivo: puede que los cambios sí se hayan aplicado.");
    } finally {
      setTrabajando(false);
    }
  }

  const tarjeta = "rounded-lg border border-border bg-surface px-3 py-2";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold text-text">Actualizar productos desde CSV</h2>
          <p className="text-sm text-text-dim">Por ejemplo, para cargar la lista de precios nueva de un proveedor. Antes de guardar vas a ver qué cambia.</p>
        </div>

        {paso === "archivo" && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-xl border border-border bg-surface-hover/40 p-4 text-sm text-text">
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Descargá la plantilla: es un CSV con tus productos actuales.
                  <div className="mt-2">
                    {/* Es una descarga de archivo, no una página: <Link> no corresponde. */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a
                      href="/api/productos/actualizar-csv/plantilla"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-surface-hover"
                    >
                      <Download className="h-4 w-4" /> Descargar plantilla
                    </a>
                  </div>
                </li>
                <li>Cambiá en Excel lo que quieras (costo, precios, stock mínimo…) y guardalo como CSV.</li>
                <li>Subilo acá. Se compara con lo que hay hoy y vas a ver cada cambio antes de aplicarlo.</li>
              </ol>
              <ul className="list-disc space-y-1 pl-5 pt-2 text-xs text-text-dim">
                <li>
                  Cada producto se identifica por <span className="font-medium text-text">código de barras</span> o, si no tiene, por su <span className="font-medium text-text">nombre exacto</span>. Esas dos columnas no se pueden cambiar desde acá.
                </li>
                <li>Solo actualiza productos que ya existen: no crea productos nuevos.</li>
                <li>El stock no se modifica desde acá: se mueve con compras o ajustes para que quede registrado.</li>
                <li>Una celda vacía no cambia ese dato. Podés borrar las columnas que no vas a usar.</li>
                <li>La marca y la categoría tienen que existir. Los cambios de precio quedan en el historial de precios.</li>
                <li>Acepta CSV separado por coma o punto y coma, y números con coma decimal (1.500,50). Hasta 5.000 filas.</li>
                <li>Si Excel muestra el código de barras como 7,79E+12, se usa el nombre para encontrar el producto (dejá el nombre en el archivo).</li>
              </ul>
            </div>

            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-10 text-center text-sm text-text-dim hover:bg-surface-hover ${trabajando ? "pointer-events-none opacity-60" : ""}`}
            >
              {trabajando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              <span className="font-semibold text-text">{trabajando ? "Leyendo el archivo…" : "Subí un archivo .csv"}</span>
              <input
                ref={entrada}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={trabajando}
                onChange={(e) => elegir(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {paso === "revision" && vista && (
          <div className="space-y-4">
            <p className="text-sm text-text-dim">
              Archivo: <span className="font-medium text-text">{archivo?.name}</span> · {plural(vista.total, "fila", "filas")} · columnas: {vista.columnas.join(", ")}
            </p>

            {vista.ignoradas.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text">
                <span className="font-medium">La columna {vista.ignoradas.map((i) => i.titulo).join(", ")} se ignora.</span> {vista.ignoradas[0].motivo}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className={tarjeta}>
                <p className="text-2xl font-semibold text-success">{vista.cambian.toLocaleString("es-AR")}</p>
                <p className="text-xs text-text-dim">productos cambian</p>
              </div>
              <div className={tarjeta}>
                <p className="text-2xl font-semibold text-text">{vista.sinCambios.toLocaleString("es-AR")}</p>
                <p className="text-xs text-text-dim">sin cambios</p>
              </div>
              <div className={tarjeta}>
                <p className={`text-2xl font-semibold ${vista.conError > 0 ? "text-danger" : "text-text"}`}>{vista.conError.toLocaleString("es-AR")}</p>
                <p className="text-xs text-text-dim">con errores (no se aplican)</p>
              </div>
            </div>

            {vista.bloqueo && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{vista.bloqueo}</p>}

            {vista.cambian > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-text">
                  Se van a actualizar <span className="font-medium">{plural(vista.cambian, "producto", "productos")}</span>
                  {vista.cambiosDePrecio > 0 && (
                    <>
                      {" "}
                      y se van a registrar <span className="font-medium">{plural(vista.cambiosDePrecio, "cambio de precio", "cambios de precio")}</span> en el historial
                    </>
                  )}
                  {vista.sucursal && vista.columnas.includes("Stock mínimo") ? <> (el stock mínimo es el de la sucursal {vista.sucursal})</> : null}.
                </p>
                <div className="max-h-80 overflow-auto rounded-lg border border-border">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-surface-hover">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2 font-semibold text-text">Fila</th>
                        <th className="px-3 py-2 font-semibold text-text">Producto</th>
                        <th className="px-3 py-2 font-semibold text-text">Qué cambia (antes → después)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {vista.productos.map((p) => (
                        <tr key={p.productoId} className="align-top">
                          <td className="whitespace-nowrap px-3 py-1.5 text-text-dim">{p.fila}</td>
                          <td className="px-3 py-1.5 font-medium text-text">{p.nombre}</td>
                          <td className="px-3 py-1.5">
                            <ul className="space-y-0.5">
                              {p.cambios.map((c) => (
                                <li key={c.campo} className="text-text-dim">
                                  <span className="text-text">{c.etiqueta}:</span> {c.anterior} → <span className="font-medium text-text">{c.nuevo}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                      {vista.productosOcultos > 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-1.5 text-text-dim">
                            y {vista.productosOcultos.toLocaleString("es-AR")} productos más…
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {vista.cambian === 0 && vista.conError === 0 && <p className="text-sm text-text-dim">El archivo no cambia nada: todos los valores ya son los que tienen los productos.</p>}

            {vista.conError > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-danger">
                  Filas con errores. No se aplican{vista.cambian > 0 ? ", pero el resto sí" : ""}: corregilas en el archivo y volvé a subirlo.
                </p>
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
          </div>
        )}

        {paso === "resultado" && resultado && (
          <div className="space-y-3 text-sm text-text">
            <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 font-medium text-success">
              Listo: se actualizaron {plural(resultado.actualizados, "producto", "productos")}.
            </p>
            {resultado.cambiosDePrecio > 0 && (
              <p>
                {plural(resultado.cambiosDePrecio, "cambio de precio quedó registrado", "cambios de precio quedaron registrados")} en el{" "}
                <Link href="/historial-precios" className="font-medium text-primary underline-offset-2 hover:underline">
                  historial de precios
                </Link>
                .
              </p>
            )}
            {resultado.conError > 0 && <p className="text-text-dim">{plural(resultado.conError, "fila con error no se aplicó", "filas con error no se aplicaron")}.</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {paso === "revision" && (
            <button type="button" onClick={reiniciar} disabled={trabajando} className="rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">
              Elegir otro archivo
            </button>
          )}
          <button type="button" onClick={cerrar} disabled={trabajando} className="rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">
            {paso === "resultado" ? "Cerrar" : "Cancelar"}
          </button>
          {paso === "revision" && vista && (
            <button
              type="button"
              onClick={aplicar}
              disabled={trabajando || vista.cambian === 0 || vista.bloqueo != null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {trabajando && <Loader2 className="h-4 w-4 animate-spin" />}
              {trabajando ? "Aplicando…" : `Aplicar cambios a ${plural(vista.cambian, "producto", "productos")}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
