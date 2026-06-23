import {
  getCurrentPeriodMonth,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

export type RankingRequiredFile = {
  fileCode: string;
  displayName: string;
  description: string;
};

export const SOURCE_RANKING_MIN_PERIOD_MONTH = "2026-01-01";

export const RANKING_REQUIRED_FILES: RankingRequiredFile[] = [
  {
    fileCode: "kpi_local_ytd",
    displayName: "KPI Local YTD",
    description: "Base operativa KPI acumulada YTD para ranking.",
  },
  {
    fileCode: "icva_48hrs",
    displayName: "ICVA + 48 hrs",
    description: "Base ICVA con ventana de 48 horas para ranking.",
  },
];

export type SourceRankingPeriodCheckDefinition = {
  key: string;
  fileCode: string;
  label: string;
  tableName: string;
};

export const SOURCE_RANKING_PERIOD_CHECKS: SourceRankingPeriodCheckDefinition[] = [
  {
    key: "kpi_raw",
    fileCode: "kpi_local_ytd",
    label: "KPI raw",
    tableName: "ranking_kpi_local_ytd_raw",
  },
  {
    key: "kpi_agg",
    fileCode: "kpi_local_ytd",
    label: "KPI agregado",
    tableName: "ranking_kpi_local_ytd_agg",
  },
  {
    key: "cpd_raw",
    fileCode: "kpi_local_ytd",
    label: "CPD raw",
    tableName: "ranking_cpd_raw",
  },
  {
    key: "icva_raw",
    fileCode: "icva_48hrs",
    label: "ICVA raw",
    tableName: "ranking_icva_48hrs_raw",
  },
  {
    key: "icva_agg",
    fileCode: "icva_48hrs",
    label: "ICVA agregado",
    tableName: "ranking_icva_48hrs_agg",
  },
];

export const SOURCE_RANKING_READY_TABLE_NAMES = Array.from(
  new Set(SOURCE_RANKING_PERIOD_CHECKS.map((check) => check.tableName)),
);

function toPeriodDate(value: string): Date | null {
  const normalized = normalizePeriodMonthInput(value);
  if (!normalized) return null;

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  return new Date(Date.UTC(year, month - 1, 1));
}

function toPeriodMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function getSourceRankingPeriodOptions(): string[] {
  const startDate = toPeriodDate(SOURCE_RANKING_MIN_PERIOD_MONTH);
  const endDate = toPeriodDate(getCurrentPeriodMonth());
  if (!startDate || !endDate) return [SOURCE_RANKING_MIN_PERIOD_MONTH];

  const periods: string[] = [];
  const cursor = new Date(endDate);

  while (cursor >= startDate) {
    periods.push(toPeriodMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return periods;
}

export function isSourceRankingPeriodAllowed(value: string | null | undefined): boolean {
  const normalized = normalizePeriodMonthInput(value);
  if (!normalized) return false;

  const periodDate = toPeriodDate(normalized);
  const startDate = toPeriodDate(SOURCE_RANKING_MIN_PERIOD_MONTH);
  const endDate = toPeriodDate(getCurrentPeriodMonth());
  if (!periodDate || !startDate || !endDate) return false;

  return periodDate >= startDate && periodDate <= endDate;
}
