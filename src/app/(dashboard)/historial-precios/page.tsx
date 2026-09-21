import { HistorialPreciosView } from "@/components/historial-precios/historial-precios-view";

export default function HistorialPreciosPage() {
  return (
    <div className="p-4 space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Auditoría de Precios</h1>
        <p className="text-sm text-text-dim">
          Historial completo de cambios de precio: cargas manuales y actualizaciones masivas
        </p>
      </div>
      <HistorialPreciosView />
    </div>
  );
}