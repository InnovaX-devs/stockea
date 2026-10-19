"use client";

import { createContext, useContext, type ReactNode } from "react";
import { configRubro, type ConfigRubro, type Rubro } from "@/lib/rubro";

const RubroContext = createContext<ConfigRubro>(configRubro("GENERAL"));

/** Rubro de la empresa del usuario logueado, para mostrar u ocultar campos y
 *  textos de ejemplo. Lo provee el layout del dashboard (ya tiene la
 *  configuración leída), así los componentes no hacen un fetch más. */
export function RubroProvider({ rubro, children }: { rubro: Rubro; children: ReactNode }) {
  return <RubroContext.Provider value={configRubro(rubro)}>{children}</RubroContext.Provider>;
}

export function useRubro(): ConfigRubro {
  return useContext(RubroContext);
}
