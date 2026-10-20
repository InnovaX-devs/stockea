import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
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

// Sin decimales: el precio entra más grande en la etiqueta.
const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const FUENTES = {
  CHICA: { nombre: 11, detalle: 9, precio: 30, unidad: 10, fecha: 7, padding: 4 },
  MEDIANA: { nombre: 18, detalle: 13, precio: 50, unidad: 14, fecha: 9, padding: 8 },
} as const;

function estilos(tamano: TamanoEtiqueta) {
  const { columnas, filas } = GRILLA_ETIQUETAS[tamano];
  const f = FUENTES[tamano];
  return StyleSheet.create({
    page: { padding: MARGEN, flexDirection: "row", flexWrap: "wrap", fontFamily: "Helvetica", color: "#000" },
    celda: {
      width: Math.floor((A4_W - MARGEN * 2) / columnas),
      height: Math.floor((A4_H - MARGEN * 2) / filas),
      padding: f.padding,
      justifyContent: "space-between",
    },
    celdaConBorde: { borderWidth: 0.5, borderStyle: "dashed", borderColor: "#000" },
    nombre: { fontSize: f.nombre, fontFamily: "Helvetica-Bold", maxLines: 2, textOverflow: "ellipsis" },
    detalle: { fontSize: f.detalle, marginTop: 1 },
    precio: { fontSize: f.precio, fontFamily: "Helvetica-Bold", textAlign: "center" },
    pie: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    unidad: { fontSize: f.unidad, fontFamily: "Helvetica-Bold" },
    fecha: { fontSize: f.fecha },
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
                <Text style={s.precio}>{pesos.format(it.precioArs)}</Text>
                <View style={s.pie}>
                  <Text style={s.unidad}>
                    {it.porUnidad ? `${pesos.format(it.porUnidad.precio)} por ${it.porUnidad.base}` : ""}
                  </Text>
                  <Text style={s.fecha}>{it.fecha}</Text>
                </View>
                {it.codigoBarras ? <Text style={s.fecha}>{it.codigoBarras}</Text> : null}
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}