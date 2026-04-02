import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";

const EMPTY_PRODUCT_KEY = "__SIN_PRODUCTO__";

type AdjustmentRow = {
  adjustment_id: string | null;
  ruta: string | null;
  product_name: string | null;
  kind: string | null;
  delta_pagoresultado: number | null;
  comment: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

export type AdjustmentListItem = {
  adjustmentId: string;
  ruta: string;
  productName: string;
  kind: string;
  deltaPagoResultado: number;
  comment: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

function toPeriodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

export async function getAdjustmentsListData(periodMonth: string): Promise<{
  rows: AdjustmentListItem[];
  message: string | null;
}> {
  if (!isBigQueryConfigured()) {
    return { rows: [], message: "BigQuery no configurado para listar ajustes." };
  }

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) {
    return { rows: [], message: "Falta GCP_PROJECT_ID para listar ajustes." };
  }

  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const adjustmentsTableId = process.env.BQ_RESULTS_ADJUSTMENTS_TABLE?.trim() || "resultados_v2_ajustes";
  const tableRef = `\`${projectId}.${datasetId}.${adjustmentsTableId}\``;
  const periodo = toPeriodCode(periodMonth);

  const rows = await fetchBigQueryRows<AdjustmentRow>({
    query: `
      SELECT
        adjustment_id,
        ruta,
        product_name,
        kind,
        delta_pagoresultado,
        comment,
        is_active,
        CAST(updated_at AS STRING) AS updated_at
      FROM ${tableRef}
      WHERE periodo = @periodo
      ORDER BY is_active DESC, updated_at DESC
      LIMIT 2000
    `,
    parameters: [{ name: "periodo", type: "STRING", value: periodo }],
  });

  const mapped = (rows ?? [])
    .map((row) => ({
      adjustmentId: String(row.adjustment_id ?? "").trim(),
      ruta: String(row.ruta ?? "").trim(),
      productName: (() => {
        const value = String(row.product_name ?? "").trim();
        if (!value || value === EMPTY_PRODUCT_KEY) return "-";
        return value;
      })(),
      kind: String(row.kind ?? "").trim() || "ajuste_manual",
      deltaPagoResultado: Number(row.delta_pagoresultado ?? 0),
      comment: row.comment ?? null,
      isActive: row.is_active !== false,
      updatedAt: row.updated_at ?? null,
    }))
    .filter((row) => row.adjustmentId.length > 0);

  return { rows: mapped, message: null };
}
