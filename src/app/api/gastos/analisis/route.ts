// app/api/gastos/analisis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularVariacion, mesAnterior, rangoDeMes, ultimosNMeses, etiquetaMes } from "@/lib/gastos-analisis";
import { obtenerEmpresaIdActual } from "@/lib/empresa";
import { obtenerConfiguracion } from "@/lib/configuracion";

interface AcumuladorCategoria {
  categoriaId: number | null;
  categoriaNombre: string;
  total: number;
  cantidad: number;
}

export async function GET(request: NextRequest) {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.habilitarFlujoCaja) {
    return NextResponse.json({ error: "Los gastos no están disponibles en tu plan actual." }, { status: 403 });
  }

  const empresaId = await obtenerEmpresaIdActual();
  const searchParams = request.nextUrl.searchParams;
  const modo = searchParams.get("modo") === "rango" ? "rango" : "mes";

  let inicioSeleccion: Date;
  let finSeleccion: Date; // exclusivo
  let anioAncla: number;
  let mesAncla: number; // 1-12, mes usado como ancla para "últimos 12 meses"

  if (modo === "mes") {
    const hoyArgStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date()); // "YYYY-MM-DD" ya en hora de Argentina
    const [hoyAnioStr, hoyMesStr] = hoyArgStr.split("-");

    const mesParam = searchParams.get("mes"); // "YYYY-MM"
    const [anioStr, mesStr] = (mesParam ?? `${hoyAnioStr}-${hoyMesStr}`).split("-");
    anioAncla = Number(anioStr);
    mesAncla = Number(mesStr);

    if (!anioAncla || !mesAncla || mesAncla < 1 || mesAncla > 12) {
      return NextResponse.json(
        { error: "Parámetro 'mes' inválido, formato esperado YYYY-MM" },
        { status: 400 }
      );
    }
    const { inicio, fin } = rangoDeMes(anioAncla, mesAncla);
    inicioSeleccion = inicio;
    finSeleccion = fin;
  } else {
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");
    if (!desdeParam || !hastaParam) {
      return NextResponse.json(
        { error: "Los parámetros 'desde' y 'hasta' son obligatorios en modo rango" },
        { status: 400 }
      );
    }
    // Antes usaba "T00:00:00.000Z" (medianoche UTC). Usamos el offset de
    // Argentina (-03:00) para que el rango sea el día real en ART.
    inicioSeleccion = new Date(`${desdeParam}T00:00:00.000-03:00`);
    const hastaDate = new Date(`${hastaParam}T00:00:00.000-03:00`);
    finSeleccion = new Date(hastaDate.getTime() + 24 * 60 * 60 * 1000);

    if (isNaN(inicioSeleccion.getTime()) || isNaN(finSeleccion.getTime()) || inicioSeleccion >= finSeleccion) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }
    anioAncla = hastaDate.getUTCFullYear();
    mesAncla = hastaDate.getUTCMonth() + 1;
  }

  // --- Gastos del período seleccionado (para comparación, torta y top5) ---
  const gastosSeleccion = await prisma.gasto.findMany({
    where: { empresaId, fecha: { gte: inicioSeleccion, lt: finSeleccion } },
    include: { categoria: { select: { id: true, nombre: true } } },
    orderBy: { fecha: "desc" },
  });

  const totalSeleccion = gastosSeleccion.reduce((acc, g) => acc + g.monto, 0);

  // --- Comparación vs mes anterior (solo aplica en modo "mes") ---
  let comparacion = null;
  if (modo === "mes") {
    const anterior = mesAnterior(anioAncla, mesAncla);
    const { inicio: inicioAnt, fin: finAnt } = rangoDeMes(anterior.anio, anterior.mes);
    const gastosAnterior = await prisma.gasto.findMany({
      where: { empresaId, fecha: { gte: inicioAnt, lt: finAnt } },
      select: { monto: true },
    });
    const totalAnterior = gastosAnterior.reduce((acc, g) => acc + g.monto, 0);

    comparacion = {
      mesAnterior: etiquetaMes(anterior.anio, anterior.mes),
      totalActual: totalSeleccion,
      totalAnterior,
      ...calcularVariacion(totalSeleccion, totalAnterior),
    };
  }

  // --- Por categoría (torta) ---
  const porCategoriaMap = new Map<string, AcumuladorCategoria>();
  for (const g of gastosSeleccion) {
    const key = g.categoria ? String(g.categoria.id) : "sin-categoria";
    const entrada = porCategoriaMap.get(key) ?? {
      categoriaId: g.categoria?.id ?? null,
      categoriaNombre: g.categoria?.nombre ?? "Sin categoría",
      total: 0,
      cantidad: 0,
    };
    entrada.total += g.monto;
    entrada.cantidad += 1;
    porCategoriaMap.set(key, entrada);
  }
  const porCategoria = Array.from(porCategoriaMap.values()).sort((a, b) => b.total - a.total);

  // --- Top 5 ---
  const top5 = [...gastosSeleccion]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)
    .map((g) => ({
      id: g.id,
      concepto: g.concepto,
      monto: g.monto,
      fecha: g.fecha,
      categoria: g.categoria?.nombre ?? "Sin categoría",
    }));

  // --- Evolución mensual + histórico: últimos 12 meses, anclados al mes/rango elegido ---
  const meses = ultimosNMeses(anioAncla, mesAncla, 12);
  const inicioVentana = rangoDeMes(meses[0].anio, meses[0].mes).inicio;
  const finVentana = rangoDeMes(meses[meses.length - 1].anio, meses[meses.length - 1].mes).fin;

  const gastosVentana = await prisma.gasto.findMany({
    where: { empresaId, fecha: { gte: inicioVentana, lt: finVentana } },
    include: { categoria: { select: { id: true, nombre: true } } },
  });

  // Mes previo al primero de la ventana, para poder calcular su variación también
  const primerMesAnt = mesAnterior(meses[0].anio, meses[0].mes);
  const { inicio: inicioPrimerAnt, fin: finPrimerAnt } = rangoDeMes(primerMesAnt.anio, primerMesAnt.mes);
  const gastosPrimerMesAnt = await prisma.gasto.findMany({
    where: { empresaId, fecha: { gte: inicioPrimerAnt, lt: finPrimerAnt } },
    select: { monto: true },
  });
  const totalPrimerMesAnt = gastosPrimerMesAnt.reduce((acc, g) => acc + g.monto, 0);

  const totalesPorMes = meses.map(({ anio, mes }) => {
    const { inicio, fin } = rangoDeMes(anio, mes);
    const gastosDeEseMes = gastosVentana.filter((g) => g.fecha >= inicio && g.fecha < fin);
    const total = gastosDeEseMes.reduce((acc, g) => acc + g.monto, 0);

    const porCategoriaMes = new Map<string, { categoriaNombre: string; total: number }>();
    for (const g of gastosDeEseMes) {
      const key = g.categoria ? String(g.categoria.id) : "sin-categoria";
      const entrada = porCategoriaMes.get(key) ?? {
        categoriaNombre: g.categoria?.nombre ?? "Sin categoría",
        total: 0,
      };
      entrada.total += g.monto;
      porCategoriaMes.set(key, entrada);
    }

    return {
      etiqueta: etiquetaMes(anio, mes),
      total,
      porCategoria: Array.from(porCategoriaMes.values()).sort((a, b) => b.total - a.total),
    };
  });

  // La misma fuente (totalesPorMes) alimenta el gráfico Y la tabla, así siempre coinciden
  const evolucionMensual = totalesPorMes.map(({ etiqueta, total }) => ({ mes: etiqueta, total }));

  const historicoMensual = totalesPorMes.map((m, i) => {
    const totalAnterior = i === 0 ? totalPrimerMesAnt : totalesPorMes[i - 1].total;
    return {
      mes: m.etiqueta,
      total: m.total,
      totalAnterior,
      ...calcularVariacion(m.total, totalAnterior),
      porCategoria: m.porCategoria,
    };
  });

  return NextResponse.json({
    periodo: {
      modo,
      inicio: inicioSeleccion.toISOString(),
      fin: new Date(finSeleccion.getTime() - 1).toISOString(),
    },
    resumen: { total: totalSeleccion, cantidadGastos: gastosSeleccion.length },
    comparacion,
    porCategoria,
    top5,
    evolucionMensual,
    historicoMensual,
  });
}