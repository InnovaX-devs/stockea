"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { listarPedidos } from "../actions";
import { CardPedido } from "@/components/ventas/card-pedido";
import type { FiltrosPedidos, PedidoListItem } from "@/types/venta";
import Select from "@/components/ui/select";
import { RangoFechas } from "@/components/ui/rango-fechas";

const FILTROS_INICIALES: FiltrosPedidos = {
  clienteTexto: "",
  fechaDesde: null,
  fechaHasta: null,
  orden: "MAS_NUEVO",
  sinCobrar: false,
  sinArmar: false,
  sinEnviar: false,
  sinRetirar: false,
};

type FiltroToggle = "sinCobrar" | "sinArmar" | "sinEnviar" | "sinRetirar";

const TOGGLES: { label: string; key: FiltroToggle }[] = [
  { label: "Sin cobrar", key: "sinCobrar" },
  { label: "Sin armar", key: "sinArmar" },
  { label: "Sin retirar", key: "sinRetirar" },
];

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [filtros, setFiltros] = useState<FiltrosPedidos>(FILTROS_INICIALES);
  const [clienteInput, setClienteInput] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => ({ ...f, clienteTexto: clienteInput }));
    }, 350);
    return () => clearTimeout(t);
  }, [clienteInput]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const resultado = await listarPedidos(filtros);
    setPedidos(resultado.pedidos);
    setCargando(false);
  }, [filtros]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function toggleFiltro(key: FiltroToggle) {
    setFiltros((f) => ({ ...f, [key]: !f[key] }));
  }

  // Columnas: excluyentes entre sí, según las banderas booleanas.
  const porArmar = pedidos.filter((p) => !p.armado);
  const pendienteEnvio = pedidos.filter((p) => p.armado && p.enviado && !p.retirado);
  const pendienteRetirar = pedidos.filter((p) => p.armado && !p.retirado);

  return (
    <div className="p-4 space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text sm:text-2xl">Pedidos</h1>
        <p className="text-sm text-text-dim">Tablero de preparación y entrega</p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <RangoFechas
            desde={filtros.fechaDesde}
            hasta={filtros.fechaHasta}
            onCambiar={(fechaDesde, fechaHasta) => setFiltros((f) => ({ ...f, fechaDesde, fechaHasta }))}
          />
          <Select
            value={filtros.orden}
            onChange={(v) => setFiltros((f) => ({ ...f, orden: v as "MAS_NUEVO" | "MAS_VIEJO" }))}
            options={[
              { value: "MAS_NUEVO", label: "Más nuevo primero" },
              { value: "MAS_VIEJO", label: "Más viejo primero" },
            ]}
            className="w-48"
          />
        </div>
      </div>

      {/* Columnas */}
      {cargando ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-text-dim">
          Cargando...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Columna
            titulo="Por armar"
            subtitulo="Recibidos y pendientes de preparar"
            color="amber"
            pedidos={porArmar}
            onCambio={cargar}
          />
          <Columna
            titulo="Pendiente de retirar"
            subtitulo="Armados — esperando que el cliente retire"
            color="success"
            pedidos={pendienteRetirar}
            onCambio={cargar}
          />
        </div>
      )}
    </div>
  );
}

const ESTILOS_COLUMNA = {
  amber: { fondo: "bg-warning/10/40", punto: "bg-[#8a5a00]", texto: "text-warning" },
  primary: { fondo: "bg-surface-hover/40", punto: "bg-primary", texto: "text-primary" },
  success: { fondo: "bg-success/10/60", punto: "bg-success", texto: "text-success" },
} as const;

function Columna({
  titulo,
  subtitulo,
  color,
  pedidos,
  onCambio,
}: {
  titulo: string;
  subtitulo: string;
  color: keyof typeof ESTILOS_COLUMNA;
  pedidos: PedidoListItem[];
  onCambio: () => void;
}) {
  const estilo = ESTILOS_COLUMNA[color];
  return (
    <div className={cn("rounded-2xl border border-border p-3", estilo.fondo)}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", estilo.punto)} />
        <h2 className={cn("font-semibold", estilo.texto)}>{titulo}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-text-dim">
          {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className={cn("mb-3 text-xs", estilo.texto)}>{subtitulo}</p>

      <div className="space-y-2 lg:max-h-[600px] lg:overflow-y-auto">
        {pedidos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
            No hay pedidos acá 🎉
          </div>
        ) : (
          pedidos.map((p) => <CardPedido key={p.id} pedido={p} onCambio={onCambio} />)
        )}
      </div>
    </div>
  );
}