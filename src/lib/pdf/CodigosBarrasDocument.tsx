import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Etiquetas con código de barras (issue #106).
 * - A4: hoja de 3 × 8 etiquetas de 63,5 × 33,9 mm (medida de las hojas de
 *   etiquetas autoadhesivas comunes), con líneas de corte suaves por si se
 *   imprime en papel común.
 * - ROLLO: una etiqueta de 50 × 25 mm por página, para impresoras térmicas de
 *   etiquetas (se imprime una por una desde el PDF).
 */

export type FormatoEtiqueta = "A4" | "ROLLO";

export type EtiquetaCodigo = {
  nombre: string;
  codigo: string;
  /** PNG del código (data URL), uno por código distinto. */
  imagen: string;
  /** Precio ya formateado ("$ 1.234") o null si no se imprime. */
  precio: string | null;
};

const MM = 72 / 25.4;
const A4 = { ancho: 595.28, alto: 841.89, columnas: 3, filas: 8, celdaAncho: 63.5 * MM, celdaAlto: 33.9 * MM };
const ROLLO = { ancho: 50 * MM, alto: 25 * MM };

const s = StyleSheet.create({
  paginaA4: {
    paddingHorizontal: (A4.ancho - A4.columnas * A4.celdaAncho) / 2,
    paddingVertical: (A4.alto - A4.filas * A4.celdaAlto) / 2,
    flexDirection: "row",
    flexWrap: "wrap",
    fontFamily: "Helvetica",
    color: "#000",
  },
  celdaA4: {
    width: A4.celdaAncho,
    height: A4.celdaAlto,
    paddingVertical: 2.5 * MM,
    paddingHorizontal: 3 * MM,
    borderWidth: 0.3,
    borderStyle: "dashed",
    borderColor: "#BBBBBB",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paginaRollo: {
    padding: 1.5 * MM,
    fontFamily: "Helvetica",
    color: "#000",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nombreA4: { fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "center", maxLines: 2, textOverflow: "ellipsis", width: "100%" },
  nombreRollo: { fontSize: 6, fontFamily: "Helvetica-Bold", textAlign: "center", maxLines: 1, textOverflow: "ellipsis", width: "100%" },
  precioA4: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
  precioRollo: { fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
});

function Contenido({ e, formato }: { e: EtiquetaCodigo; formato: FormatoEtiqueta }) {
  const a4 = formato === "A4";
  // Alto del código: lo que queda después del nombre y el precio.
  const altoCodigo = a4 ? (e.precio ? 15 : 19) * MM : (e.precio ? 11 : 14) * MM;
  return (
    <>
      <Text style={a4 ? s.nombreA4 : s.nombreRollo}>{e.nombre}</Text>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no lleva alt */}
      <Image src={e.imagen} style={{ height: altoCodigo, objectFit: "contain", maxWidth: "100%" }} />
      {e.precio ? <Text style={a4 ? s.precioA4 : s.precioRollo}>{e.precio}</Text> : null}
    </>
  );
}

export function CodigosBarrasDocument({ etiquetas, formato }: { etiquetas: EtiquetaCodigo[]; formato: FormatoEtiqueta }) {
  if (formato === "ROLLO") {
    return (
      <Document title="Etiquetas con código de barras">
        {etiquetas.map((e, i) => (
          <Page key={i} size={[ROLLO.ancho, ROLLO.alto]} style={s.paginaRollo}>
            <Contenido e={e} formato="ROLLO" />
          </Page>
        ))}
      </Document>
    );
  }
  const porHoja = A4.columnas * A4.filas;
  const hojas: EtiquetaCodigo[][] = [];
  for (let i = 0; i < etiquetas.length; i += porHoja) hojas.push(etiquetas.slice(i, i + porHoja));
  return (
    <Document title="Etiquetas con código de barras">
      {hojas.map((hoja, h) => (
        <Page key={h} size="A4" style={s.paginaA4}>
          {hoja.map((e, i) => (
            <View key={i} style={s.celdaA4} wrap={false}>
              <Contenido e={e} formato="A4" />
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
