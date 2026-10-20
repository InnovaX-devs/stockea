import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { BusinessHeader } from "./BusinessHeader";
import { getPdfStyles } from "./styles";
import { formatCurrency } from "@/lib/currency";
import { getPdfBrand, type PdfBrand } from "./brand";
import { contenidoVisible } from "@/lib/rubro";
import type { Configuracion } from "@prisma/client";

type ProductoLista = {
  id: number;
  nombre: string;
  stockActual: number;
  precioVenta: number;
  precioMayorista: number | null;
  monedaPrecio: "ARS" | "USD";
  contenido: number | null;
  unidadContenido: string | null;
};

function getListStyles(brand: PdfBrand) {
  return StyleSheet.create({
  sectionSeparator: {
    marginTop: 18,
    marginBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: brand.border,
  },
  sectionLabel: { fontSize: 9.5, fontStyle: "italic", color: brand.textDim },
  row: { flexDirection: "row", marginBottom: 8 },
  cell: { width: "50%", flexDirection: "row", justifyContent: "space-between", paddingRight: 16 },
  nombre: { fontSize: 10, flexShrink: 1, paddingRight: 8 },
  precio: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  nombreSinStock: { fontSize: 10, flexShrink: 1, paddingRight: 8, color: "#DC2626" },
  precioSinStock: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#DC2626",
    textDecoration: "line-through",
  },
  });
}

function convertir(valor: number, monedaOrigen: "ARS" | "USD", monedaDestino: "ARS" | "USD", cotizacionUSD: number) {
  if (monedaOrigen === monedaDestino) return valor;
  return monedaDestino === "ARS" ? valor * cotizacionUSD : valor / cotizacionUSD;
}

function chunkEnPares<T>(items: T[]): [T, T | null][] {
  const pares: [T, T | null][] = [];
  for (let i = 0; i < items.length; i += 2) {
    pares.push([items[i], items[i + 1] ?? null]);
  }
  return pares;
}

export function ListaPreciosDocument({
  productos,
  configuracion,
  tipoPrecio,
  moneda,
}: {
  productos: ProductoLista[];
  configuracion: Configuracion;
  tipoPrecio: "MINORISTA" | "MAYORISTA" | "AMBOS";
  moneda: "ARS" | "USD";
}) {
  const titulo =
    tipoPrecio === "MINORISTA"
    ? "Lista de Precios"
    : tipoPrecio === "MAYORISTA"
    ? "Lista de Precios Mayorista"
    : "Lista de Precios (Minorista y Mayorista)";

  const brand = getPdfBrand(configuracion);
  const pdfStyles = getPdfStyles(brand);
  const listStyles = getListStyles(brand);

  function precioTexto(p: ProductoLista): string {
    if (tipoPrecio === "AMBOS") {
      const min = formatCurrency(convertir(p.precioVenta, p.monedaPrecio, moneda, configuracion.cotizacionUSD), moneda);
      const may =
        p.precioMayorista !== null
          ? formatCurrency(convertir(p.precioMayorista, p.monedaPrecio, moneda, configuracion.cotizacionUSD), moneda)
          : "—";
      return `Min ${min} · May ${may}`;
    }
    const valor = tipoPrecio === "MINORISTA" ? p.precioVenta : (p.precioMayorista as number);
    return formatCurrency(convertir(valor, p.monedaPrecio, moneda, configuracion.cotizacionUSD), moneda);
  }

  const conStock = productos.filter((p) => p.stockActual > 0);
  const sinStock = productos.filter((p) => p.stockActual <= 0);

  /** "Yerba · 500 g": el contenido solo se muestra si el rubro lo usa. */
  function nombreConContenido(p: ProductoLista) {
    return [p.nombre, contenidoVisible(configuracion.rubro, p.contenido, p.unidadContenido)].filter(Boolean).join(" · ");
  }

  function renderGrupo(items: ProductoLista[], sinStock: boolean = false) {
    return chunkEnPares(items).map(([a, b], i) => (
      <View key={i} style={listStyles.row}>
        <View style={listStyles.cell}>
          <Text style={sinStock ? listStyles.nombreSinStock : listStyles.nombre}>{nombreConContenido(a)}</Text>
          <Text style={sinStock ? listStyles.precioSinStock : [listStyles.precio, { color: brand.primary }]}>
            {precioTexto(a)}
          </Text>
        </View>
        <View style={listStyles.cell}>
          {b && (
            <>
              <Text style={sinStock ? listStyles.nombreSinStock : listStyles.nombre}>{nombreConContenido(b)}</Text>
              <Text style={sinStock ? listStyles.precioSinStock : [listStyles.precio, { color: brand.primary }]}>
                {precioTexto(b)}
              </Text>
            </>
          )}
        </View>
      </View>
    ));
  }

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <BusinessHeader configuracion={configuracion} titulo={titulo} />

        {renderGrupo(conStock)}

        {sinStock.length > 0 && (
          <>
            <View style={listStyles.sectionSeparator}>
              <Text style={listStyles.sectionLabel}>Sin stock actualmente — consultar disponibilidad</Text>
            </View>
            {renderGrupo(sinStock, true)}
          </>
        )}

        <Text
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}