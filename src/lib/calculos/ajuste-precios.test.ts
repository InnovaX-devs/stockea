/**
 * Pruebas del ajuste de precios de Actualizar Precios: el cálculo y la actualización
 * masiva (src/lib/actualizar-precios-masivo.ts) con un cliente falso, sin base de datos.
 * Correr con:  npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularNuevoPrecio, leerValorAjuste } from "@/lib/calculos/ajuste-precios";
import { ErrorSolicitud, actualizarPreciosMasivo, type PayloadActualizarPrecios } from "@/lib/actualizar-precios-masivo";

test("porcentaje: sube, baja y redondea a 2 decimales", () => {
  assert.equal(calcularNuevoPrecio(1000, "PORCENTAJE", 10), 1100);
  assert.equal(calcularNuevoPrecio(1000, "PORCENTAJE", -5), 950);
  assert.equal(calcularNuevoPrecio(99.99, "PORCENTAJE", 7.5), 107.49);
});

test("valor fijo: suma o resta un monto", () => {
  assert.equal(calcularNuevoPrecio(1000, "VALOR_FIJO", 500), 1500);
  assert.equal(calcularNuevoPrecio(1000, "VALOR_FIJO", -200), 800);
});

test("nunca baja de 0 y sin precio actual no hay nada que ajustar", () => {
  assert.equal(calcularNuevoPrecio(100, "VALOR_FIJO", -500), 0);
  assert.equal(calcularNuevoPrecio(100, "PORCENTAJE", -150), 0);
  assert.equal(calcularNuevoPrecio(null, "PORCENTAJE", 10), null);
  assert.equal(calcularNuevoPrecio(undefined, "VALOR_FIJO", 10), null);
});

test("leerValorAjuste: acepta coma decimal, vacío es sin ajuste, lo demás es inválido", () => {
  assert.equal(leerValorAjuste("15"), 15);
  assert.equal(leerValorAjuste(" -10 "), -10);
  assert.equal(leerValorAjuste("7,5"), 7.5);
  assert.equal(leerValorAjuste("+3"), 3);
  assert.equal(leerValorAjuste(""), null);
  assert.equal(leerValorAjuste("   "), null);
  assert.equal(leerValorAjuste("0"), undefined);
  assert.equal(leerValorAjuste("abc"), undefined);
  assert.equal(leerValorAjuste("1,2,3"), undefined);
  assert.equal(leerValorAjuste("10%"), undefined);
});

// ---------------------------------------------------------------------------
// Actualización masiva (cliente falso)
// ---------------------------------------------------------------------------

type Fila = Record<string, unknown>;

const productos = [
  { id: 1, precioCosto: 1000, precioVenta: 2000, precioMayorista: 1500, precioOferta: null },
  { id: 2, precioCosto: 500, precioVenta: 1000, precioMayorista: null, precioOferta: 900 },
  { id: 3, precioCosto: 100, precioVenta: 200, precioMayorista: null, precioOferta: null },
];

function clienteFalso() {
  const escrito = { updates: [] as Fila[], historial: [] as Fila[], consultas: [] as Fila[] };
  const db = {
    producto: {
      findMany: async (a: { where: { id: { in: number[] }; empresaId: number; esPromocion?: boolean } }) => {
        escrito.consultas.push(a.where);
        return productos.filter((p) => a.where.id.in.includes(p.id));
      },
      update: (a: Fila) => {
        escrito.updates.push(a);
        return a;
      },
    },
    historialPrecio: {
      createMany: (a: { data: Fila[] }) => {
        escrito.historial.push(...a.data);
        return a;
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  return { db: db as never, escrito };
}

const aplicar = (body: unknown) => {
  const { db, escrito } = clienteFalso();
  return { escrito, resultado: actualizarPreciosMasivo(db, 1, body as PayloadActualizarPrecios) };
};

test("masivo: mismo ajuste para todos (comportamiento de siempre)", async () => {
  const { escrito, resultado } = aplicar({ productoIds: [1, 2], tipoAjuste: "PORCENTAJE", valor: 10, tiposPrecio: ["minorista"] });
  assert.deepEqual(await resultado, { cantidadAfectados: 2 });
  assert.deepEqual(escrito.updates.map((u) => (u.data as Fila).precioVenta), [2200, 1100]);
  assert.equal(escrito.historial.length, 2);
  assert.equal(escrito.consultas[0].empresaId, 1, "solo productos de la empresa");
  assert.equal(escrito.consultas[0].esPromocion, false, "las promociones no se ajustan desde acá");
});

test("masivo: un ajuste distinto por producto; los que no vienen no se tocan", async () => {
  const { escrito, resultado } = aplicar({
    ajustes: [
      { productoId: 1, valor: 10 },
      { productoId: 2, valor: -5 },
    ],
    tipoAjuste: "PORCENTAJE",
    tiposPrecio: ["minorista", "costo"],
  });
  assert.deepEqual(await resultado, { cantidadAfectados: 2 });
  const porProducto = new Map(escrito.updates.map((u) => [(u.where as Fila).id, u.data as Fila]));
  assert.deepEqual(porProducto.get(1), { precioVenta: 2200, precioCosto: 1100 });
  assert.deepEqual(porProducto.get(2), { precioVenta: 950, precioCosto: 475 });
  assert.equal(porProducto.has(3), false);
  assert.deepEqual(
    escrito.historial.map((h) => [h.productoId, h.campo, h.valorAnterior, h.valorNuevo, h.origen]),
    [
      [1, "MINORISTA", 2000, 2200, "ACTUALIZACION_MASIVA"],
      [1, "COSTO", 1000, 1100, "ACTUALIZACION_MASIVA"],
      [2, "MINORISTA", 1000, 950, "ACTUALIZACION_MASIVA"],
      [2, "COSTO", 500, 475, "ACTUALIZACION_MASIVA"],
    ]
  );
});

test("masivo: cada producto usa SU valor, también con monto fijo", async () => {
  const { escrito, resultado } = aplicar({
    ajustes: [
      { productoId: 1, valor: 500 },
      { productoId: 3, valor: -50 },
    ],
    tipoAjuste: "VALOR_FIJO",
    tiposPrecio: ["minorista"],
  });
  await resultado;
  assert.deepEqual(escrito.updates.map((u) => [(u.where as Fila).id, (u.data as Fila).precioVenta]), [[1, 2500], [3, 150]]);
});

test("masivo: la oferta se actualiza pero no entra al historial (no existe ese campo)", async () => {
  const { escrito, resultado } = aplicar({ ajustes: [{ productoId: 2, valor: 10 }], tipoAjuste: "PORCENTAJE", tiposPrecio: ["oferta"] });
  await resultado;
  assert.deepEqual(escrito.updates.map((u) => u.data), [{ precioOferta: 990 }]);
  assert.equal(escrito.historial.length, 0);
});

test("masivo: pedidos inválidos dan error 400 y no escriben nada", async () => {
  const invalidos: unknown[] = [
    { ajustes: [], tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] },
    { ajustes: [{ productoId: 1, valor: 0 }], tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] },
    { ajustes: [{ productoId: 1, valor: "x" }], tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] },
    { ajustes: [{ productoId: 1, valor: 5 }, { productoId: 1, valor: 6 }], tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] },
    { ajustes: [{ productoId: 1, valor: 5 }], tipoAjuste: "PORCENTAJE", tiposPrecio: [] },
    { ajustes: [{ productoId: 1, valor: 5 }], tipoAjuste: "OTRO", tiposPrecio: ["minorista"] },
    { productoIds: [1], tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] },
    { productoIds: [], valor: 5, tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] },
  ];
  for (const body of invalidos) {
    const { escrito, resultado } = aplicar(body);
    await assert.rejects(resultado, (e: unknown) => e instanceof ErrorSolicitud && e.status === 400, JSON.stringify(body));
    assert.equal(escrito.updates.length, 0);
    assert.equal(escrito.historial.length, 0);
  }
});

test("masivo: productos que no son de la empresa dan 404", async () => {
  const { resultado } = aplicar({ ajustes: [{ productoId: 99, valor: 5 }], tipoAjuste: "PORCENTAJE", tiposPrecio: ["minorista"] });
  await assert.rejects(resultado, (e: unknown) => e instanceof ErrorSolicitud && e.status === 404);
});
