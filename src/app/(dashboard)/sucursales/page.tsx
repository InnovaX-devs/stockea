import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/empresa";
import { INICIO_EMPLEADO } from "@/lib/permisos";
import { formatCurrency } from "@/lib/currency";
import { fechaISOAR, formatHoraAR } from "@/lib/timezone";
import { cn } from "@/lib/cn";
import { FiltroPeriodo } from "@/components/sucursales/filtro-periodo";
import { VerDetalle } from "@/components/sucursales/ver-detalle";
import {
  obtenerPanelSucursales,
  resolverPeriodo,
  type DiferenciasPorMoneda,
  type EstadoCajaPanel,
  type SucursalPanel,
} from "./queries";

export const dynamic = "force-dynamic";

const BADGE = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

/** "Hoy 13:02", "Ayer 21:10" o "13/10 21:10". */
function cuando(iso: string, hoy: string) {
  const fecha = new Date(iso);
  const dia = fechaISOAR(fecha);
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  const prefijo =
    dia === hoy ? "Hoy" : dia === ayer.toISOString().slice(0, 10) ? "Ayer" : `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return `${prefijo} ${formatHoraAR(fecha)}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default async function PanelSucursalesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  // El proxy ya saca al empleado (no está en sus páginas); esto es por las dudas.
  const usuario = await obtenerUsuarioActual();
  if (usuario.rol !== "ADMIN") redirect(INICIO_EMPLEADO);

  const periodo = resolverPeriodo(await searchParams);
  const panel = await obtenerPanelSucursales(periodo);
  const { totales, sucursales, hoy } = panel;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-text sm:text-3xl">Sucursales</h1>
          <p className="mt-1 text-sm text-text-dim">Cómo viene cada sucursal, una al lado de la otra</p>
        </div>
        <FiltroPeriodo clave={periodo.clave} desde={periodo.desde} hasta={periodo.hasta} />
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi etiqueta="Ventas hoy" valor={formatCurrency(totales.ventasHoyARS, "ARS")}>
          {plural(totales.ventasHoyCantidad, "venta", "ventas")} · {plural(sucursales.length, "sucursal", "sucursales")}
        </Kpi>
        <Kpi etiqueta="Cajas abiertas" valor={`${totales.cajasAbiertas} de ${sucursales.length}`}>
          {resumenCajas(sucursales, hoy)}
        </Kpi>
        <Kpi etiqueta="Stock bajo" valor={plural(totales.stockBajo, "producto", "productos")}>
          {totales.stockNegativo > 0
            ? `${totales.stockNegativo} con stock negativo`
            : "ninguno con stock negativo"}
        </Kpi>
        <Kpi etiqueta={periodo.tituloGastos} valor={formatCurrency(totales.gastosARS, "ARS")}>
          {periodo.etiqueta}
        </Kpi>
      </div>

      {/* Una tarjeta por sucursal */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sucursales.map((s) => (
          <TarjetaSucursal key={s.id} sucursal={s} hoy={hoy} tituloGastos={periodo.tituloGastos} />
        ))}
      </div>

      <div className="space-y-1 text-xs text-text-dim">
        {panel.gastosSinSucursalARS > 0 && (
          <p>
            Los gastos incluyen {formatCurrency(panel.gastosSinSucursalARS, "ARS")} cargados en &quot;Todas&quot; (de la
            empresa, sin sucursal).
          </p>
        )}
        <p>
          &quot;Ver detalle&quot; cambia el selector a esa sucursal y abre el Inicio. Los gastos usan el período elegido
          arriba; ventas y caja son siempre de hoy.
        </p>
      </div>
    </div>
  );
}

/** Subtítulo de "Cajas abiertas": qué sucursales no están abiertas. */
function resumenCajas(sucursales: SucursalPanel[], hoy: string) {
  const noAbiertas = sucursales.filter((s) => s.caja.estado.tipo !== "ABIERTA");
  if (noAbiertas.length === 0) return "Todas abiertas";
  if (noAbiertas.length === sucursales.length) return "Ninguna abierta";
  if (noAbiertas.length === 1) {
    const s = noAbiertas[0];
    const cierre = s.caja.ultimoCierre;
    if (cierre && fechaISOAR(new Date(cierre.fecha)) === hoy) {
      return `${s.nombre} cerró a las ${formatHoraAR(new Date(cierre.fecha))}`;
    }
    return `${s.nombre} sin abrir`;
  }
  const nombres = noAbiertas.map((s) => s.nombre);
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)} cerradas`;
}

function Kpi({ etiqueta, valor, children }: { etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="bg-topbar rounded-2xl p-5 text-ivory">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ivory/70">{etiqueta}</p>
      <p className="mt-2 font-display text-2xl font-bold tracking-[-0.02em]">{valor}</p>
      <p className="mt-1 text-xs text-ivory/70">{children}</p>
    </div>
  );
}

function TarjetaSucursal({
  sucursal: s,
  hoy,
  tituloGastos,
}: {
  sucursal: SucursalPanel;
  hoy: string;
  tituloGastos: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-5 py-4" aria-labelledby={`sucursal-${s.id}`}>
      <header className="flex items-center justify-between gap-2 pb-3">
        <h2 id={`sucursal-${s.id}`} className="truncate font-semibold text-text">
          {s.nombre}
        </h2>
        <VerDetalle sucursalId={s.id} nombre={s.nombre} />
      </header>

      <dl className="divide-y divide-border border-t border-border">
        <Fila etiqueta="Ventas de hoy">
          <p className="font-semibold text-text">{formatCurrency(s.ventasHoy.totalARS, "ARS")}</p>
          <p className="text-[11px] text-text-dim">
            {plural(s.ventasHoy.cantidad, "venta", "ventas")}
            {s.ventasHoy.cantidad > 0 && <> · ticket prom. {formatCurrency(s.ventasHoy.ticketPromedioARS, "ARS")}</>}
          </p>
        </Fila>

        <Fila etiqueta="Caja">
          <EstadoCaja estado={s.caja.estado} hoy={hoy} />
        </Fila>

        <Fila etiqueta="Último cierre">
          {s.caja.ultimoCierre ? (
            <>
              <p className="font-semibold text-text">{cuando(s.caja.ultimoCierre.fecha, hoy)}</p>
              <Diferencia valor={s.caja.ultimoCierre.diferencias} />
            </>
          ) : (
            <p className="text-text-dim">Sin cierres</p>
          )}
        </Fila>

        <Fila etiqueta="Stock bajo">
          {s.stockBajo.total === 0 ? (
            <span className={cn(BADGE, "bg-success/10 text-success")}>Sin alertas</span>
          ) : (
            <span
              className={cn(
                BADGE,
                s.stockBajo.negativos > 0 ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning"
              )}
            >
              {plural(s.stockBajo.total, "producto", "productos")}
              {s.stockBajo.negativos > 0 && ` · ${plural(s.stockBajo.negativos, "negativo", "negativos")}`}
            </span>
          )}
        </Fila>

        <Fila etiqueta={tituloGastos}>
          <p className="font-semibold text-text">{formatCurrency(s.gastos.totalARS, "ARS")}</p>
          <div
            className="ml-auto mt-1.5 h-1.5 w-16 overflow-hidden rounded-full bg-border"
            role="img"
            aria-label={`${Math.round(s.gastos.proporcion * 100)}% de los gastos de las sucursales`}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(s.gastos.proporcion * 100)}%` }} />
          </div>
        </Fila>
      </dl>
    </section>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <dt className="text-text-dim">{etiqueta}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function EstadoCaja({ estado, hoy }: { estado: EstadoCajaPanel; hoy: string }) {
  if (estado.tipo === "ABIERTA") {
    const desde = new Date(estado.desde);
    return (
      <>
        <span className={cn(BADGE, "bg-success/10 text-success")}>Abierta</span>
        <p className={cn("mt-0.5 text-[11px]", estado.desdeAyerOAntes ? "font-medium text-warning" : "text-text-dim")}>
          desde {estado.desdeAyerOAntes ? cuando(estado.desde, hoy) : formatHoraAR(desde)} · {estado.porNombre}
        </p>
      </>
    );
  }
  if (estado.tipo === "POR_ABRIR") {
    return (
      <>
        <span className={cn(BADGE, "bg-warning/15 text-warning")}>Sin abrir</span>
        <p className="mt-0.5 text-[11px] text-text-dim">se abre sola al primer uso</p>
      </>
    );
  }
  const proxima = new Date(estado.proximaApertura);
  const esHoy = fechaISOAR(proxima) === hoy;
  return (
    <>
      <span className={cn(BADGE, "bg-text-dim/10 text-text-dim")}>Cerrada</span>
      <p className="mt-0.5 text-[11px] text-text-dim">
        abre {esHoy ? "hoy" : "mañana"} {formatHoraAR(proxima)}
      </p>
    </>
  );
}

/** "Sin diferencias", "Faltante $ 2.000" o "Sobrante $ 500" (más USD si hubo). */
function Diferencia({ valor }: { valor: DiferenciasPorMoneda }) {
  const partes = (["ARS", "USD"] as const)
    .filter((m) => valor[m] !== 0)
    .map((m) => ({
      moneda: m,
      texto: `${valor[m] < 0 ? "Faltante" : "Sobrante"} ${formatCurrency(Math.abs(valor[m]), m)}`,
      clase: valor[m] < 0 ? "text-danger" : "text-success",
    }));

  if (partes.length === 0) return <p className="text-[11px] text-text-dim">Sin diferencias</p>;
  return (
    <p className="text-[11px] font-medium">
      {partes.map((p, i) => (
        <span key={p.moneda} className={p.clase}>
          {i > 0 && " · "}
          {p.texto}
        </span>
      ))}
    </p>
  );
}