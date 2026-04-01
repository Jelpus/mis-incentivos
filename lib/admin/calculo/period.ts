import { normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";

export function normalizeCalculoPeriodParam(periodParam: string | null | undefined): string | null {
  if (!periodParam) return null;
  return normalizePeriodMonthInput(periodParam.trim());
}

