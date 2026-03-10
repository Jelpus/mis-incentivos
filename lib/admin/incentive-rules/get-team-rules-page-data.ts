import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

type SalesForceTeamRow = {
  team_id: string | null;
  is_active: boolean;
  is_vacant: boolean;
};

type ManagerTeamRow = {
  team_id: string | null;
  is_active: boolean;
};

type TeamRuleVersionRow = {
  team_id: string;
  version_no: number;
  created_at: string;
};

export type TeamRulesListRow = {
  teamId: string;
  salesForceTotal: number;
  salesForceActive: number;
  salesForceVacant: number;
  managerTotal: number;
  managerActive: number;
  latestVersionNo: number | null;
  latestVersionAt: string | null;
};

export type TeamRulesPageData = {
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  rows: TeamRulesListRow[];
  storageReady: boolean;
  storageMessage: string | null;
  totalTeams: number;
  configuredTeams: number;
};

export async function getTeamRulesPageData(
  periodMonthInput?: string | null,
): Promise<TeamRulesPageData> {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
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
  const requestedPeriod = normalizePeriodMonthInput(periodMonthInput);
  const periodMonth =
    requestedPeriod ?? latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const [salesForceResult, managerResult, rulesVersionResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("team_id, is_active, is_vacant")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
    supabase
      .from("manager_status")
      .select("team_id, is_active")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
    supabase
      .from("team_incentive_rule_versions")
      .select("team_id, version_no, created_at")
      .eq("period_month", periodMonth)
      .order("version_no", { ascending: false }),
  ]);

  if (salesForceResult.error) {
    throw new Error(`Failed to load sales force teams: ${salesForceResult.error.message}`);
  }

  if (managerResult.error) {
    throw new Error(`Failed to load manager teams: ${managerResult.error.message}`);
  }

  let storageReady = true;
  let storageMessage: string | null = null;
  let ruleVersions: TeamRuleVersionRow[] = [];

  if (rulesVersionResult.error) {
    if (isMissingRelationError(rulesVersionResult.error)) {
      storageReady = false;
      storageMessage =
        "La tabla team_incentive_rule_versions aun no existe. Puedes crearla y luego versionar reglas.";
    } else {
      throw new Error(`Failed to load team rule versions: ${rulesVersionResult.error.message}`);
    }
  } else {
    ruleVersions = (rulesVersionResult.data ?? []) as TeamRuleVersionRow[];
  }

  const rowsByTeam = new Map<string, TeamRulesListRow>();

  for (const row of (salesForceResult.data ?? []) as SalesForceTeamRow[]) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;

    const current = rowsByTeam.get(teamId) ?? {
      teamId,
      salesForceTotal: 0,
      salesForceActive: 0,
      salesForceVacant: 0,
      managerTotal: 0,
      managerActive: 0,
      latestVersionNo: null,
      latestVersionAt: null,
    };

    current.salesForceTotal += 1;
    if (row.is_active) current.salesForceActive += 1;
    if (row.is_vacant) current.salesForceVacant += 1;

    rowsByTeam.set(teamId, current);
  }

  for (const row of (managerResult.data ?? []) as ManagerTeamRow[]) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;

    const current = rowsByTeam.get(teamId) ?? {
      teamId,
      salesForceTotal: 0,
      salesForceActive: 0,
      salesForceVacant: 0,
      managerTotal: 0,
      managerActive: 0,
      latestVersionNo: null,
      latestVersionAt: null,
    };

    current.managerTotal += 1;
    if (row.is_active) current.managerActive += 1;

    rowsByTeam.set(teamId, current);
  }

  for (const version of ruleVersions) {
    const current = rowsByTeam.get(version.team_id);
    if (!current) continue;

    const isNewer =
      current.latestVersionNo === null || version.version_no > current.latestVersionNo;

    if (isNewer) {
      current.latestVersionNo = version.version_no;
      current.latestVersionAt = version.created_at;
    }
  }

  const rows = Array.from(rowsByTeam.values()).sort((a, b) =>
    a.teamId.localeCompare(b.teamId, "es"),
  );

  return {
    periodMonth,
    latestAvailablePeriodMonth,
    rows,
    storageReady,
    storageMessage,
    totalTeams: rows.length,
    configuredTeams: rows.filter((row) => row.latestVersionNo !== null).length,
  };
}
