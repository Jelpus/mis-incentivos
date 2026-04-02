import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

type SalesForcePeriodRow = {
  period_month: string | null;
};

type CalculationStatusRow = {
  period_month: string;
  status: "borrador" | "precalculo" | "final" | "publicado";
  final_amount: number | null;
  updated_at: string | null;
  updated_by: string | null;
};

type BigQueryAmountRow = {
  periodo: string | null;
  total_pagoresultado: number | null;
};

function normalizePeriodCollection(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePeriodMonthInput(String(value ?? "").trim()))
        .filter((value): value is string => Boolean(value)),
    ),
  )
    .filter((value) => value >= "2026-01-01")
    .sort((a, b) => b.localeCompare(a));
}

function toPeriodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

function buildInList(values: string[]): string {
  const safe = values.filter((value) => /^\d{6}$/.test(value));
  if (safe.length === 0) return "'000000'";
  return safe.map((value) => `'${value}'`).join(", ");
}

export type CalculoPageData = {
  storageReady: boolean;
  storageMessage: string | null;
  bigQueryReady: boolean;
  bigQueryMessage: string | null;
  rows: Array<{
    periodMonth: string;
    status: "borrador" | "precalculo" | "final" | "publicado";
    finalAmount: number | null;
    vsMedia: number | null;
    vsPeriodoAnterior: number | null;
    updatedAt: string | null;
    updatedBy: string | null;
  }>;
};

async function loadCalculoPageData(): Promise<CalculoPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const periodsResult = await supabase
    .from("sales_force_status")
    .select("period_month")
    .eq("is_deleted", false)
    .gte("period_month", "2026-01-01")
    .order("period_month", { ascending: false });

  if (periodsResult.error) {
    throw new Error(`Failed to load periods from sales_force_status: ${periodsResult.error.message}`);
  }

  const periods = normalizePeriodCollection(
    ((periodsResult.data ?? []) as SalesForcePeriodRow[]).map((row) => row.period_month),
  );

  let storageReady = true;
  let storageMessage: string | null = null;
  const statusesByPeriod = new Map<string, CalculationStatusRow>();

  if (periods.length > 0) {
    const statusesResult = await supabase
      .from("team_incentive_calculation_periods")
      .select("period_month, status, final_amount, updated_at, updated_by")
      .in("period_month", periods);

    if (statusesResult.error) {
      if (isMissingRelationError(statusesResult.error)) {
        storageReady = false;
        const tableName =
          getMissingRelationName(statusesResult.error) ?? "team_incentive_calculation_periods";
        storageMessage =
          `La tabla ${tableName} aun no existe. Ejecuta docs/team-incentive-calculation-periods-schema.sql para habilitar este modulo.`;
      } else {
        throw new Error(`Failed to load calculation statuses: ${statusesResult.error.message}`);
      }
    } else {
      for (const row of (statusesResult.data ?? []) as CalculationStatusRow[]) {
        statusesByPeriod.set(String(row.period_month), row);
      }
    }
  }

  const periodCodes = periods.map(toPeriodCode);
  const baseAmountsByPeriod = new Map<string, number>();
  const adjustmentAmountsByPeriod = new Map<string, number>();
  const bigQueryReady = isBigQueryConfigured() && Boolean(process.env.GCP_PROJECT_ID?.trim());
  let bigQueryMessage: string | null = null;

  if (bigQueryReady && periodCodes.length > 0) {
    const projectId = process.env.GCP_PROJECT_ID?.trim() ?? "";
    const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
    const baseTableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
    const adjustmentsTableId = process.env.BQ_RESULTS_ADJUSTMENTS_TABLE?.trim() || "resultados_v2_ajustes";
    const inList = buildInList(periodCodes);
    const baseTableRef = `\`${projectId}.${datasetId}.${baseTableId}\``;
    const adjustmentsTableRef = `\`${projectId}.${datasetId}.${adjustmentsTableId}\``;

    try {
      const baseRows = await fetchBigQueryRows<BigQueryAmountRow>({
        query: `
          SELECT
            periodo,
            SUM(IFNULL(pagoresultado, 0)) AS total_pagoresultado
          FROM ${baseTableRef}
          WHERE periodo IN (${inList})
          GROUP BY periodo
        `,
      });
      for (const row of baseRows ?? []) {
        const key = String(row.periodo ?? "").trim();
        if (!/^\d{6}$/.test(key)) continue;
        baseAmountsByPeriod.set(key, Number(row.total_pagoresultado ?? 0));
      }
    } catch (error) {
      bigQueryMessage =
        error instanceof Error
          ? `No se pudo leer ${baseTableId}: ${error.message}`
          : `No se pudo leer ${baseTableId}.`;
    }

    try {
      const adjustmentsRows = await fetchBigQueryRows<BigQueryAmountRow>({
        query: `
          SELECT
            periodo,
            SUM(IFNULL(delta_pagoresultado, 0)) AS total_pagoresultado
          FROM ${adjustmentsTableRef}
          WHERE periodo IN (${inList})
            AND stage = 'precalculo'
            AND is_active = TRUE
          GROUP BY periodo
        `,
      });
      for (const row of adjustmentsRows ?? []) {
        const key = String(row.periodo ?? "").trim();
        if (!/^\d{6}$/.test(key)) continue;
        adjustmentAmountsByPeriod.set(key, Number(row.total_pagoresultado ?? 0));
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? `No se pudo leer ${adjustmentsTableId}: ${error.message}`
          : `No se pudo leer ${adjustmentsTableId}.`;
      bigQueryMessage = bigQueryMessage ? `${bigQueryMessage} | ${message}` : message;
    }
  } else {
    bigQueryMessage = "BigQuery no configurado: usando monto almacenado en periodos.";
  }

  const rows = periods.map((periodMonth) => {
    const statusRow = statusesByPeriod.get(periodMonth);
    const periodCode = toPeriodCode(periodMonth);
    const baseAmount = baseAmountsByPeriod.get(periodCode);
    const ajusteAmount = adjustmentAmountsByPeriod.get(periodCode) ?? 0;
    const computedAmount =
      statusRow?.status === "final"
        ? ((baseAmount ?? 0) + ajusteAmount)
        : (baseAmount ?? null);

    return {
      periodMonth,
      status: statusRow?.status ?? "borrador",
      finalAmount: computedAmount ?? statusRow?.final_amount ?? null,
      vsMedia: null,
      vsPeriodoAnterior: null,
      updatedAt: statusRow?.updated_at ?? null,
      updatedBy: statusRow?.updated_by ?? null,
    };
  });

  return {
    storageReady,
    storageMessage,
    bigQueryReady,
    bigQueryMessage,
    rows,
  };
}

const getCachedCalculoPageData = unstable_cache(
  async () => loadCalculoPageData(),
  ["admin-calculo-page"],
  { revalidate: 120, tags: ["admin-calculo"] },
);

export async function getCalculoPageData(): Promise<CalculoPageData> {
  return getCachedCalculoPageData();
}
