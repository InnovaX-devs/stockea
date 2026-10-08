import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer";
import { getPdfBrand, type PdfBrand } from "./brand";
import { formatCurrency } from "@/lib/currency";
import type { Configuracion, EstadoPago, TipoCuenta } from "@prisma/client";

function formatCurrencyConCentavos(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export type ComprobanteItem = {
  nombre: string;
  tipoPrecio: "MINORISTA" | "MAYORISTA";
  cantidad: number;
  precioUnitarioARS: number;
};

export type ComprobantePago = {
  monto: number;
  tipoCuenta: TipoCuenta;
};

export type ComprobanteVentaData = {
  id: number;
  /** Número visible de la venta en la empresa. */
  numero: number | null;
  fecha: Date;
  clienteNombre: string | null;
  items: ComprobanteItem[];
  totalARS: number;
  montoPagado: number;
  estadoPago: EstadoPago;
  pagos: ComprobantePago[];
  /** Si la venta tiene factura electrónica autorizada por ARCA. */
  fiscal?: DatosFiscalesComprobante | null;
};

export type DatosFiscalesComprobante = {
  letra: string; // A, B o C
  codigo: number; // código ARCA (1, 6, 11)
  numero: string; // 00001-00000012
  cae: string;
  caeVencimiento: Date;
  qrDataUrl: string;
  enPrueba: boolean;
  emisor: { razonSocial: string; cuit: string; condicion: string; domicilio: string; ingresosBrutos: string | null; inicioActividades: Date | null };
  receptor: { nombre: string; documento: string; condicion: string };
  neto: number;
  iva: number;
};

function getStyles(brand: PdfBrand) {
  return StyleSheet.create({
    page: {
      paddingHorizontal: 32,
      paddingVertical: 0,
      fontSize: 9,
      fontFamily: "Helvetica",
      color: brand.text,
    },
    header: {
      marginHorizontal: -32,
      marginBottom: 20,
      paddingHorizontal: 32,
      paddingVertical: 20,
      backgroundColor: brand.text,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    businessName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
    businessDetail: { fontSize: 8, color: "#C6CAD3", marginTop: 3 },
    docTitle: { fontSize: 9, color: brand.primarySoft, textAlign: "right", letterSpacing: 0.5 },
    docNumero: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#FFFFFF", textAlign: "right", marginTop: 2 },
    docAviso: { fontSize: 7, color: "#8B93A3", textAlign: "right", marginTop: 3 },

    infoRow: { flexDirection: "row", marginBottom: 18 },
    infoBlock: { flex: 1 },
    infoLabel: { fontSize: 7.5, color: brand.textDim, letterSpacing: 0.5, marginBottom: 2 },
    infoValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: brand.text },

    tablaHeader: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: brand.border,
      paddingBottom: 6,
      marginBottom: 4,
    },
    tablaHeaderText: { fontSize: 7.5, color: brand.textDim, letterSpacing: 0.3 },
    fila: {
      flexDirection: "row",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: brand.surfaceHover,
      alignItems: "center",
    },
    colProducto: { width: "46%" },
    colCant: { width: "14%", textAlign: "center" },
    colUnit: { width: "20%", textAlign: "right" },
    colSubtotal: { width: "20%", textAlign: "right" },
    nombreProducto: { fontSize: 9 },
    pill: {
      fontSize: 6.5,
      fontFamily: "Helvetica-Bold",
      color: brand.primary,
      backgroundColor: brand.surfaceHover,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      marginLeft: 5,
    },
    presentacionTexto: { fontSize: 7.5, color: brand.textDim, marginTop: 1 },

    totalBar: {
      marginTop: 14,
      backgroundColor: brand.text,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },
    totalValor: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#FFFFFF" },

    pagoBox: {
      marginTop: 14,
      borderRadius: 4,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    pagoBoxOk: { backgroundColor: "#DCFCE7" },
    pagoBoxParcial: { backgroundColor: "#FEF3C7" },
    pagoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    pagoLabel: { fontSize: 8.5, color: brand.textDim },
    pagoMetodo: { fontSize: 9, fontFamily: "Helvetica-Bold", color: brand.text },
    pagoEstado: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 8 },
    pagoEstadoOk: { color: "#15803D" },
    pagoEstadoParcial: { color: "#B45309" },

    fiscalBox: { marginTop: 14, borderWidth: 1, borderColor: brand.border ?? "#d4d4d8", borderRadius: 6, padding: 10, flexDirection: "row", gap: 12 },
    fiscalCol: { flex: 1 },
    fiscalTitulo: { fontSize: 8, fontFamily: "Helvetica-Bold", color: brand.textDim, marginBottom: 3, textTransform: "uppercase" },
    fiscalTexto: { fontSize: 8, color: brand.text, marginBottom: 1.5 },
    caeBox: { width: 150, alignItems: "center" },
    qr: { width: 82, height: 82, marginBottom: 4 },
    caeTexto: { fontSize: 8, fontFamily: "Helvetica-Bold", color: brand.text },
    caeSub: { fontSize: 7, color: brand.textDim },
    prueba: { marginTop: 10, padding: 6, backgroundColor: "#fef3c7", color: "#92400e", fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center", borderRadius: 4 },
    footer: { marginTop: 30, textAlign: "center" },
    footerGracias: { fontSize: 9, fontFamily: "Helvetica-Bold", color: brand.text },
    footerNota: { fontSize: 7, color: brand.textDim, marginTop: 3 },
  });
}

const LABEL_TIPO_CUENTA: Record<TipoCuenta, string> = {
  EFECTIVO_ARS: "Efectivo",
  EFECTIVO_USD: "Efectivo",
  BANCO_ARS: "Transferencia",
  BANCO_USD: "Transferencia",
};

export function ComprobanteVentaDocument({
  venta,
  configuracion,
}: {
  venta: ComprobanteVentaData;
  configuracion: Configuracion;
}) {
  const numero = String(venta.numero ?? venta.id).padStart(6, "0");
  const s = getStyles(getPdfBrand(configuracion));

  const detalleNegocio = [configuracion.instagram || null, configuracion.telefono]
    .filter(Boolean)
    .join("  ·  ");

  const metodosUnicos = Array.from(new Set(venta.pagos.map((p) => LABEL_TIPO_CUENTA[p.tipoCuenta])));
  const metodoTexto = metodosUnicos.length > 0 ? metodosUnicos.join(" + ") : "—";

  const esPagoCompleto = venta.estadoPago === "PAGADA";
  const saldoPendiente = Math.max(0, Math.round(venta.totalARS - venta.montoPagado));

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.businessName}>{configuracion.nombreNegocio}</Text>
            {detalleNegocio && <Text style={s.businessDetail}>{detalleNegocio}</Text>}
          </View>
          <View>
            {venta.fiscal ? (
              <>
                <Text style={s.docTitle}>FACTURA {venta.fiscal.letra}</Text>
                <Text style={s.docNumero}>N° {venta.fiscal.numero}</Text>
                <Text style={s.docAviso}>Cód. {String(venta.fiscal.codigo).padStart(2, "0")}</Text>
              </>
            ) : (
              <>
                <Text style={s.docTitle}>COMPROBANTE DE VENTA</Text>
                <Text style={s.docNumero}>N° {numero}</Text>
                <Text style={s.docAviso}>No válido como factura</Text>
              </>
            )}
          </View>
        </View>

        <View style={s.infoRow}>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>FECHA</Text>
            <Text style={s.infoValue}>
              {new Intl.DateTimeFormat("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Argentina/Buenos_Aires",
              }).format(venta.fecha)}
            </Text>
          </View>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>CLIENTE</Text>
            <Text style={s.infoValue}>{venta.clienteNombre ?? "Sin cliente"}</Text>
          </View>
        </View>

        <View style={s.tablaHeader}>
          <Text style={[s.tablaHeaderText, s.colProducto]}>PRODUCTO</Text>
          <Text style={[s.tablaHeaderText, s.colCant]}>CANT.</Text>
          <Text style={[s.tablaHeaderText, s.colUnit]}>P. UNIT.</Text>
          <Text style={[s.tablaHeaderText, s.colSubtotal]}>SUBTOTAL</Text>
        </View>

        {venta.items.map((item, i) => {
          return (
            <View key={i} style={s.fila}>
              <View style={s.colProducto}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={s.nombreProducto}>{item.nombre}</Text>
                  <Text style={s.pill}>{item.tipoPrecio === "MAYORISTA" ? "MAY" : "MIN"}</Text>
                </View>
              </View>
              <Text style={[s.colCant, s.nombreProducto]}>{item.cantidad}</Text>
              <Text style={[s.colUnit, s.nombreProducto]}>{formatCurrencyConCentavos(item.precioUnitarioARS)}</Text>
              <Text style={[s.colSubtotal, s.nombreProducto, { fontFamily: "Helvetica-Bold" }]}>
                {formatCurrencyConCentavos(item.precioUnitarioARS * item.cantidad)}
              </Text>
            </View>
          );
        })}

        <View style={s.totalBar}>
          <Text style={s.totalLabel}>TOTAL</Text>
          <Text style={s.totalValor}>{formatCurrencyConCentavos(venta.totalARS)}</Text>
        </View>

        <View style={[s.pagoBox, esPagoCompleto ? s.pagoBoxOk : s.pagoBoxParcial]}>
          <View style={s.pagoRow}>
            <Text style={s.pagoLabel}>Método de pago</Text>
            <Text style={s.pagoMetodo}>{metodoTexto}</Text>
          </View>
          <Text style={[s.pagoEstado, esPagoCompleto ? s.pagoEstadoOk : s.pagoEstadoParcial]}>
            {esPagoCompleto ? "PAGADO COMPLETO" : `PAGO PARCIAL — SALDO ${formatCurrencyConCentavos(saldoPendiente)}`}
          </Text>
        </View>

        {venta.fiscal && (
          <>
            <View style={s.fiscalBox}>
              <View style={s.fiscalCol}>
                <Text style={s.fiscalTitulo}>Emisor</Text>
                <Text style={s.fiscalTexto}>{venta.fiscal.emisor.razonSocial}</Text>
                <Text style={s.fiscalTexto}>CUIT {venta.fiscal.emisor.cuit}</Text>
                <Text style={s.fiscalTexto}>{venta.fiscal.emisor.condicion}</Text>
                <Text style={s.fiscalTexto}>{venta.fiscal.emisor.domicilio}</Text>
                {venta.fiscal.emisor.ingresosBrutos && <Text style={s.fiscalTexto}>IIBB {venta.fiscal.emisor.ingresosBrutos}</Text>}
                {venta.fiscal.emisor.inicioActividades && (
                  <Text style={s.fiscalTexto}>Inicio de actividades {venta.fiscal.emisor.inicioActividades.toLocaleDateString("es-AR")}</Text>
                )}
              </View>
              <View style={s.fiscalCol}>
                <Text style={s.fiscalTitulo}>Receptor</Text>
                {venta.fiscal.receptor.nombre ? <Text style={s.fiscalTexto}>{venta.fiscal.receptor.nombre}</Text> : null}
                <Text style={s.fiscalTexto}>{venta.fiscal.receptor.documento}</Text>
                <Text style={s.fiscalTexto}>{venta.fiscal.receptor.condicion}</Text>
                {venta.fiscal.letra === "A" && (
                  <>
                    <Text style={[s.fiscalTexto, { marginTop: 4 }]}>Neto gravado {formatCurrencyConCentavos(venta.fiscal.neto)}</Text>
                    <Text style={s.fiscalTexto}>IVA {formatCurrencyConCentavos(venta.fiscal.iva)}</Text>
                  </>
                )}
              </View>
              <View style={s.caeBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={venta.fiscal.qrDataUrl} style={s.qr} />
                <Text style={s.caeTexto}>CAE {venta.fiscal.cae}</Text>
                <Text style={s.caeSub}>Vto. CAE {venta.fiscal.caeVencimiento.toLocaleDateString("es-AR")}</Text>
                <Text style={s.caeSub}>Comprobante autorizado por ARCA</Text>
              </View>
            </View>
            {venta.fiscal.enPrueba && <Text style={s.prueba}>COMPROBANTE DE PRUEBA, SIN VALIDEZ FISCAL (homologación de ARCA)</Text>}
          </>
        )}

        <View style={s.footer}>
          <Text style={s.footerGracias}>Gracias por tu compra</Text>
          <Text style={s.footerNota}>Conserve este comprobante como constancia de su operación</Text>
        </View>
      </Page>
    </Document>
  );
}