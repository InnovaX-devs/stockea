/**
 * Pruebas de "Actualizar productos desde CSV" (issue #109). Sin base de datos:
 *  - lectura y validación del CSV (actualizar-productos-parseo.ts)
 *  - plan de cambios contra los productos actuales (actualizar-productos-plan.ts)
 *  - la transacción (actualizar-productos.ts) contra un cliente falso que registra lo que se escribe.
 *
 * Correr con:  npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ErrorArchivo,
  generarPlantillaActualizacion,
  leerYValidarActualizacion,
  type ProductoPlantilla,
} from "@/lib/actualizar-productos-parseo";
import {
  planificarActualizacion,
  type ContextoActualizacion,
  type DatosActuales,
  type ProductoActual,
} from "@/lib/actualizar-productos-plan";

const csv = (...lineas: string[]) => Buffer.from(lineas.join("\r\n") + "\r\n", "utf-8");

const ctx: ContextoActualizacion = { empresaId: 1, sucursalId: 1, multisucursal: false, permiteUSD: false };

/** Código de barras de `producto(id)`. */
const bc = (id: number) => `7790000${String(id).padStart(6, "0")}`;

const producto = (id: number, extra: Partial<ProductoActual> = {}): ProductoActual => ({
  id,
  nombre: `Producto ${id}`,
  codigoBarras: bc(id),
  modeloId: null,
  marcaId: null,
  categoriaId: null,
  monedaPrecio: "ARS",
  precioCosto: 1000,
  precioVenta: 1500,
  precioMayorista: 1300,
  precioAbierto: false,
  esPromocion: false,
  stockMinimo: 2,
  ...extra,
});

const datos = (productos: ProductoActual[], extra: Partial<DatosActuales> = {}): DatosActuales => ({
  productos,
  marcas: [{ id: 10, nombre: "Nike" }],
  categorias: [{ id: 20, nombre: "Remeras" }],
  minimoSucursal: null,
  ...extra,
});

/** Lee el CSV y lo compara contra los productos dados. */
function planDe(buffer: Buffer, productos: ProductoActual[], c: ContextoActualizacion = ctx, extra: Partial<DatosActuales> = {}) {
  const parseo = leerYValidarActualizacion(buffer);
  return planificarActualizacion(parseo.filas, parseo.errores, datos(productos, extra), c);
}

// ---------------------------------------------------------------------------
// Lectura del CSV
// ---------------------------------------------------------------------------

test("lee CSV con punto y coma, coma decimal y miles con punto", () => {
  const r = leerYValidarActualizacion(
    csv("Código de barras;Costo;Precio minorista;Precio mayorista", "111;800,50;1.500,75;1300", "222;1000;2.000;")
  );
  assert.equal(r.errores.length, 0);
  assert.deepEqual(
    r.filas.map((f) => [f.codigoBarras, f.precioCosto, f.precioVenta, f.precioMayorista]),
    [
      ["111", 800.5, 1500.75, 1300],
      ["222", 1000, 2000, undefined], // celda vacía = no cambia
    ]
  );
});

test("lee CSV separado por coma (decimales entre comillas) y por tabulación", () => {
  const coma = leerYValidarActualizacion(csv('Código de barras,Precio minorista', '7790000000001,"1500,50"', "7790000000002,2000.5"));
  assert.deepEqual(coma.filas.map((f) => [f.codigoBarras, f.precioVenta]), [["7790000000001", 1500.5], ["7790000000002", 2000.5]]);

  const tab = leerYValidarActualizacion(csv("Nombre\tCosto", "Yerba\t10,5"));
  assert.deepEqual(tab.filas.map((f) => [f.nombre, f.precioCosto]), [["Yerba", 10.5]]);
});

test("acepta UTF-8 con BOM y Windows-1252 (CSV de Excel en español)", () => {
  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv("Nombre;Categoría", "Café molido;Almacén")]);
  assert.equal(leerYValidarActualizacion(utf8).filas[0].nombre, "Café molido");

  const ansi = Buffer.from("Nombre;Categor\xeda\r\nCaf\xe9 molido;Almac\xe9n\r\n", "latin1");
  const r = leerYValidarActualizacion(ansi);
  assert.equal(r.filas[0].nombre, "Café molido");
  assert.equal(r.filas[0].categoria, "Almacén");
});

test("el número de fila cuenta los encabezados como fila 1 y saltea renglones vacíos", () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Costo", "1;10", "", "2;abc", "3;-5", "4;20"));
  assert.deepEqual(r.errores.map((e) => e.fila), [4, 5]);
  assert.match(r.errores[0].mensaje, /costo "abc" no es un número/i);
  assert.match(r.errores[1].mensaje, /costo no puede ser negativo/i);
  assert.deepEqual(r.filas.map((f) => f.fila), [2, 6]);
  assert.equal(r.total, 4);
});

test("una fila con varios problemas los informa todos", () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Costo;Moneda;Stock mínimo", "1;x;EUR;1,5"));
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0].mensaje, /costo/i);
  assert.match(r.errores[0].mensaje, /moneda/i);
  assert.match(r.errores[0].mensaje, /entero/i);
});

test("fila sin código de barras ni nombre es un error", () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Nombre;Costo", ";;100"));
  assert.match(r.errores[0].mensaje, /no tiene código de barras ni nombre/i);
});

test("sin código de barras la fila se identifica por nombre", () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Nombre;Costo", ";Sin código;100"));
  assert.equal(r.errores.length, 0);
  assert.deepEqual([r.filas[0].codigoBarras, r.filas[0].nombre], [null, "Sin código"]);
});

test("código de barras en notación científica (Excel): error sin nombre; con nombre se usa el nombre; un SKU como 12E3 no es notación científica", () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Nombre;Costo", "7,79E+12;;100", "7,79E+12;Yerba;100", "12E3;;100"));
  assert.equal(r.errores.length, 1);
  assert.equal(r.errores[0].fila, 2);
  assert.match(r.errores[0].mensaje, /notación científica/);
  assert.deepEqual(r.filas.map((f) => [f.codigoBarras, f.nombre]), [[null, "Yerba"], ["12E3", null]]);
});

test('el envoltorio ="779…" que escribe la plantilla se saca al leer', () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Costo", '"=""7790000000001""";100'));
  assert.equal(r.filas[0].codigoBarras, "7790000000001");
});

test("nombres que son errores de Excel se rechazan", () => {
  const r = leerYValidarActualizacion(csv("Nombre;Costo", "#NAME?;1", "Nombre bueno;2"));
  assert.equal(r.errores.length, 1);
  assert.equal(r.filas[0].nombre, "Nombre bueno");
});

test("la columna Stock se reconoce pero no se importa", () => {
  const r = leerYValidarActualizacion(csv("Código de barras;Costo;Stock", "1;100;50"));
  assert.equal(r.ignoradas.length, 1);
  assert.equal(r.ignoradas[0].titulo, "Stock");
  assert.equal("stock" in r.filas[0], false);
});

test("archivos que no sirven dan un mensaje claro", () => {
  assert.throws(() => leerYValidarActualizacion(Buffer.alloc(0)), ErrorArchivo);
  assert.throws(() => leerYValidarActualizacion(csv("Foo;Bar", "1;2")), /encabezados/);
  // Solo identifica, no hay nada para actualizar.
  assert.throws(() => leerYValidarActualizacion(csv("Código de barras", "1")), /encabezados/);
  // Un .xlsx (zip) no es un CSV.
  assert.throws(() => leerYValidarActualizacion(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), /Excel \(\.xlsx\)/);
});

test("la plantilla descargada se vuelve a leer sin perder nada", () => {
  const productos: ProductoPlantilla[] = [
    { codigoBarras: "7790000000001", nombre: "Yerba; \"premium\" 1 kg", precioCosto: 800.5, moneda: "ARS", precioVenta: 1500, precioMayorista: null, stockMinimo: 3, categoria: "Almacén", marca: "Taragüí" },
    { codigoBarras: "0012345", nombre: "Con cero adelante", precioCosto: 10, moneda: "USD", precioVenta: 20.25, precioMayorista: 15, stockMinimo: 0, categoria: null, marca: null },
    { codigoBarras: null, nombre: "Sin código", precioCosto: 5, moneda: "ARS", precioVenta: 9, precioMayorista: null, stockMinimo: 1, categoria: null, marca: null },
    { codigoBarras: "AB-12", nombre: "SKU con letras", precioCosto: 5, moneda: "ARS", precioVenta: 9, precioMayorista: null, stockMinimo: 1, categoria: null, marca: null },
  ];
  const buffer = generarPlantillaActualizacion(productos);
  assert.equal(buffer.subarray(0, 3).toString("hex"), "efbbbf", "lleva BOM para que Excel vea las tildes");

  const r = leerYValidarActualizacion(buffer);
  assert.equal(r.errores.length, 0);
  assert.equal(r.filas.length, 4);
  assert.deepEqual(r.filas.map((f) => f.codigoBarras), ["7790000000001", "0012345", null, "AB-12"]);
  assert.equal(r.filas[0].nombre, 'Yerba; "premium" 1 kg');
  assert.equal(r.filas[0].precioCosto, 800.5);
  assert.equal(r.filas[1].moneda, "USD");
  assert.equal(r.filas[1].precioVenta, 20.25);
  assert.equal(r.filas[0].precioMayorista, undefined);

  // Sin tocar nada, el archivo descargado no cambia nada.
  const actuales: ProductoActual[] = productos.map((p, i) =>
    producto(i + 1, { nombre: p.nombre, codigoBarras: p.codigoBarras, precioCosto: p.precioCosto, precioVenta: p.precioVenta, precioMayorista: p.precioMayorista, monedaPrecio: p.moneda, stockMinimo: p.stockMinimo })
  );
  const plan = planificarActualizacion(r.filas, r.errores, datos(actuales, { marcas: [{ id: 1, nombre: "Taragüí" }], categorias: [{ id: 2, nombre: "Almacén" }] }), { ...ctx, permiteUSD: true });
  // Marca y categoría del producto 1 no están asignadas en `actuales`: ese es el único cambio.
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.cambios.length, 1);
  assert.equal(plan.cambios[0].productoId, 1);
  assert.deepEqual(plan.cambios[0].cambios.map((c) => c.campo).sort(), ["categoria", "marca"]);
  // El producto sin código de barras (3) se encontró por nombre.
});

// ---------------------------------------------------------------------------
// Plan de cambios
// ---------------------------------------------------------------------------

test("criterio: cambiar el precio de 50 productos actualiza esos 50 y los registra en el historial", () => {
  const productos = Array.from({ length: 80 }, (_, i) => producto(i + 1));
  const lineas = ["Código de barras;Costo;Precio minorista;Precio mayorista"];
  for (let i = 1; i <= 80; i++) {
    const p = productos[i - 1];
    lineas.push(i <= 50 ? `${bc(i)};${p.precioCosto};${String(p.precioVenta * 1.1).replace(".", ",")};${p.precioMayorista}` : `${bc(i)};${p.precioCosto};${p.precioVenta};${p.precioMayorista}`);
  }
  const plan = planDe(csv(...lineas), productos);
  assert.equal(plan.cambios.length, 50);
  assert.equal(plan.sinCambios, 30);
  assert.equal(plan.errores.length, 0);
  assert.ok(plan.cambios.every((c) => c.historial.length === 1 && c.historial[0].campo === "MINORISTA"));
  assert.deepEqual(plan.cambios[0].historial[0], { campo: "MINORISTA", anterior: 1500, nuevo: 1650 });
  assert.equal(plan.cambios[0].datos.precioVenta, 1650);
});

test("muestra valor anterior y nuevo, formateados", () => {
  const plan = planDe(csv("Código de barras;Costo;Precio minorista", `${bc(1)};900,5;1.800`), [producto(1)]);
  const [cambio] = plan.cambios[0].cambios.filter((c) => c.campo === "precioCosto");
  assert.match(cambio.anterior, /1\.000/);
  assert.match(cambio.nuevo, /900,50/);
});

test("un valor igual al actual no es un cambio; celda vacía y columna ausente tampoco", () => {
  const plan = planDe(csv("Código de barras;Costo;Precio minorista;Precio mayorista;Marca", `${bc(1)};1000;1500,00;;`), [producto(1)]);
  assert.equal(plan.cambios.length, 0);
  assert.equal(plan.sinCambios, 1);
});

test("encuentra el producto por código de barras", () => {
  const productos = [producto(1), producto(2)];
  const plan = planDe(csv("Código de barras;Precio minorista", `${bc(2)};2000`), productos);
  assert.equal(plan.cambios.length, 1);
  assert.equal(plan.cambios[0].productoId, 2);
});

test("sin código de barras, encuentra el producto por nombre exacto (sin importar mayúsculas ni espacios de más)", () => {
  const productos = [producto(1, { codigoBarras: null, nombre: "Pan casero" }), producto(2)];
  const plan = planDe(csv("Código de barras;Nombre;Precio minorista", ";  pan   CASERO ;2000"), productos);
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.cambios[0].productoId, 1);
});

test("si el código de barras no existe no se usa el nombre: es un error", () => {
  const plan = planDe(csv("Código de barras;Nombre;Precio minorista", `0000000000000;${producto(1).nombre};2000`), [producto(1)]);
  assert.equal(plan.cambios.length, 0);
  assert.match(plan.errores[0].mensaje, /No existe ningún producto con el código de barras/);
});

test("código ilegible por Excel + nombre: se encuentra por nombre", () => {
  const plan = planDe(csv("Código de barras;Nombre;Precio minorista", `7,79E+12;${producto(1).nombre};2000`), [producto(1)]);
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.cambios[0].productoId, 1);
});

test("nombre que no existe, o que lo tienen varios productos, es un error", () => {
  const productos = [producto(1, { codigoBarras: null, nombre: "Pan" }), producto(2, { codigoBarras: null, nombre: "pan" }), producto(3)];
  const plan = planDe(csv("Nombre;Precio minorista", "Pan;100", "Fideos;100"), productos);
  assert.equal(plan.cambios.length, 0);
  assert.match(plan.errores[0].mensaje, /Hay 2 productos que se llaman "Pan"/);
  assert.match(plan.errores[1].mensaje, /No existe ningún producto que se llame "Fideos"/);
});

test("el código de barras y el nombre son la clave: no se cambian desde el CSV", () => {
  const plan = planDe(csv("Código de barras;Nombre;Precio minorista", `${bc(1)};Otro nombre;1600`), [producto(1)]);
  assert.equal(plan.cambios.length, 1);
  assert.deepEqual(plan.cambios[0].cambios.map((c) => c.campo), ["precioVenta"]);
  assert.equal("nombre" in plan.cambios[0].datos, false);
  assert.equal("codigoBarras" in plan.cambios[0].datos, false);
});

test("filas con error se informan con su número y no impiden revisar el resto", () => {
  const productos = [producto(1), producto(2)];
  const plan = planDe(
    csv("Código de barras;Precio minorista", `${bc(1)};1600`, "9990000000999;100", `0000000000000;100`, `${bc(2)};1700`),
    productos
  );
  assert.deepEqual(plan.cambios.map((c) => c.productoId), [1, 2]);
  assert.deepEqual(plan.errores.map((e) => e.fila), [3, 4]);
  assert.match(plan.errores[0].mensaje, /No existe ningún producto con el código de barras 9990000000999/);
});

test("el mismo producto dos veces en el archivo (por código y por nombre): la segunda es un error", () => {
  const productos = [producto(1)];
  const plan = planDe(csv("Código de barras;Nombre;Precio minorista", `${bc(1)};;1600`, `;${productos[0].nombre};1700`), productos);
  assert.equal(plan.cambios.length, 1);
  assert.equal(plan.errores.length, 1);
  assert.match(plan.errores[0].mensaje, /mismo producto que la fila 2/);
});

test("una fila con un error no se aplica en parte", () => {
  const plan = planDe(csv("Código de barras;Precio minorista;Categoría", `${bc(1)};1600;Inexistente`), [producto(1)]);
  assert.equal(plan.cambios.length, 0);
  assert.match(plan.errores[0].mensaje, /categoría "Inexistente" no existe/);
});

test("marca y categoría existentes se asignan sin distinguir mayúsculas; las que no existen son un error", () => {
  const plan = planDe(csv("Código de barras;Marca;Categoría", `${bc(1)};nike;REMERAS`, `${bc(2)};Adidas;`), [producto(1), producto(2)]);
  assert.deepEqual([plan.cambios[0].datos.marcaId, plan.cambios[0].datos.categoriaId], [10, 20]);
  assert.match(plan.errores[0].mensaje, /marca "Adidas" no existe/);
});

test("dólares solo si el negocio vende en dólares", () => {
  const sinUsd = planDe(csv("Código de barras;Moneda", `${bc(1)};USD`), [producto(1)]);
  assert.match(sinUsd.errores[0].mensaje, /no vende en dólares/);
  const conUsd = planDe(csv("Código de barras;Moneda", `${bc(1)};USD`), [producto(1)], { ...ctx, permiteUSD: true });
  assert.equal(conUsd.cambios[0].datos.monedaPrecio, "USD");
  // Si ya está en USD y el archivo dice USD, no es un cambio ni un error.
  const igual = planDe(csv("Código de barras;Moneda", `${bc(1)};USD`), [producto(1, { monedaPrecio: "USD" })]);
  assert.equal(igual.errores.length, 0);
  assert.equal(igual.sinCambios, 1);
});

test("precio minorista 0 es un error salvo en productos de precio abierto", () => {
  const plan = planDe(csv("Código de barras;Precio minorista", `${bc(1)};0`, `${bc(2)};0`), [producto(1), producto(2, { precioAbierto: true, precioVenta: 5 })]);
  assert.equal(plan.errores.length, 1);
  assert.equal(plan.errores[0].fila, 2);
  assert.equal(plan.cambios.length, 1);
});

test("el precio mayorista pasa de vacío a un valor y queda en el historial con anterior null", () => {
  const plan = planDe(csv("Código de barras;Precio mayorista", `${bc(1)};1200`), [producto(1, { precioMayorista: null })]);
  assert.deepEqual(plan.cambios[0].historial, [{ campo: "MAYORISTA", anterior: null, nuevo: 1200 }]);
});

test("los precios que cambian entran al historial (costo, minorista, mayorista); lo demás no", () => {
  const plan = planDe(csv("Código de barras;Costo;Precio minorista;Precio mayorista;Stock mínimo", `${bc(1)};1100;1600;1400;5`), [producto(1)]);
  assert.deepEqual(plan.cambios[0].historial.map((h) => h.campo), ["COSTO", "MINORISTA", "MAYORISTA"]);
  assert.equal(plan.cambios[0].cambios.length, 4); // costo, minorista, mayorista y stock mínimo
});

test("combinaciones de un modelo (ropa): precios sí, marca/categoría no", () => {
  const variante = producto(1, { modeloId: 7, nombre: "Remera · M · Negro" });
  const ok = planDe(csv("Código de barras;Precio minorista", `${bc(1)};1600`), [variante]);
  assert.equal(ok.cambios.length, 1);
  const mal = planDe(csv("Código de barras;Marca", `${bc(1)};Nike`), [variante]);
  assert.equal(mal.errores.length, 1);
  assert.match(mal.errores[0].mensaje, /combinación de un modelo/);
});

test("las promociones no se editan desde acá: error claro por código de barras o por nombre", () => {
  const promo = producto(5, { nombre: "Promo Fernet + 2 Coca", esPromocion: true, codigoBarras: "PROMO-1" });
  const promoSinCodigo = producto(6, { nombre: "Promo sin código", esPromocion: true, codigoBarras: null });
  const plan = planDe(
    csv("Código de barras;Nombre;Precio minorista", "PROMO-1;;9000", `;Promo sin código;9000`, `${bc(1)};;1600`),
    [producto(1), promo, promoSinCodigo]
  );
  assert.deepEqual(plan.cambios.map((c) => c.productoId), [1]);
  assert.deepEqual(plan.errores.map((e) => e.fila), [2, 3]);
  assert.match(plan.errores[0].mensaje, /es una promoción: se edita desde Promociones/);
});

test("stock mínimo: con varias sucursales se compara y se cambia el de la sucursal actual", () => {
  const multi = { ...ctx, multisucursal: true, sucursalId: 5 };
  const minimoSucursal = new Map([[1, 4]]);
  // Producto.stockMinimo (total) es 2, pero en la sucursal es 4: 4 no es un cambio, 6 sí.
  const sinCambio = planDe(csv("Código de barras;Stock mínimo", `${bc(1)};4`), [producto(1)], multi, { minimoSucursal });
  assert.equal(sinCambio.sinCambios, 1);
  const cambio = planDe(csv("Código de barras;Stock mínimo", `${bc(1)};6`), [producto(1)], multi, { minimoSucursal });
  assert.equal(cambio.cambios[0].minimo, 6);
  assert.equal(cambio.cambios[0].cambios[0].anterior, "4");
  assert.equal(cambio.bloqueo, null);
});

test('stock mínimo: viendo "Todas" con varias sucursales no se puede cambiar', () => {
  const todas = { ...ctx, multisucursal: true, sucursalId: null };
  const plan = planDe(csv("Código de barras;Stock mínimo", `${bc(1)};9`), [producto(1)], todas);
  assert.match(plan.bloqueo ?? "", /Elegí una sucursal/);
});

// ---------------------------------------------------------------------------
// Transacción (contra un cliente falso)
// ---------------------------------------------------------------------------

type Fila = Record<string, unknown>;

async function conClienteFalso(productos: ProductoActual[], opciones: { desaparece?: number; minimos?: Fila[] } = {}) {
  // Evita que se cree un PrismaClient real al importar el módulo.
  (globalThis as unknown as { prisma: unknown }).prisma = {};
  const { aplicarActualizacion } = await import("@/lib/actualizar-productos");

  const escrito = { updates: [] as Fila[], upserts: [] as Fila[], historial: [] as Fila[] };
  const tx = {
    producto: {
      findMany: async () => productos,
      updateMany: async (a: Fila) => {
        const id = (a.where as Fila).id;
        if (id === opciones.desaparece) return { count: 0 };
        escrito.updates.push(a);
        return { count: 1 };
      },
    },
    marca: { findMany: async () => [{ id: 10, nombre: "Nike" }] },
    categoria: { findMany: async () => [{ id: 20, nombre: "Remeras" }] },
    stockSucursal: {
      findMany: async () => opciones.minimos ?? [],
      upsert: async (a: Fila) => {
        escrito.upserts.push(a);
        return {};
      },
      groupBy: async () => [{ productoId: 1, _sum: { stockMinimo: 11 } }],
    },
    historialPrecio: {
      createMany: async (a: { data: Fila[] }) => {
        escrito.historial.push(...a.data);
        return { count: a.data.length };
      },
    },
  };
  // Como la base real: si la función de la transacción lanza, lo escrito se descarta.
  const cliente = {
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      const antes = JSON.stringify(escrito);
      try {
        return await fn(tx);
      } catch (e) {
        const previo = JSON.parse(antes);
        escrito.updates = previo.updates;
        escrito.upserts = previo.upserts;
        escrito.historial = previo.historial;
        throw e;
      }
    },
  };
  const aplicar = (c: ContextoActualizacion, buffer: Buffer) => aplicarActualizacion(c, leerYValidarActualizacion(buffer), cliente as never);
  return { aplicar, escrito };
}

test("aplicar: actualiza los productos con empresaId y escribe el historial como la actualización masiva", async () => {
  const { aplicar, escrito } = await conClienteFalso([producto(1), producto(2)]);
  const r = await aplicar(ctx, csv("Código de barras;Costo;Precio minorista", `${bc(1)};1100;1600`, `${bc(2)};1000;1500`, "9990000000999;1;1"));

  assert.deepEqual(r, { actualizados: 1, cambiosDePrecio: 2, conError: 1 });
  assert.equal(escrito.updates.length, 1);
  assert.deepEqual(escrito.updates[0], { where: { id: 1, empresaId: 1 }, data: { precioCosto: 1100, precioVenta: 1600 } });
  assert.deepEqual(escrito.historial, [
    { productoId: 1, empresaId: 1, campo: "COSTO", valorAnterior: 1000, valorNuevo: 1100, origen: "ACTUALIZACION_MASIVA", detalle: "Actualización desde CSV" },
    { productoId: 1, empresaId: 1, campo: "MINORISTA", valorAnterior: 1500, valorNuevo: 1600, origen: "ACTUALIZACION_MASIVA", detalle: "Actualización desde CSV" },
  ]);
});

test("aplicar: el stock mínimo va a la sucursal y en Producto queda la suma de todas", async () => {
  const { aplicar, escrito } = await conClienteFalso([producto(1)]);
  await aplicar({ ...ctx, sucursalId: 5 }, csv("Código de barras;Stock mínimo", `${bc(1)};6`));
  assert.equal(escrito.upserts.length, 1);
  assert.deepEqual((escrito.upserts[0].where as Fila).productoId_sucursalId, { productoId: 1, sucursalId: 5 });
  assert.equal((escrito.updates[0].data as Fila).stockMinimo, 11); // la suma que devolvió groupBy
  assert.equal(escrito.historial.length, 0, "el stock mínimo no es un precio");
});

test("aplicar: si un producto desaparece a mitad, falla y no queda nada escrito", async () => {
  const { aplicar, escrito } = await conClienteFalso([producto(1), producto(2)], { desaparece: 2 });
  await assert.rejects(
    aplicar(ctx, csv("Código de barras;Precio minorista", `${bc(1)};1600`, `${bc(2)};1700`)),
    (e: unknown) => e instanceof ErrorArchivo && /ya no existe/.test(e.message)
  );
  assert.equal(escrito.updates.length, 0);
  assert.equal(escrito.historial.length, 0);
});

test("aplicar: sin cambios, o con la sucursal sin elegir, no escribe nada", async () => {
  const a = await conClienteFalso([producto(1)]);
  await assert.rejects(a.aplicar(ctx, csv("Código de barras;Precio minorista", `${bc(1)};1500`)), /No hay cambios/);
  assert.equal(a.escrito.updates.length, 0);

  const b = await conClienteFalso([producto(1)]);
  await assert.rejects(b.aplicar({ ...ctx, multisucursal: true, sucursalId: null }, csv("Código de barras;Stock mínimo", `${bc(1)};9`)), /Elegí una sucursal/);
  assert.equal(b.escrito.updates.length, 0);
});
