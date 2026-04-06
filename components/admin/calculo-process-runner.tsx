"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  previewCalculoProcessAction,
  previewResultadosV2Action,
  updateCalculoStatusAction,
  type CalculoPreviewResult,
  type ResultadosV2PreviewActionResult,
} from "@/app/admin/calculo/actions";

type Props = {
  periodMonth: string;
};

export function CalculoProcessRunner({ periodMonth }: Props) {
  const router = useRouter();
  function formatFixed6(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0.000000";
    return parsed.toFixed(6);
  }
  function formatNoDecimals(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0";
    return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(parsed));
  }
  function formatPercentNoDecimals(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0%";
    return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Math.round(parsed * 100))}%`;
  }
  function formatNumberGrouped(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(parsed));
  }
  function formatCurrencyGrouped(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "$0.000";
    return `$${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(parsed)}`;
  }
  function formatPercentOneDecimal(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "0.0%";
    return `${(parsed * 100).toFixed(1)}%`;
  }
  function computeCobertura(objetivo: number, resultado: number): number {
    if (objetivo === 0 && resultado === 0) return 0;
    if (objetivo === 0 && resultado > 1) return 1;
    if (resultado > 0 && objetivo > 0) {

      const cob = resultado / objetivo;
      const cobRounded = Math.round(cob * 100) / 100;

      return cobRounded
    }
    return 0;
  }

  const [isPending, startTransition] = useTransition();
  const [isExportingPreview, setIsExportingPreview] = useState(false);
  const [isExportingResultados, setIsExportingResultados] = useState(false);
  const [previewState, setPreviewState] = useState<CalculoPreviewResult | null>(null);
  const [resultadosV2State, setResultadosV2State] = useState<ResultadosV2PreviewActionResult | null>(null);
  const [wizardFeedback, setWizardFeedback] = useState<{
    kind: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const periodLabel = useMemo(() => periodMonth.slice(0, 7), [periodMonth]);
  const orderedPreviewRows = useMemo(() => {
    if (!previewState?.ok) return [];
    const rows = previewState.previewRows.slice();
    const rank = (matchMode: "exact" | "fuzzy" | "none") => {
      if (matchMode === "exact") return 0;
      if (matchMode === "fuzzy") return 1;
      return 2;
    };
    rows.sort((a, b) => {
      const rankDiff = rank(a.match_mode) - rank(b.match_mode);
      if (rankDiff !== 0) return rankDiff;
      if (a.ruta !== b.ruta) return a.ruta.localeCompare(b.ruta, "es");
      if (a.teamid !== b.teamid) return a.teamid.localeCompare(b.teamid, "es");
      if (a.plan !== b.plan) return a.plan.localeCompare(b.plan, "es");
      const brickA = (a.brick ?? "").toString();
      const brickB = (b.brick ?? "").toString();
      if (brickA !== brickB) return brickA.localeCompare(brickB, "es");
      const archivoA = (a.archivo ?? "").toString();
      const archivoB = (b.archivo ?? "").toString();
      return archivoA.localeCompare(archivoB, "es");
    });
    return rows;
  }, [previewState]);

  const groupedRows = useMemo(() => {
    const block1 = orderedPreviewRows.filter((row) => row.objective_block === "private");
    const block2 = orderedPreviewRows.filter((row) => row.objective_block === "drilldown_cuentas");
    const block3 = orderedPreviewRows.filter((row) => row.objective_block === "drilldown_estados");
    const others = orderedPreviewRows.filter((row) => row.objective_block === "otros");
    return { block1, block2, block3, others };
  }, [orderedPreviewRows]);
  type ResultadosV2Rows = Extract<ResultadosV2PreviewActionResult, { ok: true }>["rows"];
  const resultadosByRoute = useMemo(() => {
    if (!resultadosV2State?.ok) return [];
    const map = new Map<
      string,
      {
        ruta: string;
        rows: ResultadosV2Rows;
        totals: {
          objetivoValores: number;
          objetivoUnidades: number;
          actualValores: number;
          actualUnidades: number;
          resultadoValores: number;
          resultadoUnidades: number;
          valoresCount: number;
          unidadesCount: number;
          prodWeight: number;
          pagovariable: number;
          pagoresultado: number;
        };
      }
    >();

    for (const row of resultadosV2State.rows) {
      const key = row.ruta ?? "-";
      const current = map.get(key) ?? {
        ruta: key,
        rows: [],
        totals: {
          objetivoValores: 0,
          objetivoUnidades: 0,
          actualValores: 0,
          actualUnidades: 0,
          resultadoValores: 0,
          resultadoUnidades: 0,
          valoresCount: 0,
          unidadesCount: 0,
          prodWeight: 0,
          pagovariable: 0,
          pagoresultado: 0,
        },
      };
      current.rows.push(row);
      if (row.calcular_en_valores) {
        current.totals.valoresCount += 1;
        current.totals.objetivoValores += Number(row.objetivo) || 0;
        current.totals.actualValores += Number(row.actual) || 0;
        current.totals.resultadoValores += Number(row.resultado) || 0;
      } else {
        current.totals.unidadesCount += 1;
        current.totals.objetivoUnidades += Number(row.objetivo) || 0;
        current.totals.actualUnidades += Number(row.actual) || 0;
        current.totals.resultadoUnidades += Number(row.resultado) || 0;
      }
      current.totals.prodWeight += Number(row.prod_weight) || 0;
      current.totals.pagovariable += Number(row.pagovariable) || 0;
      current.totals.pagoresultado += Number(row.pagoresultado) || 0;
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => a.ruta.localeCompare(b.ruta, "es"));
  }, [resultadosV2State]);
  const productSummaryRows = useMemo(() => {
    const summaryMap = new Map<string, { plan: string; objetivo: number; resultado: number }>();
    for (const row of orderedPreviewRows) {
      const plan = row.plan ?? "-";
      const current = summaryMap.get(plan) ?? { plan, objetivo: 0, resultado: 0 };
      current.objetivo += Number(row.objetivo) || 0;
      current.resultado += Number(row.resultado) || 0;
      summaryMap.set(plan, current);
    }
    return Array.from(summaryMap.values())
      .map((row) => ({
        ...row,
        cobertura: computeCobertura(row.objetivo, row.resultado),
      }))
      .sort((a, b) => a.plan.localeCompare(b.plan, "es"));
  }, [orderedPreviewRows]);

  function formatMixedTotal(valuesAmount: number, unitsAmount: number, valuesCount: number, unitsCount: number): string {
    if (valuesCount > 0 && unitsCount > 0) {
      return `${formatCurrencyGrouped(valuesAmount)} + ${formatNumberGrouped(unitsAmount)}`;
    }
    if (valuesCount > 0) return formatCurrencyGrouped(valuesAmount);
    return formatNumberGrouped(unitsAmount);
  }

  function countByMatch(rows: typeof orderedPreviewRows) {
    let exact = 0;
    let fuzzy = 0;
    let none = 0;
    for (const row of rows) {
      if (row.match_mode === "exact") exact += 1;
      else if (row.match_mode === "fuzzy") fuzzy += 1;
      else none += 1;
    }
    return { exact, fuzzy, none };
  }

  function renderPreviewTable(
    title: string,
    rows: typeof orderedPreviewRows,
    emptyLabel: string,
  ) {
    const stats = countByMatch(rows);
    const exactRows = rows.filter((row) => row.match_mode === "exact");
    const fuzzyRows = rows.filter((row) => row.match_mode === "fuzzy");
    const noneRows = rows.filter((row) => row.match_mode === "none");

    function renderMatchSubtable(
      matchTitle: string,
      subRows: typeof orderedPreviewRows,
      defaultOpen = false,
    ) {
      return (
        <details className="mt-2 rounded border border-neutral-200" open={defaultOpen}>
          <summary className="cursor-pointer select-none bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-700">
            {matchTitle} ({subRows.length})
          </summary>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-neutral-700">
              <thead>
                <tr className="border-b border-neutral-200 text-left uppercase tracking-wide text-neutral-500">
                  <th className="px-2 py-1">Ruta</th>
                  <th className="px-2 py-1">Team</th>
                  <th className="px-2 py-1">Plan</th>
                  <th className="px-2 py-1">Plan type</th>
                  <th className="px-2 py-1">Brick</th>
                  <th className="px-2 py-1">Archivo</th>
                  <th className="px-2 py-1">Molecula</th>
                  <th className="px-2 py-1">Objetivo</th>
                  <th className="px-2 py-1">Valor</th>
                  <th className="px-2 py-1">Resultado</th>
                  <th className="px-2 py-1">Cobertura</th>
                  <th className="px-2 py-1">No match reason</th>
                </tr>
              </thead>
              <tbody>
                {subRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-2 py-3 text-neutral-500">
                      Sin filas en este grupo.
                    </td>
                  </tr>
                ) : (
                  subRows.map((row, index) => (
                    <tr key={`${matchTitle}-${row.ruta}-${row.teamid}-${row.plan}-${row.brick ?? "global"}-${index}`} className="border-b border-neutral-100">
                      <td className="px-2 py-1">{row.ruta}</td>
                      <td className="px-2 py-1">{row.teamid}</td>
                      <td className="px-2 py-1">{row.plan}</td>
                      <td className="px-2 py-1">{row.plan_type_name ?? "-"}</td>
                      <td className="px-2 py-1">{row.brick ?? "-"}</td>
                      <td className="px-2 py-1">{row.archivo ?? "-"}</td>
                      <td className="px-2 py-1">{row.molecula_producto ?? "-"}</td>
                      <td className="px-2 py-1">{formatFixed6(row.objetivo)}</td>
                      <td className="px-2 py-1">{formatFixed6(row.valor)}</td>
                      <td className="px-2 py-1">{formatFixed6(row.resultado)}</td>
                      <td className="px-2 py-1">{formatFixed6((row as { cobertura?: number }).cobertura)}</td>
                      <td className="px-2 py-1">{row.match_mode === "none" ? (row.none_reason ?? "unknown") : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </details>
      );
    }

    return (
      <details className="mt-4 rounded-lg border border-emerald-200 bg-white">
        <summary className="cursor-pointer select-none border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {title} ({rows.length}) | exact: {stats.exact} | fuzzy: {stats.fuzzy} | none: {stats.none}
        </summary>
        <div className="p-2">
          {rows.length === 0 ? (
            <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-3 text-xs text-neutral-500">
              {emptyLabel}
            </div>
          ) : (
            <>
              {renderMatchSubtable("Exact", exactRows, true)}
              {renderMatchSubtable("Fuzzy", fuzzyRows)}
              {renderMatchSubtable("None", noneRows)}
            </>
          )}
        </div>
      </details>
    );
  }

  function runPreview() {
    setPreviewState(null);
    setWizardFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("period_month", periodMonth);
      const response = await previewCalculoProcessAction(null, formData);
      setPreviewState(response);
      setWizardFeedback({
        kind: response.ok ? "success" : "error",
        message: response.message,
      });
    });
  }

  function runCalculate() {
    setResultadosV2State(null);
    setWizardFeedback(null);
    startTransition(async () => {
      const calculateFormData = new FormData();
      calculateFormData.append("period_month", periodMonth);
      calculateFormData.append("action", "calcular");
      const calculateResponse = await updateCalculoStatusAction(null, calculateFormData);
      if (!calculateResponse.ok) {
        setWizardFeedback({ kind: "error", message: calculateResponse.message });
        return;
      }

      const preview2FormData = new FormData();
      preview2FormData.append("period_month", periodMonth);
      const preview2Response = await previewResultadosV2Action(null, preview2FormData);
      setResultadosV2State(preview2Response);
      setWizardFeedback({
        kind: preview2Response.ok ? "success" : "error",
        message: preview2Response.message,
      });
    });
  }

  function confirmStage12() {
    setWizardFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("period_month", periodMonth);
      formData.append("action", "confirmar_precalculo");
      const response = await updateCalculoStatusAction(null, formData);
      if (response.ok) {
        router.refresh();
        setWizardFeedback({
          kind: "success",
          message: `${response.message} Puedes ir a /admin/calculo para validar estatus y resultados.`,
        });
        return;
      }
      setWizardFeedback({ kind: "error", message: response.message });
    });
  }

  async function exportPreviewExcel() {
    if (!previewState?.ok) return;
    setIsExportingPreview(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const buildSheetRows = (rows: typeof orderedPreviewRows) => rows.map((row) => ({
        Ruta: row.ruta,
        Team: row.teamid,
        Plan: row.plan,
        PlanType: row.plan_type_name ?? "",
        Archivo: row.archivo ?? "",
        Molecula: row.molecula_producto ?? "",
        Brick: row.brick ?? "",
        Objetivo: Number(row.objetivo) || 0,
        Valor: Number(row.valor) || 0,
        Resultado: Number(row.resultado) || 0,
        Cobertura: Number((row as { cobertura?: number }).cobertura) || 0,
        MatchMode: row.match_mode,
        NoMatchReason: row.none_reason ?? "",
        MatchedRows: Number((row as { matched_rows_count?: number }).matched_rows_count) || 0,
        ValorIMSS: Number((row as { valor_imss?: number }).valor_imss) || 0,
        ValorISSSTE: Number((row as { valor_issste?: number }).valor_issste) || 0,
      }));

      const summarySheet = XLSX.utils.json_to_sheet(
        productSummaryRows.map((row) => ({
          Producto: row.plan,
          Objetivo: Number(row.objetivo) || 0,
          Resultado: Number(row.resultado) || 0,
          Cobertura: Number(row.cobertura) || 0,
        })),
      );
      const block1Sheet = XLSX.utils.json_to_sheet(buildSheetRows(groupedRows.block1));
      const block2Sheet = XLSX.utils.json_to_sheet(buildSheetRows(groupedRows.block2));
      const block3Sheet = XLSX.utils.json_to_sheet(buildSheetRows(groupedRows.block3));
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen Producto");
      XLSX.utils.book_append_sheet(workbook, block1Sheet, "Bloque 1 Privados");
      XLSX.utils.book_append_sheet(workbook, block2Sheet, "Bloque 2 Cuentas");
      XLSX.utils.book_append_sheet(workbook, block3Sheet, "Bloque 3 Estados");

      const safePeriod = periodLabel.replace(/[^0-9A-Za-z_-]/g, "-");
      XLSX.writeFile(workbook, `Asignacion y Cuotas_${safePeriod}.xlsx`);
    } finally {
      setIsExportingPreview(false);
    }
  }

  async function exportResultadosExcel() {
    if (!resultadosV2State?.ok) return;
    setIsExportingResultados(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const detailRows = resultadosByRoute.flatMap((group) => group.rows.map((row) => ({
        Ruta: row.ruta,
        TerritorioIndividual: row.ruta,
        Team: row.team_id,
        NoEmpleado: row.empleado ?? "",
        Nombre: row.nombre ?? "",
        Manager: row.manager ?? "",
        Linea: row.linea ?? "",
        Representante: row.representante ?? "",
        ProductName: row.product_name,
        PlanType: row.plan_type_name ?? "",
        CalcularEnValores: row.calcular_en_valores ? "Si" : "No",
        Agrupador: row.agrupador ?? "",
        Elemento: row.elemento ?? "",
        Objetivo: Number(row.objetivo) || 0,
        Valor: Number(row.actual) || 0,
        Resultado: Number(row.resultado) || 0,
        Cobertura: Number(row.cobertura) || 0,
        CoberturaPago: Number(row.coberturapago) || 0,
        CurvaPago: row.curva_pago ?? "",
        Parrilla: Number(row.prod_weight) || 0,
        PV: Number(row.pagovariable) || 0,
        PR: Number(row.pagoresultado) || 0,
        Garantia: row.garantia ? "Si" : "No",
      })));
      const totalsRows = resultadosByRoute.map((group) => ({
        Ruta: group.ruta,
        Objetivo: formatMixedTotal(
          group.totals.objetivoValores,
          group.totals.objetivoUnidades,
          group.totals.valoresCount,
          group.totals.unidadesCount,
        ),
        Valor: formatMixedTotal(
          group.totals.actualValores,
          group.totals.actualUnidades,
          group.totals.valoresCount,
          group.totals.unidadesCount,
        ),
        Resultado: formatMixedTotal(
          group.totals.resultadoValores,
          group.totals.resultadoUnidades,
          group.totals.valoresCount,
          group.totals.unidadesCount,
        ),
        Parrilla: Number(group.totals.prodWeight) || 0,
        PV: Number(group.totals.pagovariable) || 0,
        PR: Number(group.totals.pagoresultado) || 0,
      }));
      const groupingRows = resultadosV2State.grouping_details
        .filter((row) => row.calcular_en_valores)
        .map((row) => ({
          Ruta: row.ruta,
          Team: row.team_id,
          PlanType: row.plan_type_name ?? "",
          Agrupador: row.agrupador ?? "",
          ProductoOrigen: row.product_name_origen,
          ProductoFinal: row.product_name_final,
          FueAgrupado: row.fue_agrupado ? "Si" : "No",
          Brick: row.brick ?? "",
          Molecula: row.molecula ?? "",
          PrecioPromedio: Number(row.precio_promedio) || 0,
          ProdWeight: Number(row.prod_weight) || 0,
          Objetivo: Number(row.objetivo_unidades) || 0,
          Resultado: Number(row.resultado_unidades) || 0,
          ObjetivoDinero: Number(row.objetivo_dinero) || 0,
          ResultadoDinero: Number(row.resultado_dinero) || 0,
          ValorDinero: Number(row.actual_dinero) || 0,
          Cobertura: Number(row.cobertura) || 0,
        }));
      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      const totalsSheet = XLSX.utils.json_to_sheet(totalsRows);
      const groupingSheet = XLSX.utils.json_to_sheet(groupingRows);
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Resultados V2");
      XLSX.utils.book_append_sheet(workbook, totalsSheet, "Totales Ruta");
      XLSX.utils.book_append_sheet(workbook, groupingSheet, "Detalle Agrupacion");
      const safePeriod = periodLabel.replace(/[^0-9A-Za-z_-]/g, "-");
      XLSX.writeFile(workbook, `Resultados_${safePeriod}.xlsx`);
    } finally {
      setIsExportingResultados(false);
    }
  }

  function resetWizard() {
    setPreviewState(null);
    setResultadosV2State(null);
    setWizardFeedback(null);
  }

  function runWizardNextStep() {
    if (!previewState?.ok) {
      runPreview();
      return;
    }
    if (!resultadosV2State?.ok) {
      runCalculate();
      return;
    }
    confirmStage12();
  }

  const previewCompleted = previewState?.ok === true;
  const calculateCompleted = resultadosV2State?.ok === true;
  const activeStep = previewCompleted ? (calculateCompleted ? 3 : 2) : 1;
  const continueLabel = activeStep === 1
    ? "Continuar: Paso 1 (Preview)"
    : activeStep === 2
      ? "Continuar: Paso 2 (Calcular)"
      : "Continuar: Paso 3 (Confirmar)";
  const previewStepClass = previewCompleted
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : activeStep === 1
      ? "border-blue-300 bg-blue-50 text-blue-900"
      : "border-neutral-200 bg-white text-neutral-500";
  const calculateStepClass = calculateCompleted
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : activeStep === 2
      ? "border-blue-300 bg-blue-50 text-blue-900"
      : "border-neutral-200 bg-white text-neutral-500";
  const confirmStepClass = activeStep === 3
    ? "border-blue-300 bg-blue-50 text-blue-900"
    : "border-neutral-200 bg-white text-neutral-500";

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex justify-end">
        <Link
          href="/admin/calculo"
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Volver a calculo
        </Link>
      </div>
      <p className="text-sm text-neutral-600">
        Periodo: <span className="font-semibold text-neutral-900">{periodLabel}</span>
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Previsualiza la información obtenida para el periodo seleccionado.
      </p>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="grid gap-2 md:grid-cols-3">
          <div className={`rounded-xl border p-3 text-xs ${previewStepClass}`}>
            <p className="font-semibold">Paso 1: Preview</p>
            <p className="mt-1">Valida datos sin escribir resultados.</p>
          </div>
          <div className={`rounded-xl border p-3 text-xs ${calculateStepClass}`}>
            <p className="font-semibold">Paso 2: Calcular</p>
            <p className="mt-1">Ejecuta el calculo y arma resultados_v2.</p>
          </div>
          <div className={`rounded-xl border p-3 text-xs ${confirmStepClass}`}>
            <p className="font-semibold">Paso 3: Confirmar</p>
            <p className="mt-1">Confirma precalculo y regresa al listado una vez completado.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runWizardNextStep}
            disabled={isPending}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Procesando..." : continueLabel}
          </button>
          <button
            type="button"
            onClick={resetWizard}
            disabled={isPending}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-60"
          >
            Reiniciar flujo
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/calculo")}
            disabled={isPending}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-60"
          >
            Ir a calculo
          </button>
        </div>
        {wizardFeedback ? (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-xs ${wizardFeedback.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : wizardFeedback.kind === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
              }`}
          >
            {wizardFeedback.message}
          </p>
        ) : null}
      </div>

      {resultadosV2State ? (
        <div className={`mt-4 rounded-2xl border p-4 text-sm ${resultadosV2State.ok ? "border-blue-200 bg-blue-50 text-blue-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{resultadosV2State.message}</p>
            {resultadosV2State.ok ? (
              <button
                type="button"
                onClick={exportResultadosExcel}
                disabled={isExportingResultados || isPending}
                className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-60"
              >
                {isExportingResultados ? "Exportando..." : "Exportar a Excel"}
              </button>
            ) : null}
          </div>
          {resultadosV2State.ok ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs text-neutral-700">
                <thead>
                  <tr className="border-b border-neutral-200 text-left uppercase tracking-wide text-neutral-500">
                    <th className="px-2 py-1">Ruta</th>
                    <th className="px-2 py-1">Team</th>
                    <th className="px-2 py-1">Product_Name</th>
                    <th className="px-2 py-1">Plan type</th>
                    <th className="px-2 py-1">Objetivo</th>
                    <th className="px-2 py-1">Valor</th>
                    <th className="px-2 py-1">Resultado</th>
                    <th className="px-2 py-1">Cob</th>
                    <th className="px-2 py-1">Cob Pago</th>
                    <th className="px-2 py-1">Parrilla %</th>
                    <th className="px-2 py-1">PV</th>
                    <th className="px-2 py-1">PR</th>
                    <th className="px-2 py-1">Garantia</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosV2State.rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-2 py-3 text-neutral-500">
                        Sin filas para resultados_v2.
                      </td>
                    </tr>
                  ) : (
                    resultadosByRoute.map((routeGroup, routeIndex) => (
                      <Fragment key={`${routeGroup.ruta}-${routeIndex}`}>
                        <tr className="border-y border-blue-200 bg-blue-100/70">
                          <td colSpan={13} className="px-2 py-1 text-[11px] font-semibold text-blue-900">
                            Ruta: {routeGroup.ruta}
                          </td>
                        </tr>
                        {routeGroup.rows.map((row, index) => (
                          <tr key={`${row.ruta}-${row.team_id}-${row.product_name}-${index}`} className="border-b border-neutral-100">
                            <td className="px-2 py-1">{row.ruta}</td>
                            <td className="px-2 py-1">{row.team_id}</td>
                            <td className="px-2 py-1">{row.product_name}</td>
                            <td className="px-2 py-1">{row.plan_type_name ?? "-"}</td>
                            <td className="px-2 py-1">
                              {row.calcular_en_valores ? formatCurrencyGrouped(row.objetivo) : formatNumberGrouped(row.objetivo)}
                            </td>
                            <td className="px-2 py-1">
                              {row.calcular_en_valores ? formatCurrencyGrouped(row.actual) : formatNumberGrouped(row.actual)}
                            </td>
                            <td className="px-2 py-1">
                              {row.calcular_en_valores ? formatCurrencyGrouped(row.resultado) : formatNumberGrouped(row.resultado)}
                            </td>
                            <td className="px-2 py-1">{formatPercentOneDecimal(row.cobertura)}</td>
                            <td className="px-2 py-1">{formatPercentOneDecimal(row.coberturapago)}</td>
                            <td className="px-2 py-1">{formatPercentOneDecimal(row.prod_weight)}</td>
                            <td className="px-2 py-1">{formatCurrencyGrouped(row.pagovariable)}</td>
                            <td className="px-2 py-1">{formatCurrencyGrouped(row.pagoresultado)}</td>
                            <td className="px-2 py-1">{row.garantia ? "Si" : "No"}</td>
                          </tr>
                        ))}
                        <tr className="border-y border-blue-200 bg-blue-50 font-semibold text-blue-900">
                          <td className="px-2 py-1">Total ruta</td>
                          <td className="px-2 py-1">-</td>
                          <td className="px-2 py-1">-</td>
                          <td className="px-2 py-1">-</td>
                          <td className="px-2 py-1">
                            {formatMixedTotal(
                              routeGroup.totals.objetivoValores,
                              routeGroup.totals.objetivoUnidades,
                              routeGroup.totals.valoresCount,
                              routeGroup.totals.unidadesCount,
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {formatMixedTotal(
                              routeGroup.totals.actualValores,
                              routeGroup.totals.actualUnidades,
                              routeGroup.totals.valoresCount,
                              routeGroup.totals.unidadesCount,
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {formatMixedTotal(
                              routeGroup.totals.resultadoValores,
                              routeGroup.totals.resultadoUnidades,
                              routeGroup.totals.valoresCount,
                              routeGroup.totals.unidadesCount,
                            )}
                          </td>
                          <td className="px-2 py-1">-</td>
                          <td className="px-2 py-1">-</td>
                          <td className="px-2 py-1">{formatPercentOneDecimal(routeGroup.totals.prodWeight)}</td>
                          <td className="px-2 py-1">{formatCurrencyGrouped(routeGroup.totals.pagovariable)}</td>
                          <td className="px-2 py-1">{formatCurrencyGrouped(routeGroup.totals.pagoresultado)}</td>
                          <td className="px-2 py-1">{Math.abs(routeGroup.totals.prodWeight - 1) <= 0.01 ? "OK" : "Revisar"}</td>
                        </tr>
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {previewState ? (
        <div className={`mt-4 rounded-2xl border p-4 text-sm ${previewState.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{previewState.message}</p>
            {previewState.ok ? (
              <button
                type="button"
                onClick={exportPreviewExcel}
                disabled={isExportingPreview || isPending}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
              >
                {isExportingPreview ? "Exportando..." : "Exportar a Excel"}
              </button>
            ) : null}
          </div>
          {previewState.ok ? (
            <div className="mt-3">
              <details className="rounded-lg border border-emerald-200 bg-white" open>
                <summary className="cursor-pointer select-none border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                  Tabla resumen por producto ({productSummaryRows.length})
                </summary>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-neutral-700">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left uppercase tracking-wide text-neutral-500">
                        <th className="px-2 py-1">Product name</th>
                        <th className="px-2 py-1">Sum objetivo</th>
                        <th className="px-2 py-1">Sum resultado</th>
                        <th className="px-2 py-1">Cobertura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSummaryRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-2 py-3 text-neutral-500">
                            Sin filas para resumir.
                          </td>
                        </tr>
                      ) : (
                        productSummaryRows.map((row) => (
                          <tr key={row.plan} className="border-b border-neutral-100">
                            <td className="px-2 py-1">{row.plan}</td>
                            <td className="px-2 py-1">{formatNoDecimals(row.objetivo)}</td>
                            <td className="px-2 py-1">{formatNoDecimals(row.resultado)}</td>
                            <td className="px-2 py-1">{formatPercentNoDecimals(row.cobertura)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="mb-2 text-xs text-emerald-900">
                Mostrando primero filas con match (`exact` y `fuzzy`) y al final las de `none`.
              </p>
              {renderPreviewTable(
                "Bloque 1: Objetivos de Archivo Objetivos Privados",
                groupedRows.block1,
                "Sin filas de objetivos privados.",
              )}
              {renderPreviewTable(
                "Bloque 2: Drill Down Cuotas (plan_type_name = Cuenta/Cuentas)",
                groupedRows.block2,
                "Sin filas de Drill Down tipo Cuenta/Cuentas.",
              )}
              {renderPreviewTable(
                "Bloque 3: Drill Down Cuotas (plan_type_name = Estado/Estados)",
                groupedRows.block3,
                "Sin filas de Drill Down tipo Estado/Estados.",
              )}
              {groupedRows.others.length > 0
                ? renderPreviewTable(
                  "Otros plan_type_name en Drill Down",
                  groupedRows.others,
                  "Sin filas en otros tipos.",
                )
                : null}
            </div>
          ) : null}
        </div>
      ) : null}

    </section>
  );
}
