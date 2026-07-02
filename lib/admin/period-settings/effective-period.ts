import { normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";

export function normalizeProductNameKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseIsoDate(value: unknown): { year: number; month: number; day: number } | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function monthStart(year: number, month: number): string {
  let outputYear = year;
  let outputMonth = month;
  if (outputMonth > 12) {
    outputYear += Math.floor((outputMonth - 1) / 12);
    outputMonth = ((outputMonth - 1) % 12) + 1;
  }
  return `${String(outputYear).padStart(4, "0")}-${String(outputMonth).padStart(2, "0")}-01`;
}

export function computeEffectivePeriodCut(params: {
  hireDate: string | null | undefined;
  cutoffDay: number;
  periodMonth: string;
}): string | null {
  const normalizedPeriod = normalizePeriodMonthInput(params.periodMonth);
  if (!normalizedPeriod) return null;

  const periodYear = Number(normalizedPeriod.slice(0, 4));
  if (!Number.isInteger(periodYear)) return null;

  const hireDate = parseIsoDate(params.hireDate);
  if (!hireDate) return null;

  const cutoffDay = Math.min(Math.max(Math.trunc(params.cutoffDay), 1), 31);
  if (hireDate.year < periodYear) return `${periodYear}-01-01`;

  const effectiveMonth = hireDate.day > cutoffDay ? hireDate.month + 1 : hireDate.month;
  return monthStart(hireDate.year, effectiveMonth);
}

export function isBeforeEffectivePeriodCut(periodMonth: string, effectivePeriodCut: string | null): boolean {
  const normalizedPeriod = normalizePeriodMonthInput(periodMonth);
  const normalizedCut = normalizePeriodMonthInput(effectivePeriodCut);
  if (!normalizedPeriod || !normalizedCut) return false;
  return normalizedPeriod < normalizedCut;
}
