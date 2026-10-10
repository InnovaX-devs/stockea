import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { BusinessHeader } from "./BusinessHeader";
import { getPdfStyles } from "./styles";
import { getPdfBrand, type PdfBrand } from "./brand";
import { formatCurrency } from "@/lib/currency";
import type { Configuracion, TipoCuenta } from "@prisma/client";
import type { ReporteData } from "@/types/reporte";

const LABEL_TIPO_CUENTA: Record<TipoCuenta, string> = {
  EFECTIVO_ARS: "Efectivo ARS",
  EFECTIVO_USD: "Efectivo USD",
  BANCO_ARS: "Transferencia ARS",
  BANCO_USD: "Transferencia USD",
};

const LABEL_TIPO_PRECIO: Record<"MINORISTA" | "MAYORISTA", string> = {
  MINORISTA: "Minorista",
  MAYORISTA: "Mayorista",
};

function getStyles(brand: PdfBrand) {
  return StyleSheet.create({
  rangoTexto: { fontSize: 9, color: brand.textDim, marginBottom: 16 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 18 },
  kpiCard: {
    width: "31.3%",
    marginRight: "2%",
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: brand.border,
    borderRadius: 4,
    padding: 8,
  },
  kpiCardDestacado: {
    width: "31.3%",
    marginRight: "2%",
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: brand.primary,
    backgroundColor: "#EEF2FF",
    borderRadius: 4,
    padding: 8,
  },
  kpiLabel: { fontSize: 7, color: brand.textDim, marginBottom: 4, letterSpacing: 0.3 },
  kpiValor: { fontSize: 13, fontFamily: "Helvetica-Bold", color: brand.text },
  kpiSub: { fontSize: 6.5, color: brand.textDim, marginTop: 3 },

  seccionTitulo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: brand.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  tablaHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    paddingBottom: 4,
    marginBottom: 4,
  },
  tablaHeaderText: { fontSize: 7.5, color: brand.textDim },
  fila: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: brand.surfaceHover,
    alignItems: "center",
  },
  colPrincipal: { width: "40%", fontSize: 9 },
  colCant: { width: "25%", textAlign: "right", fontSize: 9 },
  colPorc: { width: "15%", textAlign: "right", fontSize: 8, color: brand.textDim },
  colTotal: { width: "20%", textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold" },

  vacioTexto: { fontSize: 8.5, color: brand.textDim, fontStyle: "italic", paddingVertical: 6 },

  // --- Ingresos por día ---
  barraFila: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  barraFecha: { width: "18%", fontSize: 7.5, color: brand.textDim },
  barraTrack: { flex: 1, height: 6, backgroundColor: brand.surfaceHover, borderRadius: 3, marginRight: 6 },
  barraFill: { height: 6, backgroundColor: brand.primary, borderRadius: 3 },
  barraValor: { width: "22%", fontSize: 7.5, textAlign: "right", color: brand.text },

  // --- Top productos ---
  topFila: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: brand.surfaceHover,
    alignItems: "center",
  },
  topRank: { width: "6%", fontSize: 8, color: brand.textDim },
  topNombreWrap: { flexDirection: "row", alignItems: "center", width: "49%" },
  topImagenBox: {
    width: 26,
    height: 26,
    marginRight: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: brand.surfaceHover,
    alignItems: "center",
    justifyContent: "center",
  },
  topImagen: { width: 26, height: 26, objectFit: "contain" },
  topPlaceholderText: { fontSize: 5, color: brand.textDim, textAlign: "center" },
  topNombreCol: { flex: 1 },
  topCant: { width: "20%", textAlign: "right", fontSize: 9 },
  topMonto: { width: "25%", textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold" },
  });
}

export function ReporteDocument({
  reporte,
  configuracion,
  titulo = "Reporte de Ventas",
  rangoTexto: rangoTextoProp,
}: {
  reporte: ReporteData;
  configuracion: Configuracion;
  titulo?: string;
  /** Texto del rango ya armado (con hora si se eligió). */
  rangoTexto?: string;
}) {
  const { kpis, desgloseTipoPrecio, desgloseMetodoCobro, ingresosPorDia, topProductos } = reporte;

  const brand = getPdfBrand(configuracion);
  const pdfStyles = getPdfStyles(brand);
  const s = getStyles(brand);

  // reporte.fechaFin es el límite exclusivo del rango (medianoche del día siguiente),
  // igual que rango.hasta en la página web, así que restamos 1ms para mostrar
  // el último día realmente incluido (mismo criterio que hastaVisible en page.tsx).
  const fechaFinVisible = new Date(new Date(reporte.fechaFin).getTime() - 1);

  const rangoTexto =
    rangoTextoProp ??
    `${new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(
      new Date(reporte.fechaInicio)
    )} — ${new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(fechaFinVisible)}`;

  const kpiItems: { label: string; valor: string; sub?: string; destacado?: boolean }[] = [
    {
      label: "Ingresos (cobrado)",
      valor: formatCurrency(kpis.ingresosARS, "ARS"),
      sub:
        kpis.ingresosFacturadosARS > kpis.ingresosARS
          ? `${formatCurrency(kpis.ingresosFacturadosARS - kpis.ingresosARS, "ARS")} pendiente de cobro`
          : undefined,
    },
    {
      label: "Ganancia neta",
      valor: formatCurrency(kpis.gananciaNetaARS, "ARS"),
      sub: `${kpis.margenPorcentaje.toFixed(1)}% margen`,
      destacado: true,
    },
    { label: "Egresos (gastos)", valor: formatCurrency(kpis.egresosARS, "ARS") },
    { label: "Costo de venta", valor: formatCurrency(kpis.costoVentaARS, "ARS") },
    { label: "Cantidad de ventas", valor: kpis.cantidadVentas.toString() },
    { label: "Ítems vendidos", valor: kpis.itemsVendidos.toString() },
  ];

  const maximoIngresoDia = Math.max(...ingresosPorDia.map((d) => d.ingresosARS), 1);

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <BusinessHeader configuracion={configuracion} titulo={titulo} />

        <Text style={s.rangoTexto}>{rangoTexto}</Text>

        <View style={s.kpiGrid}>
          {kpiItems.map((kpi, i) => (
            <View key={i} style={kpi.destacado ? s.kpiCardDestacado : s.kpiCard}>
              <Text style={s.kpiLabel}>{kpi.label.toUpperCase()}</Text>
              <Text style={[s.kpiValor, kpi.destacado ? { color: brand.primary } : {}]}>{kpi.valor}</Text>
              {kpi.sub && <Text style={s.kpiSub}>{kpi.sub}</Text>}
            </View>
          ))}
        </View>

        <Text style={s.seccionTitulo}>Minorista vs Mayorista</Text>
        <View style={s.tablaHeader}>
          <Text style={[s.tablaHeaderText, { width: "40%" }]}>TIPO</Text>
          <Text style={[s.tablaHeaderText, { width: "25%", textAlign: "right" }]}>VENTAS</Text>
          <Text style={[s.tablaHeaderText, { width: "15%", textAlign: "right" }]}>%</Text>
          <Text style={[s.tablaHeaderText, { width: "20%", textAlign: "right" }]}>TOTAL</Text>
        </View>
        {desgloseTipoPrecio.every((item) => item.cantidadVentas === 0) ? (
          <Text style={s.vacioTexto}>Sin ventas registradas en el período.</Text>
        ) : (
          desgloseTipoPrecio.map((item, i) => (
            <View key={i} style={s.fila}>
              <Text style={s.colPrincipal}>{LABEL_TIPO_PRECIO[item.tipoPrecio]}</Text>
              <Text style={s.colCant}>{item.cantidadVentas}</Text>
              <Text style={s.colPorc}>{item.porcentaje.toFixed(1)}%</Text>
              <Text style={[s.colTotal, { color: brand.primary }]}>{formatCurrency(item.montoARS, "ARS")}</Text>
            </View>
          ))
        )}

        <Text style={s.seccionTitulo}>Método de cobro</Text>
        {desgloseMetodoCobro.length === 0 ? (
          <Text style={s.vacioTexto}>Sin cobros registrados en el período.</Text>
        ) : (
          <>
            <View style={s.tablaHeader}>
              <Text style={[s.tablaHeaderText, { width: "40%" }]}>CUENTA</Text>
              <Text style={[s.tablaHeaderText, { width: "25%", textAlign: "right" }]}>VENTAS</Text>
              <Text style={[s.tablaHeaderText, { width: "15%", textAlign: "right" }]}>%</Text>
              <Text style={[s.tablaHeaderText, { width: "20%", textAlign: "right" }]}>TOTAL</Text>
            </View>
            {desgloseMetodoCobro.map((item) => (
              <View key={item.cuentaId} style={s.fila}>
                <View style={s.colPrincipal}>
                  <Text style={{ fontSize: 9 }}>{item.cuentaNombre}</Text>
                  <Text style={{ fontSize: 6.5, color: brand.textDim, marginTop: 1 }}>
                    {LABEL_TIPO_CUENTA[item.tipoCuenta]}
                  </Text>
                </View>
                <Text style={s.colCant}>{item.cantidadVentas}</Text>
                <Text style={s.colPorc}>{item.porcentaje.toFixed(1)}%</Text>
                <Text style={[s.colTotal, { color: brand.primary }]}>
                  {formatCurrency(item.montoARS, "ARS")}
                </Text>
              </View>
            ))}
          </>
        )}

        {ingresosPorDia.length > 0 && (
          <>
            <Text style={s.seccionTitulo}>Ingresos por día</Text>
            {ingresosPorDia.map((d) => {
              const pct = Math.max((d.ingresosARS / maximoIngresoDia) * 100, d.ingresosARS > 0 ? 2 : 0);
              // "T00:00:00" evita el mismo corrimiento UTC que arreglamos en rangoParaTab
              const fechaLabel = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" }).format(
                new Date(`${d.fecha}T00:00:00`)
              );
              return (
                <View key={d.fecha} style={s.barraFila}>
                  <Text style={s.barraFecha}>{fechaLabel}</Text>
                  <View style={s.barraTrack}>
                    <View style={[s.barraFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={s.barraValor}>{formatCurrency(d.ingresosARS, "ARS")}</Text>
                </View>
              );
            })}
          </>
        )}

        <View wrap={false}>
          <Text style={s.seccionTitulo}>Top productos</Text>
          {topProductos.length === 0 && (
            <Text style={s.vacioTexto}>Sin ventas de catálogo en el período.</Text>
          )}
          {topProductos.length > 0 &&
            topProductos.slice(0, 1).map((p, i) => (
              <View key={p.productoId} style={s.topFila} wrap={false}>
                <Text style={s.topRank}>{i + 1}</Text>
                <View style={s.topNombreWrap}>
                  <View style={s.topImagenBox}>
                    {p.fotoUrl ? (
                      <Image src={p.fotoUrl} style={s.topImagen} />
                    ) : (
                      <Text style={s.topPlaceholderText}>Sin foto</Text>
                    )}
                  </View>
                  <View style={s.topNombreCol}>
                    <Text style={{ fontSize: 9 }}>{p.nombre}</Text>
                  </View>
                </View>
                <Text style={s.topCant}>{p.cantidad}</Text>
                <Text style={[s.topMonto, { color: brand.primary }]}>{formatCurrency(p.montoARS, "ARS")}</Text>
              </View>
            ))}
        </View>
        {topProductos.slice(1).map((p, i) => (
          <View key={p.productoId} style={s.topFila} wrap={false}>
            <Text style={s.topRank}>{i + 2}</Text>
            <View style={s.topNombreWrap}>
              <View style={s.topImagenBox}>
                {p.fotoUrl ? (
                  <Image src={p.fotoUrl} style={s.topImagen} />
                ) : (
                  <Text style={s.topPlaceholderText}>Sin foto</Text>
                )}
              </View>
              <View style={s.topNombreCol}>
                <Text style={{ fontSize: 9 }}>{p.nombre}</Text>
              </View>
            </View>
            <Text style={s.topCant}>{p.cantidad}</Text>
            <Text style={[s.topMonto, { color: brand.primary }]}>{formatCurrency(p.montoARS, "ARS")}</Text>
          </View>
        ))}

        <Text
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}