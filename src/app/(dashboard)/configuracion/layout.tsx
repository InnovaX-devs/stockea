import { TabsConfiguracion } from "@/components/configuracion/tabs-configuracion";

/** Configuración dividida en secciones: Negocio, Usuarios y Facturación electrónica. */
export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Configuración</h1>
        <p className="text-sm text-text-dim">Datos del negocio, usuarios y facturación electrónica.</p>
      </div>
      <TabsConfiguracion />
      {children}
    </div>
  );
}
