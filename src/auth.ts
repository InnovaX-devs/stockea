import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Rol } from "@/lib/permisos";
import { verificarPaseCambioUsuario } from "@/lib/cambio-usuario";

/**
 * Busca el usuario y verifica que pueda entrar: activo, empresa activa y,
 * si es empleado, que la empresa siga siendo Premium. Lo usan los dos
 * caminos de entrada (login normal y cambio de usuario).
 */
async function usuarioHabilitado(where: { email: string } | { id: number }) {
  const usuario = await prisma.usuario.findUnique({
    where,
    include: { empresa: { include: { configuracion: { select: { licencia: true } } } } },
  });

  if (!usuario || !usuario.activo) return null;
  if (!usuario.empresa.activa) return null;

  // El usuario empleado es una función Premium: si la empresa pasó a
  // BASICO, el empleado deja de poder entrar (el admin sí).
  if (usuario.rol === "EMPLEADO" && usuario.empresa.configuracion?.licencia !== "PREMIUM") return null;

  return usuario;
}

function datosDeSesion(usuario: NonNullable<Awaited<ReturnType<typeof usuarioHabilitado>>>) {
  return {
    id: String(usuario.id),
    email: usuario.email,
    name: usuario.nombre,
    empresaId: usuario.empresaId,
    rol: usuario.rol,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    // Login normal con email y contraseña.
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const usuario = await usuarioHabilitado({ email: credentials.email as string });
        if (!usuario) return null;

        const passwordValida = await bcrypt.compare(
          credentials.password as string,
          usuario.passwordHash
        );

        if (!passwordValida) {
          return null;
        }

        return datosDeSesion(usuario);
      },
    }),
    // Cambio rápido admin ⇄ empleado sin cerrar sesión. No recibe
    // contraseña: recibe un pase firmado que solo emite el servidor después
    // de verificar el cambio (src/app/(dashboard)/cambio-usuario-actions.ts).
    Credentials({
      id: "cambio-usuario",
      credentials: { pase: { type: "text" } },
      async authorize(credentials) {
        const usuarioId = verificarPaseCambioUsuario(credentials?.pase);
        if (!usuarioId) return null;

        const usuario = await usuarioHabilitado({ id: usuarioId });
        return usuario ? datosDeSesion(usuario) : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.empresaId = user.empresaId;
        token.rol = user.rol;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.empresaId = token.empresaId as number;
        // Sesiones de antes de los roles no traen rol: eran todas del admin.
        session.user.rol = (token.rol as Rol | undefined) ?? "ADMIN";
      }
      return session;
    },
  },
});