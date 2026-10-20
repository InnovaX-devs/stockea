import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { SELECT_DEUDA_PROVEEDOR, deudaDeProveedor, resumenDeudaProveedores } from "@/lib/cuenta-corriente-proveedor";
import { saldoPendiente } from "@/lib/compras-pago";

const WHERE_COMPRA_REAL = {
  confirmada: true,
  cancelada: false,
} satisfies Prisma.CompraWhereInput;

export type ProveedorConCompras = {
  id: string;
  nombre: string;
  personaContacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  cantidadCompras: number;
  totalComprado: number;
  /** Lo que se le debe (ARS): deuda inicial + saldo de compras. */
  deuda: number;
  esVirtual: boolean;
};

export type ProveedoresFiltros = {
  busqueda?: string;
  pagina?: number;
};

export type Paginacion = {
  pagina: number;
  totalPaginas: number;
  totalItems: number;
  pageSize: number;
};

const PAGE_SIZE = 25;

export async function getProveedoresData(filtros: ProveedoresFiltros = {}) {
  const empresaId = await obtenerEmpresaIdActual();

  const proveedores = await prisma.proveedor.findMany({
    where: { empresaId },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      personaContacto: true,
      telefono: true,
      email: true,
      notas: true,
      ...SELECT_DEUDA_PROVEEDOR,
    },
  });

  const comprasSinProveedor = await prisma.compra.findMany({
    where: { ...WHERE_COMPRA_REAL, proveedorId: null, empresaId },
    select: { totalARS: true, montoPagado: true },
  });

  const proveedoresConCalculos: ProveedorConCompras[] = proveedores.map((p) => ({
    id: String(p.id),
    nombre: p.nombre,
    personaContacto: p.personaContacto,
    telefono: p.telefono,
    email: p.email,
    notas: p.notas,
    cantidadCompras: p.compras.length,
    totalComprado: p.compras.reduce((acc, c) => acc + (c.totalARS ?? 0), 0),
    deuda: deudaDeProveedor(p),
    esVirtual: false,
  }));

  // Fila virtual "Sin especificar" — solo se muestra si hay compras sin proveedor
  const cantidadComprasSinProveedor = comprasSinProveedor.length;
  const itemSinEspecificar: ProveedorConCompras | null =
    cantidadComprasSinProveedor > 0
      ? {
          id: "sin-especificar",
          nombre: "Sin especificar",
          personaContacto: null,
          telefono: null,
          email: null,
          notas: null,
          cantidadCompras: cantidadComprasSinProveedor,
          totalComprado: comprasSinProveedor.reduce((acc, c) => acc + (c.totalARS ?? 0), 0),
          deuda: comprasSinProveedor.reduce((acc, c) => acc + saldoPendiente({ totalARS: c.totalARS, montoPagado: c.montoPagado }), 0),
          esVirtual: true,
        }
      : null;

  const todos = itemSinEspecificar
    ? [...proveedoresConCalculos, itemSinEspecificar]
    : proveedoresConCalculos;

  const deudas = await resumenDeudaProveedores(empresaId, 3);
  const resumen = {
    totalProveedores: proveedoresConCalculos.length,
    totalComprado: todos.reduce((acc, p) => acc + p.totalComprado, 0),
    deudaTotal: deudas.total,
    topDeudas: deudas.top,
  };

  let filtrados = todos;
  if (filtros.busqueda) {
    const q = filtros.busqueda.toLowerCase();
    filtrados = filtrados.filter((p) => p.nombre.toLowerCase().includes(q));
  }

  const totalItems = filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const paginaSolicitada = filtros.pagina ?? 1;
  const pagina = Math.min(Math.max(1, paginaSolicitada), totalPaginas);

  const inicio = (pagina - 1) * PAGE_SIZE;
  const proveedoresPagina = filtrados.slice(inicio, inicio + PAGE_SIZE);

  const paginacion: Paginacion = { pagina, totalPaginas, totalItems, pageSize: PAGE_SIZE };

  return { proveedores: proveedoresPagina, resumen, paginacion };
}