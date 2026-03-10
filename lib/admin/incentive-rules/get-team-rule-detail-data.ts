import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

type SalesForceTeamRow = {
  id: string;
  is_active: boolean;
  is_vacant: boolean;
};

type TeamRuleVersionRow = {
  id: string;
  period_month: string;
  team_id: string;
  version_no: number;
  change_note: string | null;
  rule_definition: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

export type TeamRuleDetailData = {
  teamId: string;
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  teamExistsInPeriod: boolean;
  salesForceTotal: number;
  salesForceActive: number;
  salesForceVacant: number;
  storageReady: boolean;
  storageMessage: string | null;
  versions: TeamRuleVersionRow[];
  currentVersion: TeamRuleVersionRow | null;
};

export async function getTeamRuleDetailData(params: {
  teamId: string;
  periodMonthInput?: string | null;
}): Promise<TeamRuleDetailData> {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const cleanedTeamId = params.teamId.trim();
  if (!cleanedTeamId) {
    throw new Error("Team ID invalido.");
  }

  const latestPeriodResult = await supabase
    .from("sales_force_status")
    .select("period_month")
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1);

  if (latestPeriodResult.error) {
    throw new Error(`Failed to load latest period: ${latestPeriodResult.error.message}`);
  }

  const latestAvailablePeriodMonth = latestPeriodResult.data?.[0]?.period_month ?? null;
  const requestedPeriod = normalizePeriodMonthInput(params.periodMonthInput);
  const periodMonth = requestedPeriod ?? latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const [teamRowsResult, ruleVersionsResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("id, is_active, is_vacant")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("team_id", cleanedTeamId),
    supabase
      .from("team_incentive_rule_versions")
      .select("id, period_month, team_id, version_no, change_note, rule_definition, created_at, created_by")
      .eq("period_month", periodMonth)
      .eq("team_id", cleanedTeamId)
      .order("version_no", { ascending: false })
      .limit(20),
  ]);

  if (teamRowsResult.error) {
    throw new Error(`Failed to load team rows: ${teamRowsResult.error.message}`);
  }

  let storageReady = true;
  let storageMessage: string | null = null;
  let versions: TeamRuleVersionRow[] = [];

  if (ruleVersionsResult.error) {
    if (isMissingRelationError(ruleVersionsResult.error)) {
      storageReady = false;
      storageMessage =
        "La tabla team_incentive_rule_versions aun no existe. Crea la tabla para habilitar versionado.";
    } else {
      throw new Error(`Failed to load team rule versions: ${ruleVersionsResult.error.message}`);
    }
  } else {
    versions = (ruleVersionsResult.data ?? []) as TeamRuleVersionRow[];
  }

  const teamRows = (teamRowsResult.data ?? []) as SalesForceTeamRow[];

  return {
    teamId: cleanedTeamId,
    periodMonth,
    latestAvailablePeriodMonth,
    teamExistsInPeriod: teamRows.length > 0,
    salesForceTotal: teamRows.length,
    salesForceActive: teamRows.filter((row) => row.is_active).length,
    salesForceVacant: teamRows.filter((row) => row.is_vacant).length,
    storageReady,
    storageMessage,
    versions,
    currentVersion: versions[0] ?? null,
  };
}
