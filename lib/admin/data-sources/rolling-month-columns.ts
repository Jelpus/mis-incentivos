export const ROLLING_MONTH_COLUMN_NAMES = [
  "month01",
  "month02",
  "month03",
  "month04",
  "month05",
  "month06",
  "month07",
  "month08",
  "month09",
  "month10",
  "month11",
  "month12",
] as const;

export type RollingMonthColumnName = (typeof ROLLING_MONTH_COLUMN_NAMES)[number];

function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function toMonthKeyFromOrdinal(monthOrdinal: number): string {
  const year = Math.floor(monthOrdinal / 12);
  const month = (monthOrdinal % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Resolves a rolling source column against the uploaded period.
 * month01 is the period itself, month02 is one month earlier, and so on.
 */
export function getRollingMonthKey(periodMonth: string, columnIndex: number): string | null {
  const period = parseMonthKey(periodMonth);
  if (!period || !Number.isInteger(columnIndex) || columnIndex < 1 || columnIndex > 12) {
    return null;
  }

  const periodOrdinal = period.year * 12 + (period.month - 1);
  return toMonthKeyFromOrdinal(periodOrdinal - (columnIndex - 1));
}

/** Returns the rolling monthNN column that represents targetMonth for periodMonth. */
export function getRollingMonthColumnName(
  periodMonth: string,
  targetMonth: string,
): RollingMonthColumnName | null {
  const period = parseMonthKey(periodMonth);
  const target = parseMonthKey(targetMonth);
  if (!period || !target) return null;

  const periodOrdinal = period.year * 12 + (period.month - 1);
  const targetOrdinal = target.year * 12 + (target.month - 1);
  const offset = periodOrdinal - targetOrdinal;
  if (offset < 0 || offset >= ROLLING_MONTH_COLUMN_NAMES.length) return null;

  return ROLLING_MONTH_COLUMN_NAMES[offset] ?? null;
}
