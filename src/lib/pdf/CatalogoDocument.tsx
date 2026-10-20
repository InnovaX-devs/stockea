import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { BusinessHeader } from "./BusinessHeader";
import { getPdfStyles } from "./styles";
import { formatCurrency } from "@/lib/currency";
import { getPdfBrand, type PdfBrand } from "./brand";
import { contenidoVisible } from "@/lib/rubro";
import type { Configuracion } from "@prisma/client";

type ProductoCatalogo = {
  id: number;
  nombre: string;
  fotoUrl: string | null;
  fotoDataUri: string | null;
  stockActual: number;
  precioVenta: number;
  precioMayorista: number | null;
  monedaPrecio: "ARS" | "USD";
  contenido: number | null;
  unidadContenido: string | null;
};

// Cantidad fija de cards por fila. Si en algún momento cambian el tamaño
// de las cards en los estilos, ajustar esto junto con el ancho/margen
// calculados en renderGrid.
const CARDS_POR_FILA = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const filas: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    filas.push(items.slice(i, i + size));
  }
  return filas;
}

function getCardStyles(brand: PdfBrand) {
  return StyleSheet.create({
    // Cada fila es un bloque explícito con wrap={false}: si no entra completa
    // en lo que queda de la página, se mueve entera a la siguiente. Esto
    // evita el bug de react-pdf donde flexWrap + wrap={false} por card deja
    // huecos en blanco cuando una card individual salta de página.
    row: { flexDirection: "row", justifyContent: "flex-start" },
    card: {
      marginBottom: 12,
      borderWidth: 0.5,
      borderColor: brand.border,
      borderRadius: 4,
      padding: 6,
      alignItems: "center",
    },
    cardSinStock: {
      marginBottom: 12,
      borderWidth: 0.5,
      borderColor: "#FCA5A5",
      backgroundColor: "#FEF2F2",
      borderRadius: 4,
      padding: 6,
      alignItems: "center",
    },
    imageBox: {
      width: "100%",
      height: 75,
      marginBottom: 5,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 3,
      overflow: "hidden",
    },
    imageBoxPlaceholder: {
      width: "100%",
      height: 75,
      marginBottom: 5,
      backgroundColor: brand.surfaceHover,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 3,
    },
    image: { width: "100%", height: 75, objectFit: "contain" },
    placeholderText: { fontSize: 6.5, color: brand.textDim },
    nombre: { fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 3 },
    nombreSinStock: {
      fontSize: 7.5,
      fontFamily: "Helvetica-Bold",
      textAlign: "center",
      marginBottom: 3,
      color: "#DC2626",
    },
    precioLinea: { fontSize: 7, textAlign: "center" },
    precioValor: { fontFamily: "Helvetica-Bold" },
    frasco: { fontSize: 6, color: brand.textDim, marginTop: 2 },
    sectionSeparator: {
      width: "100%",
      marginTop: 6,
      marginBottom: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: "#FCA5A5",
    },
    sectionLabel: { fontSize: 8.5, fontStyle: "italic", color: "#DC2626" },
  });
}

function convertir(valor: number, monedaOrigen: "ARS" | "USD", monedaDestino: "ARS" | "USD", cotizacionUSD: number) {
  if (monedaOrigen === monedaDestino) return valor;
  return monedaDestino === "ARS" ? valor * cotizacionUSD : valor / cotizacionUSD;
}

export function CatalogoDocument({
  productos,
  configuracion,
  tipoPrecio,
  moneda,
}: {
  productos: ProductoCatalogo[];
  configuracion: Configuracion;
  tipoPrecio: "MINORISTA" | "MAYORISTA" | "AMBOS";
  moneda: "ARS" | "USD";
}) {
  const titulo =
    tipoPrecio === "MINORISTA"
    ? "Catálogo de Productos"
    : tipoPrecio === "MAYORISTA"
    ? "Catálogo Mayorista"
    : "Catálogo (Minorista y Mayorista)";

  const brand = getPdfBrand(configuracion);
  const pdfStyles = getPdfStyles(brand);
  const cardStyles = getCardStyles(brand);

  const accent = brand.primary;

  const conStock = productos.filter((p) => p.stockActual > 0);
  const sinStock = productos.filter((p) => p.stockActual <= 0);

  function renderPrecios(p: ProductoCatalogo, colorAccent: string) {
    if (tipoPrecio === "AMBOS") {
      return (
        <>
          <Text style={cardStyles.precioLinea}>
            Min{" "}
            <Text style={[cardStyles.precioValor, { color: colorAccent }]}>
              {formatCurrency(convertir(p.precioVenta, p.monedaPrecio, moneda, configuracion.cotizacionUSD), moneda)}
            </Text>
          </Text>
          <Text style={cardStyles.precioLinea}>
            May{" "}
            <Text style={[cardStyles.precioValor, { color: colorAccent }]}>
              {p.precioMayorista !== null
                ? formatCurrency(convertir(p.precioMayorista, p.monedaPrecio, moneda, configuracion.cotizacionUSD), moneda)
                : "—"}
            </Text>
          </Text>
        </>
      );
    }

    return (
      <Text style={[cardStyles.precioLinea, cardStyles.precioValor, { color: colorAccent, fontSize: 9 }]}>
        {formatCurrency(
          convertir(
            tipoPrecio === "MINORISTA" ? p.precioVenta : (p.precioMayorista as number),
            p.monedaPrecio,
            moneda,
            configuracion.cotizacionUSD
          ),
          moneda
        )}
      </Text>
    );
  }

  function renderGrid(items: ProductoCatalogo[], sinStockFlag: boolean) {
    const filas = chunk(items, CARDS_POR_FILA);

    return filas.map((fila, filaIndex) => (
      <View key={filaIndex} style={cardStyles.row} wrap={false}>
        {fila.map((p, i) => {
          const esUltimaDeLaFila = i === fila.length - 1;
          const estiloPosicion = {
            width: "23.5%" as const,
            marginRight: esUltimaDeLaFila ? 0 : "2%",
          };
          return (
            <View
              key={p.id}
              style={[sinStockFlag ? cardStyles.cardSinStock : cardStyles.card, estiloPosicion]}
            >
              <View style={p.fotoDataUri ? cardStyles.imageBox : cardStyles.imageBoxPlaceholder}>
                {p.fotoDataUri ? (
                  <Image src={p.fotoDataUri} style={cardStyles.image} />
                ) : (
                  <Text style={cardStyles.placeholderText}>Sin foto</Text>
                )}
              </View>
              <Text style={sinStockFlag ? cardStyles.nombreSinStock : cardStyles.nombre}>
                {[p.nombre, contenidoVisible(configuracion.rubro, p.contenido, p.unidadContenido)].filter(Boolean).join(" · ")}
              </Text>
              {renderPrecios(p, sinStockFlag ? "#DC2626" : accent)}
            </View>
          );
        })}
      </View>
    ));
  }

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <BusinessHeader configuracion={configuracion} titulo={titulo} />

        {renderGrid(conStock, false)}

        {sinStock.length > 0 && (
          <>
            <View style={cardStyles.sectionSeparator}>
              <Text style={cardStyles.sectionLabel}>Sin stock actualmente — consultar disponibilidad</Text>
            </View>
            {renderGrid(sinStock, true)}
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