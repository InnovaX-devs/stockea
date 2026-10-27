"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ImageIcon, X } from "lucide-react";

/**
 * Foto del producto en Nueva venta (issue #108).
 *
 * - Con foto: miniatura chica (next/image la achica en el servidor y es lazy
 *   por defecto, así no frena la búsqueda). Tocarla la muestra más grande.
 * - Sin foto, o si no carga (sin conexión y no está en caché del navegador):
 *   ícono genérico en un recuadro del mismo tamaño, sin errores, para que las
 *   filas queden alineadas.
 */

export type FotoAmpliada = { url: string; nombre: string };

type MiniaturaProps = {
  fotoUrl?: string | null;
  nombre: string;
  /** Si se pasa, tocar la miniatura (solo si hay foto) llama a esto. */
  onAmpliar?: (foto: FotoAmpliada) => void;
  /** Ícono cuando no hay foto (por defecto, una imagen genérica). */
  icono?: ReactNode;
  /** Lado en px (40 por defecto). */
  tamano?: number;
  tabIndex?: number;
};

export function MiniaturaProducto({ fotoUrl, nombre, onAmpliar, icono, tamano = 40, tabIndex }: MiniaturaProps) {
  // Guardamos QUÉ url falló (no un booleano): si la fila pasa a otro producto, se vuelve a intentar.
  const [fallida, setFallida] = useState<string | null>(null);
  const url = fotoUrl && fallida !== fotoUrl ? fotoUrl : null;
  const caja = "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface";
  const estilo = { width: tamano, height: tamano };

  if (!url) {
    return (
      <div className={`${caja} text-text-dim`} style={estilo} aria-hidden="true">
        {icono ?? <ImageIcon size={Math.round(tamano / 2.5)} />}
      </div>
    );
  }

  const imagen = (
    <Image
      src={url}
      alt=""
      width={tamano}
      height={tamano}
      sizes={`${tamano}px`}
      className="h-full w-full object-cover"
      onError={() => setFallida(url)}
    />
  );

  if (!onAmpliar) {
    return (
      <div className={caja} style={estilo}>
        {imagen}
      </div>
    );
  }

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={() => onAmpliar({ url, nombre })}
      className={`${caja} cursor-zoom-in hover:border-primary focus-visible:border-primary focus-visible:outline-none`}
      style={estilo}
      aria-label={`Ampliar foto de ${nombre}`}
      title="Ver foto más grande"
    >
      {imagen}
    </button>
  );
}

/**
 * Foto grande en un modal. El estado (`foto`) lo guarda quien lo usa, a nivel
 * del componente que no se desmonta (si lo guardara la miniatura, al cerrarse
 * la lista de resultados el modal desaparecería con ella).
 */
export function VisorFoto({ foto, onCerrar }: { foto: FotoAmpliada | null; onCerrar: () => void }) {
  useEffect(() => {
    if (!foto) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [foto, onCerrar]);

  if (!foto) return null;
  return createPortal(<ContenidoVisor key={foto.url} foto={foto} onCerrar={onCerrar} />, document.body);
}

function ContenidoVisor({ foto, onCerrar }: { foto: FotoAmpliada; onCerrar: () => void }) {
  const [fallo, setFallo] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${foto.nombre}`}
      onClick={onCerrar}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full max-w-full flex-col items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-xl"
      >
        <button
          type="button"
          onClick={onCerrar}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>

        {fallo ? (
          <div className="flex h-48 w-64 max-w-full flex-col items-center justify-center gap-2 text-sm text-text-dim">
            <ImageIcon size={32} />
            <span>No se pudo cargar la foto</span>
          </div>
        ) : (
          <Image
            src={foto.url}
            alt={foto.nombre}
            width={640}
            height={640}
            sizes="(max-width: 768px) 100vw, 640px"
            className="h-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
            onError={() => setFallo(true)}
          />
        )}

        <p className="max-w-full truncate text-sm font-medium text-text">{foto.nombre}</p>
      </div>
    </div>
  );
}
