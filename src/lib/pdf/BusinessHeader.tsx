import { View, Text, Image } from "@react-pdf/renderer";
import { getPdfStyles } from "./styles";
import { getPdfBrand } from "./brand";
import type { Configuracion } from "@prisma/client";

export function BusinessHeader({
  configuracion,
  titulo,
}: {
  configuracion: Configuracion;
  titulo: string;
}) {
  const pdfStyles = getPdfStyles(getPdfBrand(configuracion));

  const detalle = [
    configuracion.instagram || null,
    configuracion.telefono ? `Tel: ${configuracion.telefono}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <View style={pdfStyles.header} fixed>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Sin logo no se dibuja el recuadro vacío. */}
        {configuracion.logoUrl ? (
          <View style={pdfStyles.logoBox}>
            <Image src={configuracion.logoUrl} style={pdfStyles.logo} />
          </View>
        ) : null}
        <View>
          <Text style={pdfStyles.businessName}>{configuracion.nombreNegocio}</Text>
          {detalle && <Text style={pdfStyles.businessDetail}>{detalle}</Text>}
        </View>
      </View>
      <View>
        <Text style={pdfStyles.docTitle}>{titulo.toUpperCase()}</Text>
        <Text style={pdfStyles.docDate}>
          {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())}
        </Text>
      </View>
    </View>
  );
}
