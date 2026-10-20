/**
 * Crea la empresa DEMO de ropa (equivalente a "Perfumería Sur" pero para el
 * rubro ROPA): modelos con talles y colores, stock en 2 sucursales, una
 * compra, ventas de los últimos 25 días y una transferencia entre sucursales.
 *
 * Uso:
 *   ADMIN_PASSWORD="unaClaveSegura123" npx tsx scripts/crear-demo-ropa.ts
 *
 * Opcionales: NOMBRE_NEGOCIO (default "Indumentaria Norte"),
 *             ADMIN_EMAIL (default "demo@indumentarianorte.com").
 * No toca otras empresas. Si la empresa ya existe, no hace nada.
 * IMPORTANTE: no marques como desarrollador al usuario de esta demo (ver docs/PANEL-INNOVAX.md).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nombreVariante } from "../src/lib/variantes";

const prisma = new PrismaClient();
const COTIZACION = 1000;

// Generador determinístico: la demo sale igual cada vez.
let semilla = 20261020;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
const elegirPesado = <T,>(lista: { v: T; peso: number }[]): T => {
  let r = azar() * lista.reduce((a, x) => a + x.peso, 0);
  for (const x of lista) if ((r -= x.peso) <= 0) return x.v;
  return lista[lista.length - 1].v;
};

type Def = { nombre: string; marca: string; categoria: string; costo: number; precio: number; talles: string[]; colores: string[]; popularidad: number };
const MODELOS: Def[] = [
  { nombre: "Remera básica", marca: "Urbana", categoria: "Remeras", costo: 6000, precio: 14000, talles: ["S", "M", "L", "XL"], colores: ["Negro", "Blanco", "Gris"], popularidad: 10 },
  { nombre: "Jean slim", marca: "Denim Co", categoria: "Pantalones", costo: 18000, precio: 42000, talles: ["38", "40", "42", "44"], colores: ["Azul", "Negro"], popularidad: 7 },
  { nombre: "Campera rompevientos", marca: "Urbana", categoria: "Camperas", costo: 25000, precio: 58000, talles: ["M", "L", "XL"], colores: ["Negro", "Verde", "Rojo"], popularidad: 3 },
  { nombre: "Buzo canguro", marca: "Urbana", categoria: "Camperas", costo: 16000, precio: 37000, talles: ["S", "M", "L", "XL"], colores: ["Gris", "Negro", "Beige"], popularidad: 6 },
  { nombre: "Zapatilla urbana", marca: "Paso Firme", categoria: "Calzado", costo: 30000, precio: 69000, talles: ["39", "40", "41", "42", "43"], colores: ["Blanco", "Negro"], popularidad: 5 },
  { nombre: "Vestido midi", marca: "Denim Co", categoria: "Vestidos", costo: 15000, precio: 35000, talles: ["S", "M", "L"], colores: ["Rosa", "Negro", "Azul"], popularidad: 4 },
];
// Talles/colores más pedidos, para que el reporte muestre diferencias claras.
const PESO_TALLE: Record<string, number> = { M: 5, L: 4, S: 2, XL: 1, "40": 4, "42": 4, "41": 3, "38": 2, "39": 2, "43": 1, "44": 1 };
const PESO_COLOR: Record<string, number> = { Negro: 6, Blanco: 4, Gris: 3, Azul: 3, Rosa: 2, Verde: 1, Rojo: 1, Beige: 2 };

async function main() {
  const nombreNegocio = process.env.NOMBRE_NEGOCIO ?? "Indumentaria Norte";
  const email = process.env.ADMIN_EMAIL ?? "demo@indumentarianorte.com";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('Falta ADMIN_PASSWORD. Uso: ADMIN_PASSWORD="clave" npx tsx scripts/crear-demo-ropa.ts');
    process.exit(1);
  }
  if (await prisma.empresa.findFirst({ where: { nombre: nombreNegocio } })) {
    console.log(`Ya existe "${nombreNegocio}". No se hizo nada.`);
    return;
  }
  if (await prisma.usuario.findUnique({ where: { email } })) {
    console.error(`Ya existe un usuario con el email ${email}.`);
    process.exit(1);
  }

  const empresa = await prisma.empresa.create({ data: { nombre: nombreNegocio } });
  const empresaId = empresa.id;
  await prisma.configuracion.create({
    data: { empresaId, nombreNegocio, cotizacionUSD: COTIZACION, licencia: "PREMIUM", rubro: "ROPA", eslogan: "Moda para todos los días" },
  });
  const admin = await prisma.usuario.create({
    data: { nombre: "Administrador", email, passwordHash: await bcrypt.hash(password, 10), activo: true, empresaId },
  });
  const principal = await prisma.sucursal.create({ data: { empresaId, nombre: "Principal" } });
  const centro = await prisma.sucursal.create({ data: { empresaId, nombre: "Sucursal Centro" } });

  const cajaP = await prisma.cuenta.create({ data: { empresaId, nombre: "Caja Principal", tipo: "EFECTIVO_ARS", sucursalId: principal.id, favorita: true } });
  const cajaC = await prisma.cuenta.create({ data: { empresaId, nombre: "Caja Centro", tipo: "EFECTIVO_ARS", sucursalId: centro.id } });
  const banco = await prisma.cuenta.create({ data: { empresaId, nombre: "Banco", tipo: "BANCO_ARS", saldoInicial: 6000000, saldoActual: 6000000 } });
  const saldo = new Map<number, number>([[cajaP.id, 0], [cajaC.id, 0], [banco.id, 6000000]]);
  const cajaDe = (sucId: number) => (sucId === principal.id ? cajaP : cajaC);

  // ---- Catálogo: marcas, categorías, modelos y variantes ----
  const marcas = new Map<string, number>();
  const categorias = new Map<string, number>();
  for (const m of new Set(MODELOS.map((x) => x.marca))) marcas.set(m, (await prisma.marca.create({ data: { empresaId, nombre: m } })).id);
  for (const c of new Set(MODELOS.map((x) => x.categoria))) categorias.set(c, (await prisma.categoria.create({ data: { empresaId, nombre: c } })).id);

  type Variante = { id: number; modeloIdx: number; talle: string; color: string; precioUSD: number; costoUSD: number };
  const variantes: Variante[] = [];
  for (let mi = 0; mi < MODELOS.length; mi++) {
    const d = MODELOS[mi];
    const modelo = await prisma.productoModelo.create({
      data: { empresaId, nombre: d.nombre, marcaId: marcas.get(d.marca), categoriaId: categorias.get(d.categoria) },
    });
    for (const talle of d.talles) {
      for (const color of d.colores) {
        const p = await prisma.producto.create({
          data: {
            empresaId, modeloId: modelo.id, talle, color,
            nombre: nombreVariante(d.nombre, talle, color),
            marcaId: marcas.get(d.marca), categoriaId: categorias.get(d.categoria),
            monedaPrecio: "ARS", precioCosto: d.costo, precioVenta: d.precio, precioMayorista: Math.round(d.precio * 0.85),
            stockMinimo: 3,
          },
        });
        variantes.push({ id: p.id, modeloIdx: mi, talle, color, precioUSD: d.precio / COTIZACION, costoUSD: d.costo / COTIZACION });
      }
    }
  }

  // ---- Stock en memoria: se escribe una sola vez al final ----
  const stock = new Map<string, number>(); // `${productoId}:${sucursalId}`
  const get = (p: number, s: number) => stock.get(`${p}:${s}`) ?? 0;
  const add = (p: number, s: number, n: number) => stock.set(`${p}:${s}`, get(p, s) + n);

  // ---- Compra inicial al proveedor (recibida y pagada desde el banco) ----
  const proveedor = await prisma.proveedor.create({ data: { empresaId, nombre: "Textil Andina", personaContacto: "Marcos" } });
  const unidadesIniciales = 14;
  const itemsCompra = variantes.map((v) => ({ productoId: v.id, cantidad: unidadesIniciales, costoUnitarioUSD: v.costoUSD }));
  const totalCompraUSD = itemsCompra.reduce((a, i) => a + i.cantidad * i.costoUnitarioUSD, 0);
  const fechaCompra = new Date(Date.now() - 27 * 86400000);
  const compra = await prisma.compra.create({
    data: {
      empresaId, numero: 1, proveedorId: proveedor.id, cuentaId: banco.id, sucursalId: principal.id,
      totalUSD: totalCompraUSD, totalARS: totalCompraUSD * COTIZACION, cotizacionUsada: COTIZACION,
      confirmada: true, pagada: true, recibida: true, fecha: fechaCompra,
      items: { create: itemsCompra },
    },
  });
  for (const i of itemsCompra) add(i.productoId, principal.id, i.cantidad);
  const montoCompra = totalCompraUSD * COTIZACION;
  saldo.set(banco.id, saldo.get(banco.id)! - montoCompra);
  await prisma.movimientoCaja.create({
    data: { empresaId, cuentaId: banco.id, tipo: "EGRESO", concepto: "PAGO_A_PROVEEDOR", monto: montoCompra, saldoResultante: saldo.get(banco.id)!, detalle: "Compra #1 · Textil Andina", fecha: fechaCompra, compraId: compra.id, sucursalId: principal.id },
  });

  // ---- Transferencia Principal → Centro (recibida) ----
  const fechaTransf = new Date(Date.now() - 20 * 86400000);
  const aTransferir = variantes.filter((_, i) => i % 3 === 0).map((v) => ({ productoId: v.id, cantidad: 5 }));
  await prisma.transferencia.create({
    data: {
      empresaId, numero: 1, estado: "RECIBIDA", fechaEnvio: fechaTransf, fechaRecepcion: fechaTransf,
      origenId: principal.id, destinoId: centro.id, usuarioEnvioId: admin.id, usuarioRecepcionId: admin.id,
      observaciones: "Reposición inicial Sucursal Centro",
      items: { create: aTransferir },
    },
  });
  for (const i of aTransferir) { add(i.productoId, principal.id, -i.cantidad); add(i.productoId, centro.id, i.cantidad); }

  // ---- Ventas: ~45 en los últimos 25 días, sesgadas por modelo/talle/color ----
  const pesoVariante = (v: Variante) => MODELOS[v.modeloIdx].popularidad * (PESO_TALLE[v.talle] ?? 1) * (PESO_COLOR[v.color] ?? 1);
  const candidatas = variantes.map((v) => ({ v, peso: pesoVariante(v) }));
  const CANT_VENTAS = 45;
  for (let n = 1; n <= CANT_VENTAS; n++) {
    const sucId = azar() < 0.65 ? principal.id : centro.id;
    const dias = Math.floor(azar() * 25);
    const fecha = new Date(Date.now() - dias * 86400000 - Math.floor(azar() * 8) * 3600000);
    const lineas = new Map<number, number>();
    const cantLineas = 1 + Math.floor(azar() * 2);
    for (let k = 0; k < cantLineas; k++) {
      const v = elegirPesado(candidatas);
      if (get(v.id, sucId) - (lineas.get(v.id) ?? 0) >= 1) lineas.set(v.id, (lineas.get(v.id) ?? 0) + 1);
    }
    if (lineas.size === 0) continue;

    const items = Array.from(lineas, ([productoId, cantidad]) => ({ productoId, cantidad, precioUnitarioUSD: variantes.find((x) => x.id === productoId)!.precioUSD }));
    const totalUSD = items.reduce((a, i) => a + i.cantidad * i.precioUnitarioUSD, 0);
    const totalARS = Math.round(totalUSD * COTIZACION);
    const aCuenta = azar() < 0.1; // algunas ventas quedan con saldo para mostrar deuda
    const montoPagado = aCuenta ? Math.round(totalARS / 2) : totalARS;
    const cuenta = azar() < 0.7 ? cajaDe(sucId) : banco;

    const venta = await prisma.venta.create({
      data: {
        empresaId, numero: n, sucursalId: sucId, fecha, cotizacionUsada: COTIZACION,
        totalUSD, totalARS, montoPagado, estadoPago: aCuenta ? "A_CUENTA" : "PAGADA",
        armado: true, enviado: true, retirado: true, impreso: true,
        items: { create: items.map((i) => ({ ...i, tipoPrecio: "MINORISTA" as const })) },
        pagos: { create: [{ cuentaId: cuenta.id, monto: montoPagado, montoARS: montoPagado, fecha }] },
      },
    });
    saldo.set(cuenta.id, saldo.get(cuenta.id)! + montoPagado);
    await prisma.movimientoCaja.create({
      data: { empresaId, cuentaId: cuenta.id, tipo: "INGRESO", concepto: "VENTA_COBRADA", monto: montoPagado, saldoResultante: saldo.get(cuenta.id)!, detalle: `Venta #${n}`, fecha, ventaId: venta.id, sucursalId: sucId },
    });
    for (const i of items) add(i.productoId, sucId, -i.cantidad);
  }

  // ---- Persistir stock (sucursal y total) y saldos de cuentas ----
  const totales = new Map<number, number>();
  for (const [clave, cantidad] of stock) {
    const [productoId, sucursalId] = clave.split(":").map(Number);
    totales.set(productoId, (totales.get(productoId) ?? 0) + cantidad);
    await prisma.stockSucursal.create({ data: { productoId, sucursalId, cantidad, stockMinimo: 3 } });
  }
  for (const [productoId, total] of totales) await prisma.producto.update({ where: { id: productoId }, data: { stockActual: total } });
  for (const [cuentaId, saldoActual] of saldo) await prisma.cuenta.update({ where: { id: cuentaId }, data: { saldoActual } });

  // Dejar los contadores de numeración al día con lo que cargó el script.
  await prisma.empresa.update({
    where: { id: empresaId },
    data: {
      ultimoNumeroVenta: CANT_VENTAS,
      ultimoNumeroCompra: 1,
      ultimoNumeroTransferencia: 1,
    },
  });

  console.log("✅ Empresa demo creada:", nombreNegocio, `(id ${empresaId})`);
  console.log(`   ${MODELOS.length} modelos, ${variantes.length} variantes, 2 sucursales, 1 compra, 1 transferencia, ventas de ejemplo.`);
  console.log("✅ Usuario:", email);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

