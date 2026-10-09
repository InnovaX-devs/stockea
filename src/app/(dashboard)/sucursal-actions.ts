"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/empresa";
import { COOKIE_SUCURSAL, VALOR_TODAS, listarSucursalesHabilitadas } from "@/lib/sucursal";

type Resultado = { success: true } | { success: false; error: string };

/**
 * El admin cambia la sucursal en la que está trabajando (selector de la
 * barra superior). Se guarda en una cookie; obtenerContextoSucursal() la
 * vuelve a validar en cada request, así que una cookie vieja o manipulada
 * no da acceso a nada que no corresponda.
 */
export async function elegirSucursal(valor: number | typeof VALOR_TODAS): Promise<Resultado> {
  try {
    const admin = await requerirAdmin();

    if (valor !== VALOR_TODAS) {
      const sucursales = await listarSucursalesHabilitadas(admin.empresaId);
      if (!sucursales.some((s) => s.id === valor)) {
        return { success: false, error: "Esa sucursal no está disponible." };
      }
    }

    (await cookies()).set(COOKIE_SUCURSAL, String(valor), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo cambiar de sucursal." };
  }
}
