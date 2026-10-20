export interface RankingModeloItem {
  modeloId: number | null; // null = producto de ropa sin modelo asociado
  nombre: string;
  cantidad: number;
  montoARS: number; // cobrado, prorrateado igual que el resto de los reportes
}

export interface RankingVarianteItem {
  valor: string; // talle o color
  cantidad: number;
  montoARS: number;
}

export interface ReporteRopaData {
  porModelo: RankingModeloItem[];
  porTalle: RankingVarianteItem[];
  porColor: RankingVarianteItem[];
  totalUnidades: number;
}