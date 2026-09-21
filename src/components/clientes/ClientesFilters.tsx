"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import Select from "@/components/ui/select";

const OPCIONES_TIPO = [
  { value: "", label: "Todos los tipos" },
  { value: "mayorista", label: "Mayorista" },
  { value: "minorista", label: "Minorista" },
];

const OPCIONES_DEUDA = [
  { value: "", label: "Con deuda y al día" },
  { value: "con-deuda", label: "Con deuda" },
  { value: "al-dia", label: "Al día" },
];

const OPCIONES_ORDEN = [
  { value: "nombre-asc", label: "Nombre A→Z" },
  { value: "nombre-desc", label: "Nombre Z→A" },
  { value: "deuda-desc", label: "Mayor deuda" },
  { value: "deuda-asc", label: "Menor deuda" },
];

export default function ClientesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busqueda, setBusqueda] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function actualizarParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function actualizarOrden(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "nombre-asc") params.set("orden", value);
    else params.delete("orden");
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function handleBusquedaChange(value: string) {
    setBusqueda(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => actualizarParam("q", value), 400);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={(e) => handleBusquedaChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary"
      />

      <Select
        value={searchParams.get("tipo") ?? ""}
        onChange={(value) => actualizarParam("tipo", value)}
        options={OPCIONES_TIPO}
        className="w-full sm:w-48"
      />

      <Select
        value={searchParams.get("deuda") ?? ""}
        onChange={(value) => actualizarParam("deuda", value)}
        options={OPCIONES_DEUDA}
        className="w-full sm:w-52"
      />

      <Select
        value={searchParams.get("orden") ?? "nombre-asc"}
        onChange={actualizarOrden}
        options={OPCIONES_ORDEN}
        className="w-full sm:w-48"
      />
    </div>
  );
}