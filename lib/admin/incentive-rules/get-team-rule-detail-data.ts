import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  getCurrentPeriodMonth,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { loadRuleDefinitionsByIds } from "@/lib/admin/incentive-rules/rule-definition-normalized";

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
  rule_definition_id: string;
  rule_definition: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

type ProfileNameRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type TeamRuleDetailData = {
  teamId: string;
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  availableStatusPeriods: string[];
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
  const statusPeriodsResult = await supabase
    .from("sales_force_status")
    .select("period_month")
    .eq("is_deleted", false)
    .order("period_month", { ascending: false });

  if (latestPeriodResult.error) {
    throw new Error(`Failed to load latest period: ${latestPeriodResult.error.message}`);
  }
  if (statusPeriodsResult.error) {
    throw new Error(`Failed to load status periods: ${statusPeriodsResult.error.message}`);
  }

  const latestAvailablePeriodMonth = normalizePeriodMonthInput(
    String(latestPeriodResult.data?.[0]?.period_month ?? "").trim(),
  );
  const availableStatusPeriods = new Set(
    (statusPeriodsResult.data ?? [])
      .map((row) => normalizePeriodMonthInput(String(row.period_month ?? "").trim()))
      .filter((value): value is string => Boolean(value)),
  );
  const requestedPeriod = normalizePeriodMonthInput(params.periodMonthInput);
  const periodMonth =
    requestedPeriod && availableStatusPeriods.has(requestedPeriod)
      ? requestedPeriod
      : latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const [teamRowsResult, ruleVersionsResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("id, is_active, is_vacant")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("team_id", cleanedTeamId),
    supabase
      .from("team_incentive_rule_versions")
      .select("id, period_month, team_id, version_no, change_note, rule_definition_id, created_at, created_by")
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
      const tableName =
        getMissingRelationName(ruleVersionsResult.error) ?? "team_incentive_rule_versions";
      storageMessage =
        `La tabla ${tableName} aun no existe. Crea la tabla para habilitar versionado.`;
    } else {
      throw new Error(`Failed to load team rule versions: ${ruleVersionsResult.error.message}`);
    }
  } else {
    const rawRows = (ruleVersionsResult.data ?? []) as Array<{
      id: string;
      period_month: string;
      team_id: string;
      version_no: number;
      change_note: string | null;
      rule_definition_id: string;
      created_at: string;
      created_by: string | null;
    }>;
    const definitionIds = rawRows
      .map((row) => String(row.rule_definition_id ?? "").trim())
      .filter((value) => value.length > 0);
    let definitionsById: Map<string, Record<string, unknown>>;
    try {
      definitionsById = await loadRuleDefinitionsByIds({ supabase, definitionIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const parsedName =
        getMissingRelationName({ message }) ?? "team_rule_definitions / team_rule_definition_items";
      storageReady = false;
      storageMessage = `La tabla ${parsedName} aun no existe. Crea el esquema normalizado para habilitar versionado.`;
      definitionsById = new Map();
    }

    const createdByIds = Array.from(
      new Set(
        rawRows
          .map((row) => String(row.created_by ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );

    const profileNameById = new Map<string, string>();
    if (createdByIds.length > 0) {
      const profileResult = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", createdByIds);

      if (!profileResult.error) {
        const profileRows = (profileResult.data ?? []) as ProfileNameRow[];
        for (const profile of profileRows) {
          const firstName = String(profile.first_name ?? "").trim();
          const lastName = String(profile.last_name ?? "").trim();
          const fullName = [firstName, lastName].filter((part) => part.length > 0).join(" ").trim();
          const display = fullName || String(profile.email ?? "").trim();
          if (display) {
            profileNameById.set(String(profile.user_id ?? "").trim(), display);
          }
        }
      }
    }

    versions = rawRows.map((row) => ({
      ...row,
      rule_definition:
        definitionsById.get(String(row.rule_definition_id ?? "").trim()) ?? null,
      created_by_name:
        profileNameById.get(String(row.created_by ?? "").trim()) ?? null,
    }));
  }

  const teamRows = (teamRowsResult.data ?? []) as SalesForceTeamRow[];

  return {
    teamId: cleanedTeamId,
    periodMonth,
    latestAvailablePeriodMonth,
    availableStatusPeriods: Array.from(availableStatusPeriods).sort((a, b) =>
      b.localeCompare(a),
    ),
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
