# Facturación electrónica ARCA

Documentación interna (Innovax). Cómo está armada la facturación electrónica de
Stockea, cómo probarla y qué cuidar.

> **Estado:** etapas 1, 2 y 3 terminadas. Conexión probada contra ARCA homologación
> (CUIT 20460353492, punto de venta 1). La emisión (etapa 3) está probada contra un ARCA
> simulado; falta la primera factura real en homologación.
> Las notas de crédito (etapa 4) todavía no están: mientras tanto, **una venta facturada no
> se puede anular ni cancelar** desde Stockea.

---

## 1. Qué hace

- Es **opcional** y está en los **dos planes** (Básico y Premium). Solo la configura el **admin**.
- Cada empresa factura **con su propio CUIT y su propio certificado** (multi-empresa).
- Conexión **directa con ARCA** (sin intermediarios ni costo mensual), por web services SOAP:
  - **WSAA**: autenticación. Devuelve un ticket de acceso (token + sign) que dura ~12 h.
  - **WSFEv1**: factura electrónica (A, B, C y sus notas de crédito).

Comprobante según la condición del **negocio**:

| Negocio | Le vende a | Comprobante | Código ARCA |
|---|---|---|---|
| Monotributo / Exento | cualquiera | Factura C | 11 (NC: 13) |
| Responsable Inscripto | otro Responsable Inscripto | Factura A | 1 (NC: 3) |
| Responsable Inscripto | el resto (consumidor final, monotributo, exento) | Factura B | 6 (NC: 8) |

Receptor: cliente sin documento → **Consumidor Final**. Con DNI → consumidor final
identificado. Con CUIT/CUIL → a su nombre, con su condición frente al IVA (ARCA la
exige en el pedido).

---

## 2. Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/cifrado.ts` | Cifra/descifra con AES-256-GCM (clave privada del certificado). |
| `src/lib/arca/certificado.ts` | Valida CUIT (dígito verificador), genera clave RSA 2048 + CSR, valida el certificado que devuelve ARCA (que sea de nuestra clave y no esté vencido). |
| `src/lib/arca/http.ts` | POST SOAP con `https` de Node y `ciphers: DEFAULT@SECLEVEL=1` (ver §6). `setEnviarSoap` permite simular ARCA en las pruebas. |
| `src/lib/arca/wsaa.ts` | Arma el TRA, lo firma en CMS (PKCS#7, contenido adjunto, SHA-256) y llama a `loginCms`. Traduce los errores de ARCA a mensajes claros. |
| `src/lib/arca/wsfe.ts` | Cliente WSFEv1: `FEDummy` (estado), `FECompUltimoAutorizado`. Códigos de comprobante. |
| `src/lib/arca/factura.ts` | Etapa 3: tipo de factura, receptor (tope de consumidor final), IVA por alícuota, `prepararFacturaDeVenta` y `emitirComprobante` (numeración, reintento, recuperación con `FECompConsultar`), QR. |
| `src/app/(dashboard)/ventas/facturacion-actions.ts` | `facturarVenta` (admin y empleado), `facturacionParaVenta`, `facturaDeVenta`. |
| `src/lib/arca/ticket.ts` | `obtenerAuth(empresaId)`: reusa el ticket guardado si le quedan >10 min; si no, pide uno nuevo y lo guarda. |
| `src/app/(dashboard)/configuracion/facturacion-actions.ts` | Server actions (solo admin): datos fiscales, generar CSR, guardar certificado, cambiar entorno, probar conexión, activar. |
| `src/components/configuracion/facturacion-section.tsx` | Pantalla de Configuración → Facturación (pasos 1, 2 y 3). |
| `src/components/configuracion/guia-arca.tsx` | Guía para el cliente: qué es cada cosa, pasos en prueba y producción, errores. |
| `src/components/clientes/ClienteForm.tsx` | "Datos para facturar" del cliente (documento y condición IVA). |

Librerías: `node-forge` (RSA, CSR, PKCS#7) y `fast-xml-parser` (respuestas SOAP).

---

## 3. Datos (migración `20261007120000_facturacion_datos_fiscales`)

**Configuracion** (una por empresa): `facturacionHabilitada`, `facturarPorDefecto`, `cuit`,
`razonSocial`, `condicionIva`, `puntoVenta`, `domicilioFiscal`, `ingresosBrutos`,
`inicioActividades`, `arcaEntorno` (HOMOLOGACION | PRODUCCION), `arcaClavePrivada`
(**cifrada**), `arcaCsr`, `arcaCertificado`, `arcaCertificadoVence`, `arcaToken`,
`arcaSign`, `arcaTokenVence`.

**Cliente**: `tipoDocumento` (CUIT | CUIL | DNI), `numeroDocumento` (sin guiones ni
puntos), `condicionIva` (CONSUMIDOR_FINAL | MONOTRIBUTO | RESPONSABLE_INSCRIPTO | EXENTO).

**Producto**: `alicuotaIva` (default 21). Solo se usa para Responsable Inscripto (A/B).

Reglas que invalidan el certificado (se borra y hay que cargar uno nuevo):
cambiar el **CUIT**, cambiar de **entorno**, o **generar otra solicitud**. La solicitud
(CSR) se conserva al cambiar de entorno: sirve para pedir el certificado del otro.

---

## 4. Variable de entorno `FACTURACION_CLAVE`

- Cifra las claves privadas de los certificados en la base.
- Generar: `openssl rand -base64 32`. Cargar **la misma** en `.env` y en Vercel.
- Si no está, se usa `AUTH_SECRET` (mejor que sean independientes).
- **No cambiarla nunca.** Si cambia, ninguna clave guardada se puede descifrar y **cada
  negocio tiene que generar un certificado nuevo**. Guardarla en el gestor de contraseñas
  de Innovax.

---

## 5. Seguridad

- La clave privada se genera en el servidor, se guarda cifrada y **nunca** se devuelve al
  navegador (`obtenerFacturacion` no la incluye, tampoco el token).
- El CSR y el certificado no son secretos (son públicos por naturaleza).
- Todas las acciones usan `requerirAdmin()`. El empleado no ve nada de facturación.
- Todo filtra por `empresaId` de la sesión.

---

## 6. Detalles de ARCA que ya nos cuestan una vez (no "arreglar")

- **TLS viejo:** los servidores de ARCA usan parámetros DH chicos que OpenSSL 3 rechaza
  ("dh key too small"). Por eso `http.ts` usa `https` de Node con `DEFAULT@SECLEVEL=1`
  en vez de `fetch`. Solo afecta a esas conexiones.
- **Ticket único:** ARCA no entrega un ticket nuevo mientras el anterior esté vigente
  (`coe.alreadyAuthenticated`). Por eso se guarda y se reusa. Si se pierde (por ejemplo,
  se borró de la base), hay que esperar a que venza (~12 h) o usar otro certificado.
- **Horario:** el TRA va con hora de Argentina y offset explícito (`-03:00`), con 10 min
  de margen para atrás y para adelante.
- **Dominios:** se siguen usando los de `afip.gov.ar` (ARCA no los cambió al renombrarse).
  URLs en `wsaa.ts` y `wsfe.ts`.
- **ARCA nunca va dentro de una transacción de base de datos.** Una llamada a ARCA puede
  tardar o caerse; si estuviera dentro de `prisma.$transaction`, la transacción vencería
  (el mismo problema de "Transaction not found" que ya resolvimos). En la etapa 3: primero
  se guarda la venta y **después** se pide el CAE; si falla, queda "factura pendiente".

---

## 7. Cómo probar

### Pruebas automáticas (sin ARCA real)

Hay pruebas que usan una **autoridad certificante propia** (OpenSSL) haciendo de ARCA y
**respuestas SOAP simuladas**: CUIT, cifrado, CSR verificado con OpenSSL, firma CMS
verificada con OpenSSL, errores de ARCA, ticket reusado, entornos, permisos.
Pasaron 32/32, más 7 de documento de clientes, sin romper las suites anteriores.

### Prueba real en homologación (ya hecha una vez)

1. Configuración → Facturación: datos fiscales (punto de venta 1 sirve en prueba).
2. Generar solicitud (.csr).
3. ARCA → Administrador de Relaciones → Adherir servicio → WSASS - Autogestión
   Certificados Homologación. Cerrar sesión y volver a entrar.
4. WSASS → Nuevo Certificado (alias `stockea`, pegar el CSR) → copiar el resultado.
5. WSASS → Crear autorización a servicio → `wsfe - Facturación Electrónica`.
6. Pegar el certificado en Stockea → Probar conexión → 3 tildes verdes.

### Producción (pendiente de confirmar con el primer cliente)

Punto de venta Web Services nuevo → entorno Producción en Stockea → "Administración de
Certificados Digitales" (subir CSR, bajar .crt) → Administrador de Relaciones → Nueva
Relación → Facturación Electrónica con el certificado como representante → pegar y
probar. **Actualizar esta sección y `guia-arca.tsx` con los nombres reales de los menús
cuando lo hagamos la primera vez.**

---

## 8. Emisión (etapa 3)

Flujo: la venta se guarda → `facturarVenta(ventaId)` → `prepararFacturaDeVenta` crea el
`Comprobante` en **PENDIENTE** → `emitirComprobante` pide el CAE.

- **Numeración:** `FECompUltimoAutorizado + 1`. Si ARCA responde 10016 (no correlativo,
  otro sistema emitió en el medio), reintenta una vez con el siguiente.
- **Nunca duplica:** si un intento quedó PENDIENTE con número (se cortó la conexión), al
  reintentar primero consulta ese número con `FECompConsultar`; si ARCA lo tiene con el
  mismo importe, toma ese CAE.
- **Rechazo:** queda RECHAZADO, sin número, con el motivo de ARCA. Se puede reintentar.
- **Precios con IVA incluido:** en A/B el neto se calcula hacia atrás por alícuota; el
  descuento se reparte en proporción y el redondeo se ajusta para que neto + IVA = total.
- **Tope consumidor final:** `TOPE_CONSUMIDOR_FINAL` = $10.000.000 (RG 5700/2025, sigue con
  la RG 5824/2026). Desde ese monto pide DNI/CUIL/CUIT. **Revisar si ARCA lo cambia.**
- **QR:** `urlQrArca` arma el JSON de la especificación de ARCA (base64) sobre
  `https://www.afip.gob.ar/fe/qr/`.
- **PDF:** `/api/ventas/[id]/comprobante` agrega emisor, receptor, CAE, vencimiento y QR si
  la venta tiene factura AUTORIZADA. En homologación dice "SIN VALIDEZ FISCAL".
- **Anular:** bloqueado para ventas facturadas hasta la etapa 4.

## 9. Lo que falta

- **Primera factura real en homologación** (activar en el paso 4, vender con "Emitir
  factura" y revisar el PDF; el QR se puede verificar escaneándolo).
- **Etapa 4:** notas de crédito automáticas al anular una venta facturada y listado de
  comprobantes emitidos.
- **Aviso de vencimiento** del certificado (unos 30 días antes).
