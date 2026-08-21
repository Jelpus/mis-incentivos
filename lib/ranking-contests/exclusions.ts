import type { SupabaseClient } from "@supabase/supabase-js";

type RankingMetricExclusionRow = {
  territory_id: string | null;
  period_month: string | null;
};

export type RankingMetricExclusionSnapshot = {
  versionNo: number | null;
  byTerritory: ReadonlyMap<string, ReadonlySet<string>>;
  error: string | null;
};

function normalizeTerritory(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePeriodMonth(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return "";
}

export async function loadLatestRankingMetricExclusions(
  supabase: SupabaseClient,
): Promise<RankingMetricExclusionSnapshot> {
  const versionResult = await supabase
    .from("exclusiones_ranking_metric_versions")
    .select("version_no")
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle<{ version_no: number | string | null }>();

  if (versionResult.error) {
    return {
      versionNo: null,
      byTerritory: new Map(),
      error: `No se pudo leer la ultima version de exclusiones de ranking: ${versionResult.error.message}`,
    };
  }

  const versionNo = Number(versionResult.data?.version_no);
  if (!Number.isInteger(versionNo) || versionNo <= 0) {
    return { versionNo: null, byTerritory: new Map(), error: null };
  }

  const rows: RankingMetricExclusionRow[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const pageResult = await supabase
      .from("exclusiones_ranking_metrics")
      .select("territory_id, period_month")
      .eq("version_no", versionNo)
      .order("period_month", { ascending: true })
      .order("territory_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (pageResult.error) {
      return {
        versionNo,
        byTerritory: new Map(),
        error: `No se pudieron leer las exclusiones de ranking v_${versionNo}: ${pageResult.error.message}`,
      };
    }

    const batch = (pageResult.data ?? []) as RankingMetricExclusionRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const byTerritory = new Map<string, Set<string>>();
  for (const row of rows) {
    const territory = normalizeTerritory(row.territory_id);
    const periodMonth = normalizePeriodMonth(row.period_month);
    if (!territory || !periodMonth) continue;
    const periods = byTerritory.get(territory) ?? new Set<string>();
    periods.add(periodMonth);
    byTerritory.set(territory, periods);
  }

  return { versionNo, byTerritory, error: null };
}

export function isRankingMetricPeriodExcluded(params: {
  snapshot: RankingMetricExclusionSnapshot;
  territoryId: unknown;
  periodMonth: unknown;
}): boolean {
  const territory = normalizeTerritory(params.territoryId);
  const periodMonth = normalizePeriodMonth(params.periodMonth);
  if (!territory || !periodMonth) return false;
  return params.snapshot.byTerritory.get(territory)?.has(periodMonth) ?? false;
}

export function getExcludedRankingMetricPeriods(params: {
  snapshot: RankingMetricExclusionSnapshot;
  territoryIds: unknown[];
  evaluationPeriods: string[];
}): Set<string> {
  const excludedPeriods = new Set<string>();
  for (const territoryId of params.territoryIds) {
    for (const periodMonth of params.evaluationPeriods) {
      if (isRankingMetricPeriodExcluded({
        snapshot: params.snapshot,
        territoryId,
        periodMonth,
      })) {
        excludedPeriods.add(periodMonth);
      }
    }
  }
  return excludedPeriods;
}

export function formatRankingMetricEvaluationPeriods(
  evaluationPeriods: string[],
  excludedPeriods: ReadonlySet<string>,
): string {
  return evaluationPeriods
    .map((periodMonth) => excludedPeriods.has(periodMonth) ? `${periodMonth}*` : periodMonth)
    .join(", ");
}

export function getRankingMetricExclusionFootnote(params: {
  versionNo: number | null;
  excludedPeriods: ReadonlySet<string>;
}): string {
  if (params.excludedPeriods.size === 0) return "";
  const versionLabel = params.versionNo ? ` (v_${params.versionNo})` : "";
  return ` *Excluido por garantia${versionLabel}.`;
}
