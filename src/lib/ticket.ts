/**
 * Ticket de venta para impresora térmica / comandera (issue #86).
 *
 * El ticket se arma en el navegador con los datos de la venta (no hace falta
 * pedirle nada al servidor), así se puede imprimir también SIN CONEXIÓN, con
 * las ventas que quedan en la cola. No es un comprobante fiscal: si la venta
 * se factura con ARCA, la factura es otro documento.
 *
 * Funciona con cualquier térmica de 58 u 80 mm que tenga driver de Windows /
 * Linux / Mac: se imprime una página del alto justo del ticket (sin hojas en
 * blanco). Con Chrome abierto con `--kiosk-printing` sale directo, sin el
 * cuadro de impresión (ver docs/IMPRESORA-TERMICA.md).
 *
 * La configuración (ancho del papel, imprimir al confirmar y texto del pie) es
 * de CADA COMPUTADORA: cada caja tiene su impresora. Se guarda en el navegador.
 */

export type AnchoPapel = 58 | 80;

export type ConfigTicket = {
  ancho: AnchoPapel;
  /** Imprimir el ticket solo, al confirmar cada venta. */
  imprimirAlConfirmar: boolean;
  /** Texto al pie ("¡Gracias por su compra!"). Puede tener varias líneas. */
  pie: string;
};

export type NegocioTicket = {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  cuit: string | null;
};

export type ItemTicket = {
  cantidad: number;
  nombre: string;
  precioUnitario: number;
  importe: number;
  /** Promoción (#114): lo que incluye ("1 × Fernet · 2 × Coca"), en letra chica debajo. */
  detalle?: string | null;
};

export type DatosTicket = {
  negocio: NegocioTicket;
  /** Número de venta; null = venta sin conexión que todavía no se subió. */
  numero: number | null;
  fecha: Date | string;
  cliente: string | null;
  items: ItemTicket[];
  subtotal: number;
  descuento: { monto: number; porcentaje: number | null } | null;
  total: number;
  pagos: { medio: string; monto: number }[];
  /** Con cuánto pagó en efectivo y el vuelto (calculadora del cobro, #68). */
  pagaCon: number | null;
  vuelto: number | null;
  /** Lo que quedó como deuda del cliente (venta a cuenta). */
  saldoPendiente: number;
  /** "Factura B 0001-00000012", si la venta se facturó. */
  factura?: string | null;
  anulada?: boolean;
  /** Reimpresión de una venta vieja (se aclara en el ticket). */
  reimpresion?: boolean;
};

export const CONFIG_TICKET_POR_DEFECTO: ConfigTicket = {
  ancho: 80,
  imprimirAlConfirmar: false,
  pie: "¡Gracias por su compra!",
};

const CLAVE_CONFIG = "stockea_ticket";
const CLAVE_NEGOCIO = "stockea_ticket_negocio";

// localStorage puede no existir o fallar (modo privado, servidor): nunca rompe.
function leer<T>(clave: string): T | null {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(clave) : null;
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: queda la configuración por defecto */
  }
}

export function leerConfigTicket(): ConfigTicket {
  const c = leer<Partial<ConfigTicket>>(CLAVE_CONFIG) ?? {};
  return {
    ancho: c.ancho === 58 ? 58 : 80,
    imprimirAlConfirmar: c.imprimirAlConfirmar === true,
    pie: typeof c.pie === "string" ? c.pie.slice(0, 300) : CONFIG_TICKET_POR_DEFECTO.pie,
  };
}
export function guardarConfigTicket(config: ConfigTicket) {
  guardar(CLAVE_CONFIG, { ...config, pie: config.pie.slice(0, 300) });
}

/** Datos del negocio: se guardan al abrir Ventas con internet, para poder imprimir sin conexión. */
export function leerNegocioTicket(): NegocioTicket | null {
  return leer<NegocioTicket>(CLAVE_NEGOCIO);
}
export function guardarNegocioTicket(negocio: NegocioTicket) {
  guardar(CLAVE_NEGOCIO, negocio);
}

// ---------------------------------------------------------------------------
// Armado del HTML

const TZ = "America/Argentina/Buenos_Aires";

const escapar = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "$ 12.345" sin centavos (en la caja no se cobran centavos). */
export function pesosTicket(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? "-" : ""}$ ${Math.abs(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}
const cantidadTexto = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

function fechaHora(f: Date | string) {
  const d = typeof f === "string" ? new Date(f) : f;
  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d).replace(",", "");
}

/** Medidas del papel: ancho total y ancho imprimible (la térmica no imprime en los bordes). */
export function medidasPapel(ancho: AnchoPapel) {
  return ancho === 58
    ? { papel: 58, imprimible: 48, fuente: 10.5, fuenteTotal: 15, fuenteNegocio: 14 }
    : { papel: 80, imprimible: 72, fuente: 12, fuenteTotal: 18, fuenteNegocio: 17 };
}

const fila = (izq: string, der: string, clase = "") =>
  `<div class="stk-fila ${clase}"><span class="stk-izq">${izq}</span><span class="stk-der">${der}</span></div>`;

/** Contenido del ticket: HTML y su CSS (todo dentro de `.stk-t`, no choca con los estilos de la app). */
export function armarTicket(t: DatosTicket, config: Pick<ConfigTicket, "ancho" | "pie">): { css: string; html: string } {
  const m = medidasPapel(config.ancho);
  const margen = (m.papel - m.imprimible) / 2;
  const n = t.negocio;
  const partes: string[] = [];

  // Encabezado del negocio
  partes.push(`<div class="stk-centro stk-negocio">${escapar(n.nombre || "Ticket de venta")}</div>`);
  for (const linea of [n.direccion, n.telefono ? `Tel: ${n.telefono}` : null, n.cuit ? `CUIT ${n.cuit}` : null]) {
    if (linea) partes.push(`<div class="stk-centro stk-chico">${escapar(linea)}</div>`);
  }
  partes.push(`<div class="stk-sep"></div>`);

  if (t.anulada) partes.push(`<div class="stk-centro stk-aviso">*** VENTA ANULADA ***</div>`);
  if (t.reimpresion) partes.push(`<div class="stk-centro stk-chico">REIMPRESIÓN</div>`);
  partes.push(
    fila(
      t.numero != null ? `<b>Venta #${t.numero}</b>` : `<b>Venta pendiente</b>`,
      escapar(fechaHora(t.fecha))
    )
  );
  if (t.numero == null) partes.push(`<div class="stk-chico">Hecha sin conexión: el número se asigna al subirla.</div>`);
  if (t.cliente) partes.push(`<div>Cliente: ${escapar(t.cliente)}</div>`);
  partes.push(`<div class="stk-sep"></div>`);

  // Ítems: "2 x Yerba 1 kg" y debajo "$ 5.000 c/u ...... $ 10.000".
  // Con cantidad 1, una sola línea: nombre e importe.
  for (const it of t.items) {
    if (it.cantidad === 1) {
      partes.push(fila(escapar(it.nombre), pesosTicket(it.importe), "stk-item"));
    } else {
      partes.push(`<div class="stk-item">${cantidadTexto(it.cantidad)} x ${escapar(it.nombre)}</div>`);
      partes.push(fila(`<span class="stk-chico">&nbsp;&nbsp;${pesosTicket(it.precioUnitario)} c/u</span>`, pesosTicket(it.importe)));
    }
    if (it.detalle) partes.push(`<div class="stk-chico">&nbsp;&nbsp;${escapar(it.detalle)}</div>`);
  }
  partes.push(`<div class="stk-sep"></div>`);

  // Totales
  if (t.descuento && t.descuento.monto > 0) {
    partes.push(fila("Subtotal", pesosTicket(t.subtotal)));
    const etiqueta = t.descuento.porcentaje != null ? `Descuento (${cantidadTexto(t.descuento.porcentaje)}%)` : "Descuento";
    partes.push(fila(etiqueta, `-${pesosTicket(t.descuento.monto)}`));
  }
  partes.push(fila("TOTAL", pesosTicket(t.total), "stk-total"));

  // Cobro
  const pagos = t.pagos.filter((p) => p.monto > 0);
  if (pagos.length > 0 || t.saldoPendiente > 0 || t.pagaCon != null) {
    partes.push(`<div class="stk-sep"></div>`);
    for (const p of pagos) partes.push(fila(escapar(p.medio), pesosTicket(p.monto)));
    if (t.pagaCon != null && t.vuelto != null) {
      partes.push(fila("Paga con", pesosTicket(t.pagaCon)));
      partes.push(fila("<b>Vuelto</b>", `<b>${pesosTicket(t.vuelto)}</b>`));
    }
    if (t.saldoPendiente > 0) partes.push(fila("<b>Saldo pendiente</b>", `<b>${pesosTicket(t.saldoPendiente)}</b>`));
  }

  if (t.factura) {
    partes.push(`<div class="stk-sep"></div>`);
    partes.push(`<div class="stk-centro stk-chico">${escapar(t.factura)}</div>`);
  }

  // Pie
  partes.push(`<div class="stk-sep"></div>`);
  for (const linea of config.pie.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    partes.push(`<div class="stk-centro">${escapar(linea)}</div>`);
  }
  if (!t.factura) partes.push(`<div class="stk-centro stk-chico">No válido como factura</div>`);

  const css = `
  .stk-t, .stk-t * { box-sizing: border-box; }
  .stk-t {
    width: ${m.papel}mm;
    padding: 3mm ${margen}mm 6mm;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: ${m.fuente}px;
    font-weight: 400;
    line-height: 1.3;
    letter-spacing: normal;
    text-align: left;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .stk-t div, .stk-t span, .stk-t b {
    margin: 0; padding: 0; border: 0; color: #000; background: none;
    font-family: inherit; font-size: inherit; font-weight: inherit; font-style: normal; line-height: inherit; text-transform: none;
  }
  .stk-t b { font-weight: 700; }
  .stk-t .stk-centro { text-align: center; }
  .stk-t .stk-negocio { font-size: ${m.fuenteNegocio}px; font-weight: 700; margin-bottom: 1mm; word-break: break-word; }
  .stk-t .stk-chico { font-size: ${m.fuente - 1.5}px; }
  .stk-t .stk-aviso { font-weight: 700; margin: 1mm 0; }
  .stk-t .stk-sep { border-top: 1px dashed #000; margin: 2mm 0; }
  .stk-t .stk-fila { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
  .stk-t .stk-izq { flex: 1; min-width: 0; word-break: break-word; }
  .stk-t .stk-der { white-space: nowrap; text-align: right; }
  .stk-t .stk-item { margin-top: 0.8mm; word-break: break-word; }
  .stk-t .stk-total { font-size: ${m.fuenteTotal}px; font-weight: 700; margin-top: 1mm; }`;
  return { css, html: `<div class="stk-t">${partes.join("\n")}</div>` };
}

/** HTML completo del ticket como documento independiente (vista previa / pruebas). */
export function armarHtmlTicket(t: DatosTicket, config: Pick<ConfigTicket, "ancho" | "pie">): string {
  const { css, html } = armarTicket(t, config);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title>
<style>@page { margin: 0; } html, body { margin: 0; padding: 0; background: #fff; }${css}</style></head>
<body>${html}</body></html>`;
}

// ---------------------------------------------------------------------------
// Impresión

const CLASE_IMPRESION = "stk-ticket-impresion";

/**
 * Imprime el ticket desde la MISMA página (no en un iframe: Chrome ignora el
 * tamaño de página de un iframe y saldría en A4 con encabezados). Mientras se
 * imprime se oculta todo lo demás y la página se hace del ancho del rollo y del
 * alto justo del ticket, así la térmica no saca papel en blanco y corta al terminar.
 */
export function imprimirTicket(datos: DatosTicket, config: ConfigTicket = leerConfigTicket()): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve();
    // Si quedó uno a medias (doble clic), se saca.
    document.querySelectorAll(`.${CLASE_IMPRESION}, style[data-stk-ticket]`).forEach((e) => e.remove());

    const { css, html } = armarTicket(datos, config);
    const contenedor = document.createElement("div");
    contenedor.className = CLASE_IMPRESION;
    contenedor.setAttribute("aria-hidden", "true");
    contenedor.innerHTML = `<style>${css}</style>${html}`;
    // En pantalla queda fuera de la vista; al imprimir es lo único que se ve.
    Object.assign(contenedor.style, { position: "absolute", left: "-10000px", top: "0" });
    document.body.appendChild(contenedor);

    const { papel } = medidasPapel(config.ancho);
    const ticket = contenedor.querySelector(".stk-t") as HTMLElement;
    const altoMm = Math.ceil((ticket.getBoundingClientRect().height * 25.4) / 96) + 2;

    const estilo = document.createElement("style");
    estilo.setAttribute("data-stk-ticket", "");
    estilo.textContent = `
      @page { size: ${papel}mm ${altoMm}mm; margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
          width: auto !important; min-width: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
        body > *:not(.${CLASE_IMPRESION}) { display: none !important; }
        .${CLASE_IMPRESION} { position: static !important; left: auto !important; }
      }`;
    document.head.appendChild(estilo);

    let terminado = false;
    const terminar = () => {
      if (terminado) return;
      terminado = true;
      window.removeEventListener("afterprint", terminar);
      contenedor.remove();
      estilo.remove();
      resolve();
    };
    window.addEventListener("afterprint", terminar);
    window.print(); // en Chrome bloquea hasta que se imprime o se cancela
    setTimeout(terminar, 60_000); // por si el navegador no avisa "afterprint"
  });
}

/** Ticket de muestra para "Imprimir prueba" en la configuración. */
export function ticketDePrueba(negocio: NegocioTicket | null): DatosTicket {
  return {
    negocio: negocio ?? { nombre: "Mi negocio", direccion: null, telefono: null, cuit: null },
    numero: 123,
    fecha: new Date(),
    cliente: null,
    items: [
      { cantidad: 2, nombre: "Yerba Playadito 1 kg", precioUnitario: 5200, importe: 10400 },
      { cantidad: 1, nombre: "Pan lactal grande", precioUnitario: 2300, importe: 2300 },
      { cantidad: 0.5, nombre: "Queso cremoso (kg)", precioUnitario: 9000, importe: 4500 },
    ],
    subtotal: 17200,
    descuento: null,
    total: 17200,
    pagos: [{ medio: "Efectivo", monto: 17200 }],
    pagaCon: 20000,
    vuelto: 2800,
    saldoPendiente: 0,
  };
}
