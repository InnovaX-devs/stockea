import type { LucideIcon } from "lucide-react";
import {
  Users,
  FlaskConical,
  PackagePlus,
  Receipt,
  Calculator,
  Tag,
  Wallet,
  History,
  FileText,
  BarChart3,
  ArrowLeftRight,
  ShoppingCart,
  Package,
  Truck,
  ClipboardCheck,
} from "lucide-react";

export type NavLeaf = {
  label: string;
  href: string;
  icon: LucideIcon;
  premium?: boolean;
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};

export type NavItem = NavLeaf | NavGroup;

export function esGrupo(item: NavItem): item is NavGroup {
  return "children" in item;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Clientes", href: "/clientes", icon: Users },
  {
    label: "Productos",
    icon: FlaskConical,
    children: [
      { label: "Productos", href: "/productos", icon: FlaskConical },
      { label: "Marcas y Categorías", href: "/marcas-categorias", icon: Tag },
      { label: "Historial de precios", href: "/historial-precios", icon: History },
    ],
  },
  {
    label: "Compras",
    icon: PackagePlus,
    children: [
      { label: "Nueva Compra", href: "/compras/nueva", icon: PackagePlus },
      { label: "Historial de Compras", href: "/compras", icon: Package },
      { label: "Proveedores", href: "/compras/proveedores", icon: Truck },
    ],
  },
  {
    label: "Ventas",
    icon: Receipt,
    children: [
      { label: "Nueva Venta", href: "/ventas", icon: ShoppingCart },
      { label: "Historial de Ventas", href: "/ventas/historial", icon: Receipt },
      { label: "Pedidos", href: "/ventas/pedidos", icon: Package },
      { label: "Comprobantes", href: "/ventas/comprobantes", icon: FileText },
    ],
  },
  { label: "Presupuestos", href: "/presupuestos", icon: FileText, premium: true },
  {
    label: "Finanzas",
    icon: Calculator,
    children: [
      { label: "Cuentas Financieras", href: "/finanzas", icon: Calculator },
      { label: "Cierre de caja", href: "/finanzas/cierre-caja", icon: ClipboardCheck },
      { label: "Flujo de Caja", href: "/finanzas/flujo-caja", icon: ArrowLeftRight, premium: true },
      { label: "Gastos", href: "/finanzas/gastos", icon: Wallet, premium: true },
    ],
  },
  { label: "Reportes", href: "/reportes", icon: BarChart3, premium: true },
];

export const EXTRA_TITLES: Record<string, string> = {
  "/configuracion": "Configuración",
};