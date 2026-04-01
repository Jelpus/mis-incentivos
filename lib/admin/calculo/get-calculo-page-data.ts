import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const bigQueryReady = false;
  const bigQueryMessage =
    "Comparativos de BigQuery se cargan en el proceso; el listado usa modo rapido.";

  const rows = periods.map((periodMonth) => {
    const statusRow = statusesByPeriod.get(periodMonth);

    return {
      periodMonth,
      status: statusRow?.status ?? "borrador",
      finalAmount: statusRow?.final_amount ?? null,
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
