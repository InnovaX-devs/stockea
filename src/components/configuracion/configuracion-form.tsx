"use client";

import { useRef, useState } from "react";
import { guardarConfiguracion } from "@/app/(dashboard)/configuracion/actions";
import { CambiarPasswordModal } from "@/components/layout/cambiar-password-modal";

interface ConfiguracionFormProps {
  configuracion: {
    nombreNegocio: string;
    logoUrl: string | null;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    instagram: string | null;
    eslogan: string | null;
    usaCotizacionUSD: boolean;
    cotizacionUSD: number;
    remitenteNombre: string | null;
    remitenteDni: string | null;
    costoPromedioPonderado: boolean;
    colorPrimario: string | null;
    colorSecundario: string | null;
    licencia: "BASICO" | "PREMIUM";
  };
}

export function ConfiguracionForm({ configuracion }: ConfiguracionFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(configuracion.logoUrl);
  const [logoRemovido, setLogoRemovido] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [usaCotizacionUSD, setUsaCotizacionUSD] = useState(configuracion.usaCotizacionUSD);
  const esPremium = configuracion.licencia === "PREMIUM";

  function handleSeleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setLogoRemovido(false);
  }

  function handleQuitarLogo() {
    setPreviewUrl(null);
    setLogoRemovido(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    setGuardadoOk(false);
    setGuardando(true);
    try {
      await guardarConfiguracion(formData);
      setGuardadoOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la configuración");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Configuración</h1>
        <p className="text-sm text-text-dim">Datos generales del negocio</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        className="mx-auto max-w-2xl space-y-6"
      >
      {/* Identidad del negocio */}
      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-text">
          Identidad del negocio
        </h2>

        <div className="mb-5">
          <label className="mb-1 block text-sm text-text-dim" htmlFor="nombreNegocio">
            Nombre del negocio
          </label>
          <input
            id="nombreNegocio"
            type="text"
            name="nombreNegocio"
            defaultValue={configuracion.nombreNegocio}
            required
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="mb-5">
          <label className="mb-1 block text-sm text-text-dim" htmlFor="eslogan">
            Eslogan / subtítulo (opcional)
          </label>
          <input
            id="eslogan"
            type="text"
            name="eslogan"
            placeholder="Ej: Perfumería de Lujo"
            defaultValue={configuracion.eslogan ?? ""}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-text-dim">
            Se muestra debajo del nombre del negocio en el menú lateral. Si lo dejás vacío, no se
            muestra nada.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm text-text-dim">Logo</label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-hover">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Logo del negocio"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-text-dim">Sin logo</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-hover"
              >
                {previewUrl ? "Cambiar imagen" : "Subir imagen"}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={handleQuitarLogo}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-danger hover:bg-surface-hover"
                >
                  Quitar logo
                </button>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            name="logo"
            accept="image/png, image/jpeg"
            onChange={handleSeleccionarArchivo}
            className="hidden"
          />
          <input type="hidden" name="removerLogo" value={logoRemovido ? "true" : "false"} />
          <p className="mt-2 text-xs text-text-dim">PNG o JPG.</p>
        </div>
      </div>

      {/* Contacto */}
      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-text">Contacto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-text-dim" htmlFor="telefono">
              Teléfono / WhatsApp
            </label>
            <input
              id="telefono"
              type="text"
              name="telefono"
              defaultValue={configuracion.telefono ?? ""}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-dim" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              defaultValue={configuracion.email ?? ""}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-text-dim" htmlFor="direccion">
              Dirección
            </label>
            <input
              id="direccion"
              type="text"
              name="direccion"
              defaultValue={configuracion.direccion ?? ""}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-text-dim" htmlFor="instagram">
              Instagram (opcional)
            </label>
            <input
              id="instagram"
              type="text"
              name="instagram"
              placeholder="@tunegocio"
              defaultValue={configuracion.instagram ?? ""}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-text-dim">
              Se muestra en comprobantes y catálogos en PDF, junto al teléfono.
            </p>
          </div>
        </div>
      </div>

      {/* Marca en PDFs */}
      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-text">Marca en PDFs</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-text-dim" htmlFor="colorPrimario">
              Color primario
            </label>
            <div className="flex items-center gap-2">
              <input
                id="colorPrimario"
                type="color"
                name="colorPrimario"
                defaultValue={configuracion.colorPrimario ?? "#2952CC"}
                className="h-10 w-14 cursor-pointer rounded-md border border-border bg-white p-1"
              />
              <span className="text-xs text-text-dim">Títulos y totales destacados</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-dim" htmlFor="colorSecundario">
              Color secundario
            </label>
            <div className="flex items-center gap-2">
              <input
                id="colorSecundario"
                type="color"
                name="colorSecundario"
                defaultValue={configuracion.colorSecundario ?? "#0891B2"}
                className="h-10 w-14 cursor-pointer rounded-md border border-border bg-white p-1"
              />
              <span className="text-xs text-text-dim">Usado como color de acento</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-dim">
          Se usan en catálogos, listas de precios, comprobantes y reportes generados en PDF.
        </p>
      </div>

      {/* Precios en dólares — solo disponible con licencia Premium. El
          checkbox habilita/deshabilita el flag; con licencia Básico esta
          sección ni se muestra (ver lib/configuracion.ts, el piso duro
          fuerza usaCotizacionUSD a false sin importar lo que haya acá). */}
      {esPremium && (
        <div className="rounded-2xl border border-border bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-text">Precios en dólares</h2>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="usaCotizacionUSD"
              checked={usaCotizacionUSD}
              onChange={(e) => setUsaCotizacionUSD(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="text-sm font-medium text-text">
                Trabajo con precios en dólares
              </span>
              <p className="text-xs text-text-dim">
                Activá esto si el negocio necesita cargar productos en USD y convertirlos a ARS
                con una cotización.
              </p>
            </span>
          </label>

          {usaCotizacionUSD && (
            <div className="mt-4">
              <label className="mb-1 block text-sm text-text-dim" htmlFor="cotizacionUSD">
                Cotización USD
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">$</span>
                <input
                  id="cotizacionUSD"
                  type="number"
                  name="cotizacionUSD"
                  defaultValue={configuracion.cotizacionUSD}
                  step="0.01"
                  min="0"
                  required
                  className="w-full rounded-md border border-border bg-white px-3 py-2 pl-7 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <p className="mt-1 text-xs text-text-dim">
                Usada para convertir precios en USD a ARS en todo el sistema.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Datos del remitente */}
      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-text">
          Datos del remitente
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-text-dim" htmlFor="remitenteNombre">
              Nombre y apellido
            </label>
            <input
              id="remitenteNombre"
              type="text"
              name="remitenteNombre"
              defaultValue={configuracion.remitenteNombre ?? ""}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-dim" htmlFor="remitenteDni">
              DNI
            </label>
            <input
              id="remitenteDni"
              type="text"
              name="remitenteDni"
              defaultValue={configuracion.remitenteDni ?? ""}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Preferencias */}
      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-text">Preferencias</h2>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="costoPromedioPonderado"
            defaultChecked={configuracion.costoPromedioPonderado}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="text-sm font-medium text-text">Costo promedio ponderado</span>
            <p className="text-xs text-text-dim">
              Al confirmar una compra, el costo del producto se recalcula mezclando el stock
              anterior con el nuevo. Ejemplo: 10 unidades a $1000 + 5 nuevas a $1200 → el costo
              pasa a $1066.
            </p>
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {guardadoOk && (
        <p className="text-sm text-primary">Configuración guardada correctamente.</p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar cambios"}
      </button>
      </form>

      {/* Seguridad (fuera del <form>: no queremos que dispare el submit de configuración) */}
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-text">Seguridad</h2>
        <button
          type="button"
          onClick={() => setPasswordModalOpen(true)}
          className="rounded-lg border cursor-pointer border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-hover"
        >
          Cambiar contraseña
        </button>
      </div>

      <CambiarPasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} />
    </div>
  );
}