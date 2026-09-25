"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Rol } from "@/lib/permisos";

const RolContext = createContext<Rol>("ADMIN");

/** Rol del usuario logueado, para mostrar u ocultar cosas en pantalla.
 *  Es solo visual: los permisos reales se controlan en el servidor. */
export function RolProvider({ rol, children }: { rol: Rol; children: ReactNode }) {
  return <RolContext.Provider value={rol}>{children}</RolContext.Provider>;
}

export function useRol(): Rol {
  return useContext(RolContext);
}

export function useEsAdmin(): boolean {
  return useContext(RolContext) === "ADMIN";
}
