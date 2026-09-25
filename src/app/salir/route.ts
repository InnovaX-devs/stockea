import { signOut } from "@/auth";

/**
 * Cierra la sesión y manda al login. Se usa cuando la cookie sigue viva pero
 * el usuario ya no es válido (el admin borró al empleado, la empresa dejó de
 * ser Premium, etc.). Ver obtenerUsuarioActualOpcional en src/lib/empresa.ts.
 */
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
