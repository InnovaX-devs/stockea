import type { Rol } from "@/lib/permisos";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      empresaId: number;
      rol: Rol;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    empresaId: number;
    rol: Rol;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    empresaId: number;
    rol?: Rol;
  }
}