import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Configuracion } from "@prisma/client";
import { BusinessHeader } from "./BusinessHeader";
import { getPdfStyles } from "./styles";
import { getPdfBrand } from "./brand";
import { formatCurrency } from "@/lib/currency";
import type { EventoCuentaCorriente } from "@/lib/cuenta-corriente-proveedor";

/**
 * Resumen de cuenta del proveedor (CP-2): mismo formato que el de clientes
 * (ResumenCuentaDocument). Cargo = compras/gastos/deuda inicial, abono = pagos.
 * Ojo: Helvetica no tiene el signo menos "−"; se usa el guion común "-".
 */

const TZ = "America/Argentina/Buenos_Aires";
const VERDE = "#0F9D58";
const ROJO = "#C0392B";
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
const pesos = (n: number) => formatCurrency(n, "ARS");

export function ResumenProveedorDocument({
  proveedor,
  saldo,
  eventos,
  configuracion,
}: {
  proveedor: { nombre: string };
  saldo: number;
  eventos: EventoCuentaCorriente[];
  configuracion: Configuracion;
}) {
  const brand = getPdfBrand(configuracion);
  const base = getPdfStyles(brand);
  const totalCargos = eventos.filter((e) => e.tipo === "cargo").reduce((a, e) => a + e.monto, 0);
  const totalPagos = eventos.filter((e) => e.tipo === "abono").reduce((a, e) => a + e.monto, 0);
  const hoy = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const s = StyleSheet.create({
    tarjeta: { backgroundColor: brand.surfaceHover, borderRadius: 6, padding: 10, marginBottom: 12 },
    label: { fontSize: 7.5, color: brand.textDim, textTransform: "uppercase", letterSpacing: 0.6 },
    nombre: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
    dato: { fontSize: 8.5, color: brand.textDim, marginTop: 2 },
    cajas: { flexDirection: "row", gap: 6, marginBottom: 16 },
    caja: { flex: 1, borderWidth: 1, borderColor: brand.border, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9 },
    cajaFinal: { flex: 1.25, backgroundColor: brand.primary, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9 },
    cajaValor: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 4 },
    th: { flexDirection: "row", backgroundColor: brand.primary, color: "#FFFFFF", paddingVertical: 6, paddingHorizontal: 8, fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: brand.border },
    trPar: { backgroundColor: "#FAFBFC" },
    cFecha: { width: 46 },
    cDetalle: { flex: 1, paddingRight: 8 },
    cMonto: { width: 72, textAlign: "right" },
    cSaldo: { width: 76, textAlign: "right", fontFamily: "Helvetica-Bold" },
    titulo: { fontFamily: "Helvetica-Bold" },
    sub: { fontSize: 7.5, color: brand.textDim, marginTop: 1 },
    vacio: { paddingVertical: 14, textAlign: "center", color: brand.textDim },
    total: { alignSelf: "flex-end", width: 230, borderWidth: 2, borderColor: brand.primary, borderRadius: 6, padding: 12, marginTop: 18 },
    totalValor: { fontSize: 22, fontFamily: "Helvetica-Bold", color: brand.primary, marginTop: 4, textAlign: "right" },
    alDia: { fontSize: 9, color: VERDE, fontFamily: "Helvetica-Bold", marginTop: 4, textAlign: "right" },
  });

  return (
    <Document title={`Resumen de cuenta - ${proveedor.nombre}`}>
      <Page size="A4" style={base.page}>
        <BusinessHeader configuracion={configuracion} titulo="Resumen de cuenta del proveedor" />

        <View style={s.tarjeta}>
          <Text style={s.label}>Proveedor</Text>
          <Text style={s.nombre}>{proveedor.nombre}</Text>
          <Text style={s.dato}>Al {hoy}</Text>
        </View>

        <View style={s.cajas}>
          <View style={s.caja}>
            <Text style={s.label}>+ Compras y gastos</Text>
            <Text style={[s.cajaValor, { color: ROJO }]}>{pesos(totalCargos)}</Text>
          </View>
          <View style={s.caja}>
            <Text style={s.label}>- Pagos</Text>
            <Text style={[s.cajaValor, { color: VERDE }]}>{pesos(totalPagos)}</Text>
          </View>
          <View style={s.cajaFinal}>
            <Text style={[s.label, { color: "#FFFFFF" }]}>= Saldo (se le debe)</Text>
            <Text style={[s.cajaValor, { color: "#FFFFFF" }]}>{pesos(saldo)}</Text>
          </View>
        </View>

        <View style={s.th} fixed>
          <Text style={s.cFecha}>Fecha</Text>
          <Text style={s.cDetalle}>Detalle</Text>
          <Text style={s.cMonto}>Cargo</Text>
          <Text style={s.cMonto}>Pago</Text>
          <Text style={s.cSaldo}>Saldo</Text>
        </View>

        {eventos.length === 0 ? (
          <Text style={s.vacio}>Sin movimientos.</Text>
        ) : (
          eventos.map((e, i) => (
            <View key={e.id} style={[s.tr, i % 2 === 0 ? s.trPar : {}]} wrap={false}>
              <Text style={s.cFecha}>{fecha(e.fecha)}</Text>
              <View style={s.cDetalle}>
                <Text style={[s.titulo, e.tipo === "abono" ? { color: VERDE } : {}]}>{e.label}</Text>
                {e.sublabel ? <Text style={s.sub}>{e.sublabel}</Text> : null}
              </View>
              <Text style={s.cMonto}>{e.tipo === "cargo" ? pesos(e.monto) : ""}</Text>
              <Text style={[s.cMonto, { color: VERDE }]}>{e.tipo === "abono" ? `- ${pesos(e.monto)}` : ""}</Text>
              <Text style={s.cSaldo}>{pesos(e.saldo)}</Text>
            </View>
          ))
        )}

        <View style={s.total} wrap={false}>
          <Text style={s.label}>Saldo actual</Text>
          <Text style={s.totalValor}>{pesos(saldo)}</Text>
          {saldo <= 0.5 && <Text style={s.alDia}>Cuenta al día</Text>}
        </View>
      </Page>
    </Document>
  );
}
