export type EstadoTransferenciaDTO = "ENVIADA" | "RECIBIDA";

export type TransferenciaDTO = {
  id: number;
  /** Número visible, propio de la empresa. */
  numero: number;
  estado: EstadoTransferenciaDTO;
  origen: { id: number; nombre: string };
  destino: { id: number; nombre: string };
  usuarioEnvio: string;
  usuarioRecepcion: string | null;
  fechaEnvio: string;
  fechaRecepcion: string | null;
  observaciones: string | null;
  items: { id: number; productoId: number; nombre: string; marca: string | null; cantidad: number }[];
  /** El usuario puede confirmar la recepción desde la sucursal en la que está. */
  puedeRecibir: boolean;
};

export type ItemTransferenciaInput = { productoId: number; cantidad: number };

export type EnviarTransferenciaInput = {
  destinoId: number;
  observaciones: string | null;
  items: ItemTransferenciaInput[];
};

export type ResultadoTransferencia<T = Record<never, never>> = ({ success: true } & T) | { success: false; error: string };