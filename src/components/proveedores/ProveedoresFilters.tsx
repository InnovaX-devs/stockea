"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ProveedoresFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busqueda, setBusqueda] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const nuevosParams = new URLSearchParams(searchParams.toString());
      if (busqueda) {
        nuevosParams.set("q", busqueda);
      } else {
        nuevosParams.delete("q");
      }
      nuevosParams.set("page", "1");
      router.push(`?${nuevosParams.toString()}`);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-primary focus:outline-none sm:w-64"
      />
    </div>
  );
}