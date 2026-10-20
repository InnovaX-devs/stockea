import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Configuracion } from "@prisma/client";
import { BusinessHeader } from "./BusinessHeader";
import { getPdfStyles } from "./styles";
import { getPdfBrand } from "./brand";
import { formatCurrency } from "@/lib/currency";
import type { ResumenCuenta } from "@/lib/resumen-cliente";

/**
 * Resumen de cuenta corriente del cliente (issue #83): por mes, por período o
 * "desde que debe". Ojo: Helvetica no tiene el signo menos "−" (U+2212); se
 * usa el guion común "-".
 */

const TZ = "America/Argentina/Buenos_Aires";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const VERDE = "#0F9D58";
const ROJO = "#C0392B";

const capitalizar = (t: string) => t.replace(/^./, (c) => c.toUpperCase());
function nombreMes(mes: string) {
  const [anio, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${anio}`;
}
const fmt = (opciones: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-AR", { timeZone: TZ, ...opciones });
const fechaNum = (d: Date) => fmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const fechaLarga = (d: Date) => fmt({ day: "numeric", month: "long", year: "numeric" }).format(d);
const pesos = (n: number) => formatCurrency(n, "ARS");
const cantidad = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

/** Último día incluido en el período (hasta es exclusivo). */
const ultimoDia = (r: ResumenCuenta) => (r.hastaHoy ? r.hasta : new Date(r.hasta.getTime() - 1));

function tituloPeriodo(r: ResumenCuenta) {
  if (r.tipo === "mes" && r.mes) return capitalizar(nombreMes(r.mes));
  if (r.tipo === "deuda") return "Desde que empezó la deuda";
  return "Período";
}

export function ResumenCuentaDocument({ resumen: r, configuracion }: { resumen: ResumenCuenta; configuracion: Configuracion }) {
  const brand = getPdfBrand(configuracion);
  const base = getPdfStyles(brand);
  // Las fechas de la tabla llevan año solo si el período cruza de año.
  const mismoAnio = fmt({ year: "numeric" }).format(r.desde) === fmt({ year: "numeric" }).format(ultimoDia(r));
  const fechaFila = (d: Date) => fmt(mismoAnio ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
  const hora = (d: Date) => fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

  const s = StyleSheet.create({
    // Cliente y período
    encabezado: { flexDirection: "row", gap: 10, marginBottom: 12 },
    tarjeta: { flex: 1, backgroundColor: brand.surfaceHover, borderRadius: 6, padding: 10 },
    label: { fontSize: 7.5, color: brand.textDim, textTransform: "uppercase", letterSpacing: 0.6 },
    clienteNombre: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
    dato: { fontSize: 8.5, color: brand.textDim, marginTop: 2 },
    periodo: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3, color: brand.primary },

    // Cajas de totales
    cajas: { flexDirection: "row", gap: 6, marginBottom: 16 },
    caja: { flex: 1, borderWidth: 1, borderColor: brand.border, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9 },
    cajaFinal: { flex: 1.25, backgroundColor: brand.primary, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9 },
    cajaValor: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 4 },

    // Tabla
    th: { flexDirection: "row", backgroundColor: brand.primary, color: "#FFFFFF", paddingVertical: 6, paddingHorizontal: 8, fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: brand.border },
    trPar: { backgroundColor: "#FAFBFC" },
    cFecha: { width: 46 },
    cDetalle: { flex: 1, paddingRight: 8 },
    cMonto: { width: 72, textAlign: "right" },
    cSaldo: { width: 76, textAlign: "right", fontFamily: "Helvetica-Bold" },
    horaTxt: { fontSize: 7, color: brand.textDim, marginTop: 1 },
    titulo: { fontFamily: "Helvetica-Bold" },
    item: { flexDirection: "row", marginTop: 2 },
    itemTxt: { flex: 1, fontSize: 8, color: brand.textDim },
    itemImporte: { fontSize: 8, color: brand.textDim, marginLeft: 6 },
    nota: { fontSize: 8, color: VERDE, marginTop: 2 },
    vacio: { paddingVertical: 14, textAlign: "center", color: brand.textDim, borderBottomWidth: 0.5, borderBottomColor: brand.border },
    totales: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1.2, borderTopColor: brand.text, fontFamily: "Helvetica-Bold" },

    // Saldo final
    pie: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 },
    leyenda: { flex: 1, paddingRight: 16, fontSize: 8, color: brand.textDim, lineHeight: 1.4 },
    total: { width: 230, borderWidth: 2, borderColor: brand.primary, borderRadius: 6, padding: 12 },
    totalValor: { fontSize: 22, fontFamily: "Helvetica-Bold", color: brand.primary, marginTop: 4, textAlign: "right" },
    alDia: { fontSize: 9, color: VERDE, fontFamily: "Helvetica-Bold", marginTop: 4, textAlign: "right" },
  });

  const rango =
    r.tipo === "deuda" && r.movimientos.length === 0
      ? `Al ${fechaNum(r.hasta)}`
      : `Del ${fechaNum(r.desde)} al ${fechaNum(ultimoDia(r))}${r.hastaHoy ? " (hoy)" : ""}`;
  const alFinal = r.hastaHoy ? "hoy" : `al ${fechaNum(ultimoDia(r))}`;
  const tituloDoc = `Resumen ${r.tipo === "mes" && r.mes ? nombreMes(r.mes) : rango} - ${r.cliente.nombre}`;
  const contacto = [configuracion.telefono ? `Tel: ${configuracion.telefono}` : null, configuracion.instagram || null].filter(Boolean).join(" · ");

  return (
    <Document title={tituloDoc}>
      <Page size="A4" style={base.page}>
        <BusinessHeader configuracion={configuracion} titulo="Resumen de cuenta" />

        <View style={s.encabezado}>
          <View style={s.tarjeta}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.clienteNombre}>{r.cliente.nombre}</Text>
            {r.cliente.documento && <Text style={s.dato}>{r.cliente.documento}</Text>}
            {r.cliente.telefono && <Text style={s.dato}>Tel: {r.cliente.telefono}</Text>}
            {r.cliente.direccion && <Text style={s.dato}>{r.cliente.direccion}</Text>}
          </View>
          <View style={[s.tarjeta, { flex: 0.85 }]}>
            <Text style={s.label}>Período</Text>
            <Text style={s.periodo}>{tituloPeriodo(r)}</Text>
            <Text style={s.dato}>{rango}</Text>
            <Text style={s.dato}>
              {r.movimientos.length} {r.movimientos.length === 1 ? "movimiento" : "movimientos"}
            </Text>
          </View>
        </View>

        <View style={s.cajas}>
          <View style={s.caja}>
            <Text style={s.label}>{r.tipo === "deuda" ? "Saldo inicial" : "Saldo anterior"}</Text>
            <Text style={s.cajaValor}>{pesos(r.saldoAnterior)}</Text>
          </View>
          <View style={s.caja}>
            <Text style={s.label}>+ Compras</Text>
            <Text style={[s.cajaValor, { color: ROJO }]}>{pesos(r.totalCompras)}</Text>
          </View>
          <View style={s.caja}>
            <Text style={s.label}>- Pagos</Text>
            <Text style={[s.cajaValor, { color: VERDE }]}>{pesos(r.totalPagos)}</Text>
          </View>
          <View style={s.cajaFinal}>
            <Text style={[s.label, { color: "#FFFFFF" }]}>= Saldo {alFinal}</Text>
            <Text style={[s.cajaValor, { color: "#FFFFFF" }]}>{pesos(r.saldoFinal)}</Text>
          </View>
        </View>

        <View style={s.th} fixed>
          <Text style={s.cFecha}>Fecha</Text>
          <Text style={s.cDetalle}>Detalle</Text>
          <Text style={s.cMonto}>Compra</Text>
          <Text style={s.cMonto}>Pago</Text>
          <Text style={s.cSaldo}>Saldo</Text>
        </View>
        <View style={s.tr}>
          <Text style={s.cFecha}>{fechaFila(r.desde)}</Text>
          <Text style={[s.cDetalle, s.titulo]}>{r.tipo === "deuda" ? "Saldo inicial" : "Saldo anterior"}</Text>
          <Text style={s.cMonto} />
          <Text style={s.cMonto} />
          <Text style={s.cSaldo}>{pesos(r.saldoAnterior)}</Text>
        </View>

        {r.movimientos.length === 0 ? (
          <Text style={s.vacio}>{r.tipo === "deuda" ? "El cliente no tiene deuda: la cuenta está al día." : "Sin compras ni pagos en el período."}</Text>
        ) : (
          r.movimientos.map((m, i) => {
            const fila = [s.tr, i % 2 === 0 ? s.trPar : {}];
            const celdaFecha = (
              <View style={s.cFecha}>
                <Text>{fechaFila(m.fecha)}</Text>
                <Text style={s.horaTxt}>{hora(m.fecha)}</Text>
              </View>
            );
            if (m.tipo === "pago") {
              return (
                <View key={i} style={fila} wrap={false}>
                  {celdaFecha}
                  <Text style={[s.cDetalle, s.titulo, { color: VERDE }]}>{m.detalle}</Text>
                  <Text style={s.cMonto} />
                  <Text style={[s.cMonto, { color: VERDE }]}>- {pesos(m.monto)}</Text>
                  <Text style={s.cSaldo}>{pesos(m.saldo)}</Text>
                </View>
              );
            }
            return (
              <View key={i} style={fila} wrap={false}>
                {celdaFecha}
                <View style={s.cDetalle}>
                  <Text style={s.titulo}>
                    {m.esAjuste ? "Ajuste de deuda" : `Compra${m.ventaNumero != null ? ` #${m.ventaNumero}` : ""}`}
                  </Text>
                  {m.items.map((it, j) => (
                    <View key={j} style={s.item}>
                      <Text style={s.itemTxt}>
                        {cantidad(it.cantidad)} × {it.nombre}
                        {it.cantidad !== 1 && it.cantidad > 0 ? `  (${pesos(Math.round(it.importe / it.cantidad))} c/u)` : ""}
                      </Text>
                      <Text style={s.itemImporte}>{pesos(it.importe)}</Text>
                    </View>
                  ))}
                  {m.pagadoEnElMomento > 0 && (
                    <Text style={s.nota}>
                      {m.pagadoEnElMomento >= m.cargo ? "Pagada en el momento" : `Pagó ${pesos(m.pagadoEnElMomento)} en el momento`}
                    </Text>
                  )}
                </View>
                <Text style={s.cMonto}>{pesos(m.cargo)}</Text>
                <Text style={[s.cMonto, { color: VERDE }]}>{m.pagadoEnElMomento > 0 ? `- ${pesos(m.pagadoEnElMomento)}` : ""}</Text>
                <Text style={s.cSaldo}>{pesos(m.saldo)}</Text>
              </View>
            );
          })
        )}

        {r.movimientos.length > 0 && (
          <View style={s.totales} wrap={false}>
            <Text style={s.cFecha} />
            <Text style={s.cDetalle}>Totales del período</Text>
            <Text style={[s.cMonto, { color: ROJO }]}>{pesos(r.totalCompras)}</Text>
            <Text style={[s.cMonto, { color: VERDE }]}>- {pesos(r.totalPagos)}</Text>
            <Text style={s.cSaldo}>{pesos(r.saldoFinal)}</Text>
          </View>
        )}

        <View style={s.pie} wrap={false}>
          <View style={s.leyenda}>
            <Text>Saldo anterior + compras - pagos = saldo {alFinal}.</Text>
            <Text>Resumen emitido el {fechaLarga(new Date())}.</Text>
            {contacto ? <Text>Consultas: {contacto}</Text> : null}
          </View>
          <View style={s.total}>
            <Text style={s.label}>{r.saldoFinal > 0 ? "Saldo a pagar" : "Saldo"} {alFinal}</Text>
            <Text style={s.totalValor}>{pesos(r.saldoFinal)}</Text>
            {r.saldoFinal <= 0 && <Text style={s.alDia}>Cuenta al día. ¡Gracias!</Text>}
          </View>
        </View>

        <Text
          style={base.footer}
          render={({ pageNumber, totalPages }) => `${configuracion.nombreNegocio} · ${r.cliente.nombre} · Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
