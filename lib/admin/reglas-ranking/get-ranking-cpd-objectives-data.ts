import { createAdminClient } from "@/lib/supabase/admin";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";

function formatMaxTwoDecimals(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return raw;

  const rounded = Math.round(parsed * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return rounded.toString();
}

export type RankingCpdObjectiveRow = {
  teamId: string;
  objectiveCpd: string;
  source: "objective" | "team";
};

export type RankingCpdObjectivesData = {
  storageReady: boolean;
  storageMessage: string | null;
  rows: RankingCpdObjectiveRow[];
};

export async function getRankingCpdObjectivesData(): Promise<RankingCpdObjectivesData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const teamsResult = await supabase
    .from("sales_force_status")
    .select("team_id")
    .eq("is_deleted", false)
    .not("team_id", "is", null)
    .neq("team_id", "")
    .order("team_id", { ascending: true });

  if (teamsResult.error) {
    throw new Error(`Failed to load teams for CPD objectives: ${teamsResult.error.message}`);
  }

  const rowsByTeamId = new Map<string, RankingCpdObjectiveRow>();
  for (const row of (teamsResult.data ?? []) as Array<{ team_id?: unknown }>) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId || rowsByTeamId.has(teamId)) continue;
    rowsByTeamId.set(teamId, {
      teamId,
      objectiveCpd: "",
      source: "team",
    });
  }

  const objectivesResult = await supabase
    .from("ranking_cpd_objectives")
    .select("team_id, objective_cpd")
    .eq("is_active", true)
    .order("team_id", { ascending: true });

  if (objectivesResult.error) {
    if (isMissingRelationError(objectivesResult.error)) {
      const tableName = getMissingRelationName(objectivesResult.error) ?? "ranking_cpd_objectives";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-cpd-objectives-schema.sql.`,
        rows: Array.from(rowsByTeamId.values()),
      };
    }
    throw new Error(`Failed to load CPD objectives: ${objectivesResult.error.message}`);
  }

  for (const row of (objectivesResult.data ?? []) as Array<{ team_id?: unknown; objective_cpd?: unknown }>) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;
    rowsByTeamId.set(teamId, {
      teamId,
      objectiveCpd: formatMaxTwoDecimals(row.objective_cpd),
      source: "objective",
    });
  }

  const rows = Array.from(rowsByTeamId.values()).sort((a, b) => a.teamId.localeCompare(b.teamId, "es"));

  return {
    storageReady: true,
    storageMessage: null,
    rows,
  };
}
