import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";

type BigQueryAprobarRow = {
  team_id: string | null;
  plan_type_name: string | null;
  product_name: string | null;
  prod_weight: number | null;
  agrupador: string | null;
  garantia: boolean | null;
  elemento: string | null;
  ruta: string | null;
  representante: string | null;
  actual: number | null;
  resultado: number | null;
  objetivo: number | null;
  cobertura: number | null;
  pagovariable: number | null;
  coberturapago: number | null;
  nombre: string | null;
  linea: string | null;
  manager: string | null;
  empleado: number | null;
  pagoresultado: number | null;
  periodo: string | null;
  ajuste_delta_total: number | null;
  pagoresultado_ajustado: number | null;
  ajuste_kinds: string | null;
  ajuste_comments: string | null;
};

const EMPTY_PRODUCT_KEY = "__SIN_PRODUCTO__";

type BigQuerySummaryRow = {
  rows_count: number | null;
  total_pagoresultado_original: number | null;
  total_ajuste_delta: number | null;
  total_pagoresultado_ajustado: number | null;
};

type BigQueryAdjustmentRow = {
  adjustment_id: string | null;
  ruta: string | null;
  product_name: string | null;
  kind: string | null;
  delta_pagoresultado: number | null;
  comment: string | null;
  updated_at: string | null;
};

export type AprobarPreviewRow = {
  teamId: string;
  planTypeName: string | null;
  productName: string;
  prodWeight: number;
  agrupador: string | null;
  garantia: boolean;
  elemento: string | null;
  ruta: string;
  representante: string | null;
  actual: number;
  resultado: number;
  objetivo: number;
  cobertura: number;
  pagoVariable: number;
  coberturaPago: number;
  nombre: string | null;
  linea: string | null;
  manager: string | null;
  empleado: number | null;
  pagoResultadoOriginal: number;
  ajusteDelta: number;
  pagoResultadoAjustado: number;
  ajusteKinds: string | null;
  ajusteComments: string | null;
  periodo: string;
};

export type AprobarPreviewAdjustment = {
  adjustmentId: string;
  ruta: string;
  productName: string;
  kind: string;
  deltaPagoResultado: number;
  comment: string | null;
  updatedAt: string | null;
};

export type AprobarPreviewData = {
  rows: AprobarPreviewRow[];
  adjustments: AprobarPreviewAdjustment[];
  summary: {
    rowsCount: number;
    totalPagoVariable: number;
    totalPagoResultadoOriginal: number;
    totalAjusteDelta: number;
    totalPagoResultadoAjustado: number;
  };
  message: string | null;
};

function toPeriodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

export async function getAprobarPreviewData(periodMonth: string): Promise<AprobarPreviewData> {
  if (!isBigQueryConfigured()) {
    return {
      rows: [],
      adjustments: [],
      summary: {
        rowsCount: 0,
        totalPagoVariable: 0,
        totalPagoResultadoOriginal: 0,
        totalAjusteDelta: 0,
        totalPagoResultadoAjustado: 0,
      },
      message: "BigQuery no configurado para cargar resultados.",
    };
  }

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) {
    return {
      rows: [],
      adjustments: [],
      summary: {
        rowsCount: 0,
        totalPagoVariable: 0,
        totalPagoResultadoOriginal: 0,
        totalAjusteDelta: 0,
        totalPagoResultadoAjustado: 0,
      },
      message: "Falta GCP_PROJECT_ID para cargar resultados.",
    };
  }

  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const resultsTableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const adjustmentsTableId = process.env.BQ_RESULTS_ADJUSTMENTS_TABLE?.trim() || "resultados_v2_ajustes";
  const resultsTableRef = `\`${projectId}.${datasetId}.${resultsTableId}\``;
  const adjustmentsTableRef = `\`${projectId}.${datasetId}.${adjustmentsTableId}\``;
  const periodo = toPeriodCode(periodMonth);
  const stage = "precalculo";

  const [rows, summaryRows, adjustmentsRows] = await Promise.all([
    fetchBigQueryRows<BigQueryAprobarRow>({
      query: `
        WITH ajustes AS (
          SELECT
            periodo,
            TRIM(ruta) AS ruta,
            UPPER(TRIM(ruta)) AS ruta_key,
            COALESCE(NULLIF(UPPER(TRIM(product_name)), ''), @empty_product_key) AS product_name_key,
            ANY_VALUE(TRIM(product_name)) AS product_name_display,
            SUM(IFNULL(delta_pagoresultado, 0)) AS ajuste_delta_total,
            STRING_AGG(DISTINCT kind, '; ' ORDER BY kind) AS ajuste_kinds,
            STRING_AGG(comment, ' | ' ORDER BY updated_at DESC) AS ajuste_comments
          FROM ${adjustmentsTableRef}
          WHERE periodo = @periodo
            AND stage = @stage
            AND is_active = TRUE
          GROUP BY
            periodo,
            TRIM(ruta),
            UPPER(TRIM(ruta)),
            COALESCE(NULLIF(UPPER(TRIM(product_name)), ''), @empty_product_key)
        ),
        base AS (
          SELECT
            periodo,
            team_id,
            plan_type_name,
            product_name,
            TRIM(ruta) AS ruta,
            UPPER(TRIM(ruta)) AS ruta_key,
            COALESCE(NULLIF(UPPER(TRIM(product_name)), ''), @empty_product_key) AS product_name_key,
            prod_weight,
            agrupador,
            garantia,
            elemento,
            representante,
            actual,
            resultado,
            objetivo,
            cobertura,
            pagovariable,
            coberturapago,
            nombre,
            linea,
            manager,
            empleado,
            pagoresultado
          FROM ${resultsTableRef}
          WHERE periodo = @periodo
        )
        SELECT
          b.team_id,
          b.plan_type_name,
          CASE
            WHEN b.product_name IS NOT NULL AND TRIM(b.product_name) <> '' THEN b.product_name
            WHEN a.product_name_display IS NOT NULL AND TRIM(a.product_name_display) <> '' THEN a.product_name_display
            WHEN COALESCE(a.product_name_key, b.product_name_key) = @empty_product_key THEN ''
            ELSE COALESCE(a.product_name_key, b.product_name_key)
          END AS product_name,
          IFNULL(b.prod_weight, 0) AS prod_weight,
          b.agrupador,
          IFNULL(b.garantia, FALSE) AS garantia,
          b.elemento,
          COALESCE(b.ruta, a.ruta) AS ruta,
          b.representante,
          IFNULL(b.actual, 0) AS actual,
          IFNULL(b.resultado, 0) AS resultado,
          IFNULL(b.objetivo, 0) AS objetivo,
          IFNULL(b.cobertura, 0) AS cobertura,
          IFNULL(b.pagovariable, 0) AS pagovariable,
          IFNULL(b.coberturapago, 0) AS coberturapago,
          b.nombre,
          b.linea,
          b.manager,
          b.empleado,
          IFNULL(b.pagoresultado, 0) AS pagoresultado,
          COALESCE(b.periodo, a.periodo) AS periodo,
          IFNULL(a.ajuste_delta_total, 0) AS ajuste_delta_total,
          IFNULL(b.pagoresultado, 0) + IFNULL(a.ajuste_delta_total, 0) AS pagoresultado_ajustado,
          a.ajuste_kinds,
          a.ajuste_comments
        FROM base b
        FULL OUTER JOIN ajustes a
          ON a.periodo = b.periodo
          AND a.ruta_key = b.ruta_key
          AND a.product_name_key = b.product_name_key
        WHERE COALESCE(b.periodo, a.periodo) = @periodo
        ORDER BY COALESCE(b.ruta, a.ruta) ASC, b.team_id ASC, product_name ASC
      `,
      parameters: [
        { name: "periodo", type: "STRING", value: periodo },
        { name: "stage", type: "STRING", value: stage },
        { name: "empty_product_key", type: "STRING", value: EMPTY_PRODUCT_KEY },
      ],
    }),
    fetchBigQueryRows<BigQuerySummaryRow>({
      query: `
        WITH ajustes AS (
          SELECT
            periodo,
            UPPER(TRIM(ruta)) AS ruta_key,
            COALESCE(NULLIF(UPPER(TRIM(product_name)), ''), @empty_product_key) AS product_name_key,
            SUM(IFNULL(delta_pagoresultado, 0)) AS ajuste_delta_total
          FROM ${adjustmentsTableRef}
          WHERE periodo = @periodo
            AND stage = @stage
            AND is_active = TRUE
          GROUP BY
            periodo,
            UPPER(TRIM(ruta)),
            COALESCE(NULLIF(UPPER(TRIM(product_name)), ''), @empty_product_key)
        ),
        base AS (
          SELECT
            periodo,
            UPPER(TRIM(ruta)) AS ruta_key,
            COALESCE(NULLIF(UPPER(TRIM(product_name)), ''), @empty_product_key) AS product_name_key,
            pagoresultado
          FROM ${resultsTableRef}
          WHERE periodo = @periodo
        ),
        merged AS (
          SELECT
            COALESCE(b.periodo, a.periodo) AS periodo,
            COALESCE(b.ruta_key, a.ruta_key) AS ruta_key,
            COALESCE(b.product_name_key, a.product_name_key) AS product_name_key,
            IFNULL(b.pagoresultado, 0) AS pagoresultado_original,
            IFNULL(a.ajuste_delta_total, 0) AS ajuste_delta
          FROM base b
          FULL OUTER JOIN ajustes a
            ON a.periodo = b.periodo
            AND a.ruta_key = b.ruta_key
            AND a.product_name_key = b.product_name_key
        )
        SELECT
          COUNT(1) AS rows_count,
          SUM(pagoresultado_original) AS total_pagoresultado_original,
          SUM(ajuste_delta) AS total_ajuste_delta,
          SUM(pagoresultado_original + ajuste_delta) AS total_pagoresultado_ajustado
        FROM merged
        WHERE periodo = @periodo
      `,
      parameters: [
        { name: "periodo", type: "STRING", value: periodo },
        { name: "stage", type: "STRING", value: stage },
        { name: "empty_product_key", type: "STRING", value: EMPTY_PRODUCT_KEY },
      ],
    }),
    fetchBigQueryRows<BigQueryAdjustmentRow>({
      query: `
        SELECT
          adjustment_id,
          ruta,
          product_name,
          kind,
          delta_pagoresultado,
          comment,
          CAST(updated_at AS STRING) AS updated_at
        FROM ${adjustmentsTableRef}
        WHERE periodo = @periodo
          AND stage = @stage
          AND is_active = TRUE
        ORDER BY updated_at DESC
      `,
      parameters: [
        { name: "periodo", type: "STRING", value: periodo },
        { name: "stage", type: "STRING", value: stage },
      ],
    }),
  ]);

  const mappedRows = (rows ?? []).map((row) => ({
    teamId: String(row.team_id ?? "").trim(),
    planTypeName: row.plan_type_name ?? null,
    productName: String(row.product_name ?? "").trim() || "-",
    prodWeight: Number(row.prod_weight ?? 0),
    agrupador: row.agrupador ?? null,
    garantia: row.garantia === true,
    elemento: row.elemento ?? null,
    ruta: String(row.ruta ?? "").trim(),
    representante: row.representante ?? null,
    actual: Number(row.actual ?? 0),
    resultado: Number(row.resultado ?? 0),
    objetivo: Number(row.objetivo ?? 0),
    cobertura: Number(row.cobertura ?? 0),
    pagoVariable: Number(row.pagovariable ?? 0),
    coberturaPago: Number(row.coberturapago ?? 0),
    nombre: row.nombre ?? null,
    linea: row.linea ?? null,
    manager: row.manager ?? null,
    empleado: row.empleado ?? null,
    pagoResultadoOriginal: Number(row.pagoresultado ?? 0),
    ajusteDelta: Number(row.ajuste_delta_total ?? 0),
    pagoResultadoAjustado: Number(row.pagoresultado_ajustado ?? 0),
    ajusteKinds: row.ajuste_kinds ?? null,
    ajusteComments: row.ajuste_comments ?? null,
    periodo: String(row.periodo ?? periodo),
  }));

  const summary = summaryRows[0];
  const mappedAdjustments = (adjustmentsRows ?? []).map((row) => ({
    adjustmentId: String(row.adjustment_id ?? "").trim(),
    ruta: String(row.ruta ?? "").trim(),
    productName: (() => {
      const value = String(row.product_name ?? "").trim();
      if (!value || value === EMPTY_PRODUCT_KEY) return "-";
      return value;
    })(),
    kind: String(row.kind ?? "").trim() || "ajuste",
    deltaPagoResultado: Number(row.delta_pagoresultado ?? 0),
    comment: row.comment ?? null,
    updatedAt: row.updated_at ?? null,
  }));

  return {
    rows: mappedRows,
    adjustments: mappedAdjustments,
    summary: {
      rowsCount: Number(summary?.rows_count ?? 0),
      totalPagoVariable: Number(summary?.total_pagoresultado_ajustado ?? 0),
      totalPagoResultadoOriginal: Number(summary?.total_pagoresultado_original ?? 0),
      totalAjusteDelta: Number(summary?.total_ajuste_delta ?? 0),
      totalPagoResultadoAjustado: Number(summary?.total_pagoresultado_ajustado ?? 0),
    },
    message: null,
  };
}
