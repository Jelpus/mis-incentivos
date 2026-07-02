import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRelationError, normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import { normalizeProductNameKey } from "@/lib/admin/period-settings/effective-period";

export const GLOBAL_PERIOD_SETTINGS_MONTH = "1900-01-01";

export type PeriodSettings = {
  periodMonth: string;
  resultFromHireDateEnabled: boolean;
  hireDateCutoffDay: number;
  affectedProductNames: string[];
};

type PeriodSettingsRow = {
  period_month: string | null;
  result_from_hire_date_enabled: boolean | null;
  hire_date_cutoff_day: number | string | null;
  affected_product_names: string[] | null;
};

export function buildDefaultPeriodSettings(periodMonth: string): PeriodSettings {
  return {
    periodMonth,
    resultFromHireDateEnabled: false,
    hireDateCutoffDay: 20,
    affectedProductNames: [],
  };
}

function normalizeCutoffDay(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.trunc(parsed), 1), 31);
}

function normalizeAffectedProductNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const byKey = new Map<string, string>();
  for (const value of values) {
    const productName = String(value ?? "").trim();
    const key = normalizeProductNameKey(productName);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, productName);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

export function mapPeriodSettingsRow(row: PeriodSettingsRow | null, periodMonth: string): PeriodSettings {
  if (!row) return buildDefaultPeriodSettings(periodMonth);
  return {
    periodMonth,
    resultFromHireDateEnabled: row.result_from_hire_date_enabled === true,
    hireDateCutoffDay: normalizeCutoffDay(row.hire_date_cutoff_day),
    affectedProductNames: normalizeAffectedProductNames(row.affected_product_names),
  };
}

export async function loadPeriodSettingsForCalculation(periodMonthInput: string): Promise<PeriodSettings> {
  const periodMonth = normalizePeriodMonthInput(periodMonthInput) ?? periodMonthInput;
  const supabase = createAdminClient();
  if (!supabase) return buildDefaultPeriodSettings(periodMonth);

  const globalResult = await supabase
    .from("team_incentive_period_settings")
    .select("period_month, result_from_hire_date_enabled, hire_date_cutoff_day, affected_product_names")
    .eq("period_month", GLOBAL_PERIOD_SETTINGS_MONTH)
    .maybeSingle();

  if (globalResult.error) {
    if (isMissingRelationError(globalResult.error)) return buildDefaultPeriodSettings(periodMonth);
    throw new Error(`No se pudo leer Period Settings: ${globalResult.error.message}`);
  }

  if (globalResult.data) {
    return mapPeriodSettingsRow(globalResult.data as PeriodSettingsRow, periodMonth);
  }

  const legacyResult = await supabase
    .from("team_incentive_period_settings")
    .select("period_month, result_from_hire_date_enabled, hire_date_cutoff_day, affected_product_names")
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (legacyResult.error) {
    if (isMissingRelationError(legacyResult.error)) return buildDefaultPeriodSettings(periodMonth);
    throw new Error(`No se pudo leer Period Settings: ${legacyResult.error.message}`);
  }

  return mapPeriodSettingsRow((legacyResult.data ?? null) as PeriodSettingsRow | null, periodMonth);
}
