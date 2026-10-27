"use client";

import { createContext, useContext, type ReactNode } from "react";

const PlanContext = createContext<boolean>(false);

/** Plan de la empresa (Premium o Básico), para mostrar u ocultar funciones en
 *  pantalla. Es solo visual: el bloqueo real se hace en el servidor con los
 *  flags de src/lib/configuracion.ts. */
export function PlanProvider({ premium, children }: { premium: boolean; children: ReactNode }) {
  return <PlanContext.Provider value={premium}>{children}</PlanContext.Provider>;
}

export function useEsPremium(): boolean {
  return useContext(PlanContext);
}

/** Texto único para las funciones que son del plan Pro. */
export const MENSAJE_SOLO_PRO = "Disponible en el plan Pro. Hablá con InnovaX para cambiar de plan.";
