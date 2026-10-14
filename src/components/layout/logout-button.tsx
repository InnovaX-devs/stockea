"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { limpiarCopiaLocal } from "@/lib/offline/sync-catalogo";
import { hayVentasSinSubir, sincronizarVentas } from "@/lib/offline/cola-ventas";

export function LogoutButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      // Las ventas hechas sin conexión no se pierden al salir (la cola no se
      // borra), pero solo suben con la sesión de su empresa: primero se intenta
      // subirlas y, si quedan, se avisa.
      await sincronizarVentas().catch(() => {});
      const sinSubir = await hayVentasSinSubir().catch(() => 0);
      if (
        sinSubir > 0 &&
        !window.confirm(
          `Hay ${sinSubir === 1 ? "1 venta" : `${sinSubir} ventas`} de este equipo sin subir. Quedan guardadas y se suben la próxima vez que entres. ¿Cerrar sesión igual?`
        )
      ) {
        setIsLoading(false);
        return;
      }
      await limpiarCopiaLocal().catch(() => {});
      await signOut({ callbackUrl: "/login" });
      toast.success("Sesión cerrada");
    } catch {
      toast.error("No se pudo cerrar la sesión. Intentá de nuevo.");
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className={cn(
        "inline-flex items-center cursor-pointer gap-2 rounded-full px-3 py-2 text-sm transition-colors disabled:opacity-50",
        variant === "dark"
          ? "border border-white/12 bg-white/[0.04] text-white/70 hover:border-clay/50 hover:bg-clay/10 hover:text-clay"
          : "border border-ink/10 text-ink/70 hover:border-clay/40 hover:bg-clay/5 hover:text-clay"
      )}
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
      <span className="hidden sm:inline">Cerrar sesión</span>
    </button>
  );
}