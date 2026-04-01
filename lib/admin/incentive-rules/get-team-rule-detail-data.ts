import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  getCurrentPeriodMonth,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { loadRuleDefinitionsByIds } from "@/lib/admin/incentive-rules/rule-definition-normalized";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 180;
const PERIOD_BATCH_SIZE = 2500;
const PERIOD_MAX_SCAN_ROWS = 30000;
const PERIOD_MAX_OPTIONS = 24;

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

function isRetryableMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("authretryablefetcherror") ||
    normalized.includes("timeout")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry<T extends { error: { message?: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  let lastResult = await run();
  if (!lastResult.error) return lastResult;

  for (let attempt = 1; attempt < RETRY_ATTEMPTS; attempt += 1) {
    const message = String(lastResult.error?.message ?? "");
    if (!isRetryableMessage(message)) break;
    await wait(RETRY_DELAY_MS * attempt);
    lastResult = await run();
    if (!lastResult.error) return lastResult;
  }
  return lastResult;
}

async function loadDistinctStatusPeriods(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<string[]> {
  const unique = new Set<string>();
  let offset = 0;

  while (unique.size < PERIOD_MAX_OPTIONS && offset < PERIOD_MAX_SCAN_ROWS) {
    const batchResult = await queryWithRetry(() =>
      supabase
        .from("sales_force_status")
        .select("period_month")
        .eq("is_deleted", false)
        .order("period_month", { ascending: false })
        .range(offset, offset + PERIOD_BATCH_SIZE - 1),
    );
    if (batchResult.error) break;

    const rows = batchResult.data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const normalized = normalizePeriodMonthInput(String((row as { period_month?: unknown }).period_month ?? "").trim());
      if (!normalized) continue;
      unique.add(normalized);
      if (unique.size >= PERIOD_MAX_OPTIONS) break;
    }

    if (rows.length < PERIOD_BATCH_SIZE) break;
    offset += PERIOD_BATCH_SIZE;
  }

  return Array.from(unique).sort((a, b) => b.localeCompare(a));
}

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
  currentRuleDefinition: Record<string, unknown> | null;
};

async function loadTeamRuleDetailData(params: {
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

  const [latestPeriodResult, statusPeriods] = await Promise.all([
    queryWithRetry(() =>
      supabase
        .from("sales_force_status")
        .select("period_month")
        .eq("is_deleted", false)
        .order("period_month", { ascending: false })
        .limit(1),
    ),
    loadDistinctStatusPeriods(supabase),
  ]);

  if (latestPeriodResult.error) {
    throw new Error(`Failed to load latest period: ${latestPeriodResult.error.message}`);
  }

  const latestAvailablePeriodMonth = normalizePeriodMonthInput(
    String(latestPeriodResult.data?.[0]?.period_month ?? "").trim(),
  );
  const availableStatusPeriods = new Set(statusPeriods);
  const requestedPeriod = normalizePeriodMonthInput(params.periodMonthInput);
  const periodMonth =
    requestedPeriod && availableStatusPeriods.has(requestedPeriod)
      ? requestedPeriod
      : latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const [teamRowsResult, ruleVersionsResult] = await Promise.all([
    queryWithRetry(() =>
      supabase
        .from("sales_force_status")
        .select("id, is_active, is_vacant")
        .eq("period_month", periodMonth)
        .eq("is_deleted", false)
        .eq("team_id", cleanedTeamId),
    ),
    queryWithRetry(() =>
      supabase
        .from("team_incentive_rule_versions")
        .select("id, period_month, team_id, version_no, change_note, rule_definition_id, created_at, created_by")
        .eq("period_month", periodMonth)
        .eq("team_id", cleanedTeamId)
        .order("version_no", { ascending: false })
        .limit(20),
    ),
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
    const createdByIds = Array.from(
      new Set(
        rawRows
          .map((row) => String(row.created_by ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );

    const profileNameById = new Map<string, string>();
    if (createdByIds.length > 0) {
      const profileResult = await queryWithRetry(() =>
        supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", createdByIds),
      );

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
      created_by_name:
        profileNameById.get(String(row.created_by ?? "").trim()) ?? null,
    }));
  }

  const teamRows = (teamRowsResult.data ?? []) as SalesForceTeamRow[];
  const currentVersion = versions[0] ?? null;
  let currentRuleDefinition: Record<string, unknown> | null = null;

  if (storageReady && currentVersion?.rule_definition_id) {
    try {
      const definitionsById = await loadRuleDefinitionsByIds({
        supabase,
        definitionIds: [String(currentVersion.rule_definition_id).trim()],
      });
      currentRuleDefinition =
        definitionsById.get(String(currentVersion.rule_definition_id).trim()) ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const parsedName =
        getMissingRelationName({ message }) ?? "team_rule_definitions / team_rule_definition_items";
      storageReady = false;
      storageMessage = `La tabla ${parsedName} aun no existe. Crea el esquema normalizado para habilitar versionado.`;
    }
  }

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
    currentVersion,
    currentRuleDefinition,
  };
}

const getCachedTeamRuleDetailData = unstable_cache(
  async (teamId: string, periodMonthInput?: string | null) =>
    loadTeamRuleDetailData({ teamId, periodMonthInput }),
  ["admin-incentive-rule-detail"],
  { revalidate: 120, tags: ["admin-incentive-rules"] },
);

export async function getTeamRuleDetailData(params: {
  teamId: string;
  periodMonthInput?: string | null;
}): Promise<TeamRuleDetailData> {
  return getCachedTeamRuleDetailData(params.teamId, params.periodMonthInput ?? null);
}
