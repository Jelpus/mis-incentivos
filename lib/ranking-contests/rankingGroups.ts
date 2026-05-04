import type { SupabaseClient } from "@supabase/supabase-js";
import type { RankingComplement } from "@/lib/ranking-contests/types";

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getLatestRankingComplementsByTeamIds(params: {
  supabase: SupabaseClient;
  teamIds: string[];
}): Promise<Map<string, RankingComplement[]>> {
  const uniqueTeamIds = Array.from(new Set(params.teamIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  const result = new Map<string, RankingComplement[]>();
  if (uniqueTeamIds.length === 0) return result;

  for (let index = 0; index < uniqueTeamIds.length; index += 200) {
    const chunk = uniqueTeamIds.slice(index, index + 200);
    const complementsResult = await params.supabase
      .from("ranking_rule_complements")
      .select("period_month, team_id, product_name, ranking, puntos_ranking_lvu, prod_weight, is_active")
      .in("team_id", chunk)
      .eq("is_active", true)
      .order("period_month", { ascending: false });

    if (complementsResult.error) {
      throw new Error(`No se pudieron cargar complementos ranking: ${complementsResult.error.message}`);
    }

    const latestPeriodByTeam = new Map<string, string>();
    const rows = (complementsResult.data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const teamKey = normalizeKey(row.team_id);
      const period = String(row.period_month ?? "").trim();
      if (!teamKey || !period) continue;
      const current = latestPeriodByTeam.get(teamKey);
      if (!current || period > current) latestPeriodByTeam.set(teamKey, period);
    }

    for (const row of rows) {
      const teamId = String(row.team_id ?? "").trim();
      const teamKey = normalizeKey(teamId);
      const period = String(row.period_month ?? "").trim();
      if (!teamKey || latestPeriodByTeam.get(teamKey) !== period) continue;

      const arr = result.get(teamKey) ?? [];
      arr.push({
        periodMonth: period || null,
        teamId: teamId || null,
        productName: String(row.product_name ?? "").trim() || null,
        ranking: String(row.ranking ?? "").trim() || null,
        puntosRankingLvu: toNumber(row.puntos_ranking_lvu),
        prodWeight: toNumber(row.prod_weight),
        isActive: row.is_active !== false,
      });
      result.set(teamKey, arr);
    }
  }

  return result;
}

export function attachRankingGroupsToParticipants<T extends { teamId?: string | null; rankingGroup?: string | null }>(params: {
  participants: T[];
  complementsByTeamId: Map<string, RankingComplement[]>;
}): T[] {
  return params.participants.map((participant) => {
    const complements = params.complementsByTeamId.get(normalizeKey(participant.teamId));
    return {
      ...participant,
      rankingGroup: complements?.find((item) => item.ranking)?.ranking ?? null,
    };
  });
}

export function findComplementForProduct(params: {
  complements: RankingComplement[] | undefined;
  teamId: string | null | undefined;
  productName: string | null | undefined;
}): RankingComplement | null {
  const productKey = normalizeKey(params.productName);
  if (!productKey) return null;
  return params.complements?.find((item) => normalizeKey(item.productName) === productKey) ?? null;
}

export function normalizeTeamKey(value: unknown): string {
  return normalizeKey(value);
}
