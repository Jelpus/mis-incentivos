import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/admin/incentive-rules/shared";
import type { ContestParticipant, CoveragePointDetail } from "@/lib/ranking-contests/types";

export const EMPTY_RANKING_PRODUCT_KEY = "__SIN_PRODUCTO__";

type AdjustmentRow = {
  id: string | null;
  period_month: string | null;
  territory: string | null;
  product_name: string | null;
  delta_points: number | string | null;
  reason: string | null;
};

export type RankingPointAdjustment = {
  id: string;
  periodCode: string;
  territory: string;
  productName: string;
  deltaPoints: number;
  reason: string | null;
};

export type RankingPointAdjustmentLookup = Map<string, RankingPointAdjustment>;

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeAdjustmentTextKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function normalizeAdjustmentProduct(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || EMPTY_RANKING_PRODUCT_KEY;
}

export function periodCodeToMonth(periodCode: unknown): string | null {
  const raw = String(periodCode ?? "").trim();
  if (/^\d{6}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-01`;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export function periodMonthToCode(periodMonth: unknown): string | null {
  const raw = String(periodMonth ?? "").trim();
  if (/^\d{6}$/.test(raw)) return raw;
  const month = periodCodeToMonth(raw);
  if (!month) return null;
  return `${month.slice(0, 4)}${month.slice(5, 7)}`;
}

export function makeRankingPointAdjustmentKey(params: {
  periodCode: unknown;
  territory: unknown;
  productName: unknown;
}): string {
  return [
    periodMonthToCode(params.periodCode) ?? String(params.periodCode ?? "").trim(),
    normalizeAdjustmentTextKey(params.territory),
    normalizeAdjustmentTextKey(normalizeAdjustmentProduct(params.productName)),
  ].join("|");
}

export async function getActiveRankingPointAdjustmentsForPeriods(params: {
  supabase: SupabaseClient;
  periodCodes: string[];
}): Promise<{ adjustments: RankingPointAdjustmentLookup; message: string | null }> {
  const periodMonths = Array.from(
    new Set(
      params.periodCodes
        .map((period) => periodCodeToMonth(period))
        .filter((period): period is string => Boolean(period)),
    ),
  );

  if (periodMonths.length === 0) {
    return { adjustments: new Map(), message: null };
  }

  const result = await params.supabase
    .from("ranking_point_adjustments")
    .select("id, period_month, territory, product_name, delta_points, reason")
    .in("period_month", periodMonths)
    .eq("is_active", true);

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return {
        adjustments: new Map(),
        message: "Tabla ranking_point_adjustments no creada. Ejecuta docs/ranking-point-adjustments-schema.sql.",
      };
    }
    return {
      adjustments: new Map(),
      message: `No se pudieron cargar ajustes de ranking: ${result.error.message}`,
    };
  }

  const adjustments = new Map<string, RankingPointAdjustment>();
  for (const row of (result.data ?? []) as AdjustmentRow[]) {
    const periodCode = periodMonthToCode(row.period_month);
    const territory = String(row.territory ?? "").trim();
    const productName = normalizeAdjustmentProduct(row.product_name);
    if (!periodCode || !territory || !productName) continue;

    const key = makeRankingPointAdjustmentKey({ periodCode, territory, productName });
    const current = adjustments.get(key);
    const deltaPoints = toNumber(row.delta_points);
    if (current) {
      adjustments.set(key, {
        ...current,
        deltaPoints: current.deltaPoints + deltaPoints,
        reason: [current.reason, row.reason].filter(Boolean).join(" | ") || null,
      });
    } else {
      adjustments.set(key, {
        id: String(row.id ?? ""),
        periodCode,
        territory,
        productName,
        deltaPoints,
        reason: row.reason ?? null,
      });
    }
  }

  return { adjustments, message: null };
}

export function applyRankingPointAdjustment(params: {
  detail: CoveragePointDetail;
  participant: ContestParticipant;
  adjustments: RankingPointAdjustmentLookup;
}): CoveragePointDetail {
  const key = makeRankingPointAdjustmentKey({
    periodCode: params.detail.period,
    territory: params.participant.territory,
    productName: params.detail.productName,
  });
  const adjustment = params.adjustments.get(key);
  if (!adjustment || adjustment.deltaPoints === 0) {
    return {
      ...params.detail,
      basePoints: params.detail.basePoints ?? params.detail.points,
      adjustmentDelta: params.detail.adjustmentDelta ?? 0,
    };
  }

  const basePoints = params.detail.basePoints ?? params.detail.points;
  const adjustmentDelta = (params.detail.adjustmentDelta ?? 0) + adjustment.deltaPoints;

  return {
    ...params.detail,
    basePoints,
    adjustmentDelta,
    adjustmentId: adjustment.id,
    adjustmentReason: adjustment.reason,
    points: basePoints + adjustmentDelta,
  };
}
