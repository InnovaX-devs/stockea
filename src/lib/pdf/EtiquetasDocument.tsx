import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/currency";
import { GRILLA_ETIQUETAS, paginarEtiquetas, type TamanoEtiqueta } from "@/lib/etiquetas";

export type EtiquetaItem = {
  id: number;
  nombre: string;
  marca: string | null;
  contenido: string | null; // ya formateado: "500 g", "1,5 l"
  precioArs: number;
  porUnidad: { precio: number; base: "kg" | "l" } | null;
  fecha: string; // ya formateada dd/mm/aaaa
  codigoBarras: string | null;
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGEN = 20;

const FUENTES = {
  CHICA: { nombre: 8, detalle: 7, precio: 24, pie: 7 },
  MEDIANA: { nombre: 12, detalle: 9, precio: 42, pie: 9 },
} as const;

function estilos(tamano: TamanoEtiqueta) {
  const { columnas, filas } = GRILLA_ETIQUETAS[tamano];
  const f = FUENTES[tamano];
  return StyleSheet.create({
    page: { padding: MARGEN, flexDirection: "row", flexWrap: "wrap", fontFamily: "Helvetica", color: "#000" },
    celda: {
      width: Math.floor((A4_W - MARGEN * 2) / columnas),
      height: Math.floor((A4_H - MARGEN * 2) / filas),
      padding: 6,
      justifyContent: "space-between",
    },
    celdaConBorde: { borderWidth: 0.5, borderStyle: "dashed", borderColor: "#000" },
    nombre: { fontSize: f.nombre, fontFamily: "Helvetica-Bold", maxLines: 2, textOverflow: "ellipsis" },
    detalle: { fontSize: f.detalle, marginTop: 1 },
    precio: { fontSize: f.precio, fontFamily: "Helvetica-Bold", textAlign: "center" },
    pie: { flexDirection: "row", justifyContent: "space-between", fontSize: f.pie },
    pieBold: { fontFamily: "Helvetica-Bold" },
  });
}

export function EtiquetasDocument({ items, tamano }: { items: EtiquetaItem[]; tamano: TamanoEtiqueta }) {
  const s = estilos(tamano);
  const hojas = paginarEtiquetas(items, tamano);
  const { columnas, filas } = GRILLA_ETIQUETAS[tamano];
  const porHoja = columnas * filas;

  return (
    <Document title="Etiquetas de góndola">
      {hojas.map((hoja, h) => (
        <Page key={h} size="A4" style={s.page}>
          {Array.from({ length: porHoja }).map((_, i) => {
            const it = hoja[i];
            if (!it) return <View key={i} style={s.celda} />; // mantiene la grilla alineada
            const detalle = [it.marca, it.contenido].filter(Boolean).join(" · ");
            return (
              <View key={i} style={[s.celda, s.celdaConBorde]} wrap={false}>
                <View>
                  <Text style={s.nombre}>{it.nombre}</Text>
                  {detalle ? <Text style={s.detalle}>{detalle}</Text> : null}
                </View>
                <Text style={s.precio}>{formatCurrency(it.precioArs, "ARS")}</Text>
                <View style={s.pie}>
                  <Text style={s.pieBold}>
                    {it.porUnidad ? `${formatCurrency(it.porUnidad.precio, "ARS")} por ${it.porUnidad.base}` : ""}
                  </Text>
                  <Text>{it.fecha}</Text>
                </View>
                {it.codigoBarras ? <Text style={s.detalle}>{it.codigoBarras}</Text> : null}
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}