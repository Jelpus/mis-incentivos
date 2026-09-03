export const RANKING_ADJUSTMENT_PERIOD_STATUSES = ["final", "publicado"] as const;

export function isRankingAdjustmentPeriodStatus(value: unknown): boolean {
  const status = String(value ?? "").trim().toLowerCase();
  return RANKING_ADJUSTMENT_PERIOD_STATUSES.some((allowedStatus) => allowedStatus === status);
}
