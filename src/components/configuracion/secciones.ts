import { Store, Users, FileText, type LucideIcon } from "lucide-react";

/** Secciones de Configuración: las usan el desplegable del engranaje y las pestañas. */
export const SECCIONES_CONFIGURACION: { label: string; href: string; icon: LucideIcon; descripcion: string }[] = [
  { label: "Negocio", href: "/configuracion", icon: Store, descripcion: "Datos, logo, colores, cotización y caja" },
  { label: "Usuarios", href: "/configuracion/usuarios", icon: Users, descripcion: "Administrador y empleado" },
  { label: "Facturación electrónica", href: "/configuracion/facturacion", icon: FileText, descripcion: "Conexión con ARCA" },
];
