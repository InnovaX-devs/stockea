import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obtenerContextoSucursal } from "@/lib/sucursal";
import { NuevaTransferenciaForm } from "@/components/transferencias/nueva-transferencia-form";

export default async function NuevaTransferenciaPage() {
  const { multisucursal, actual, sucursales } = await obtenerContextoSucursal();
  if (!multisucursal) notFound();

  return (
    <div className="space-y-5 p-4 sm:space-y-6">
      <div>
        <Link href="/transferencias" className="mb-2 inline-flex items-center gap-1 text-xs text-text-dim hover:text-text">
          <ArrowLeft className="h-3.5 w-3.5" /> Transferencias
        </Link>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Transferir a otra sucursal</h1>
      </div>

      {actual ? (
        <NuevaTransferenciaForm
          origen={{ id: actual.id, nombre: actual.nombre }}
          destinos={sucursales.filter((s) => s.id !== actual.id).map((s) => ({ id: s.id, nombre: s.nombre }))}
        />
      ) : (
        <p className="rounded-2xl border border-border bg-white p-6 text-sm text-text-dim">
          Elegí en la barra superior la sucursal desde la que sale la mercadería: no se puede transferir desde &quot;Todas las sucursales&quot;.
        </p>
      )}
    </div>
  );
}