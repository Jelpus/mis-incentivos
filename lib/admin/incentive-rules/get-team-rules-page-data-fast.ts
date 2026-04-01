import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 180;
const PERIOD_BATCH_SIZE = 2500;
const PERIOD_MAX_SCAN_ROWS = 30000;
const PERIOD_MAX_OPTIONS = 24;

type SalesForceTeamRow = {
  team_id: string | null;
  is_active: boolean;
  is_vacant: boolean;
};

type TeamRuleVersionRawRow = {
  team_id: string;
  version_no: number;
  created_at: string;
  rule_definition_id: string;
  period_month?: string | null;
};

type RuleItemRow = {
  definition_id: string | null;
};

function normalizePeriodCollection(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePeriodMonthInput(String(value ?? "").trim()))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

function pickLatestVersionsByTeam(rows: TeamRuleVersionRawRow[]): TeamRuleVersionRawRow[] {
  const latestByTeam = new Map<string, TeamRuleVersionRawRow>();

  for (const row of rows) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;

    const current = latestByTeam.get(teamId);
    if (!current) {
      latestByTeam.set(teamId, row);
      continue;
    }

    const currentVersion = Number(current.version_no ?? 0);
    const nextVersion = Number(row.version_no ?? 0);
    if (nextVersion > currentVersion) {
      latestByTeam.set(teamId, row);
      continue;
    }
    if (nextVersion === currentVersion && String(row.created_at ?? "") > String(current.created_at ?? "")) {
      latestByTeam.set(teamId, row);
    }
  }

  return Array.from(latestByTeam.values());
}

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

async function loadDistinctPeriodsFromStatus(
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

async function loadDistinctPeriodsFromRules(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<string[]> {
  const unique = new Set<string>();
  let offset = 0;

  while (unique.size < PERIOD_MAX_OPTIONS && offset < PERIOD_MAX_SCAN_ROWS) {
    const batchResult = await queryWithRetry(() =>
      supabase
        .from("team_incentive_rule_versions")
        .select("period_month")
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

export type TeamRulesPageFastData = {
  periodMonth: string;
  availableStatusPeriods: string[];
  rows: Array<{
    teamId: string;
    salesForceTotal: number;
    salesForceActive: number;
    salesForceVacant: number;
    latestVersionNo: number | null;
    latestVersionAt: string | null;
    rulesCount: number;
  }>;
  storageReady: boolean;
  storageMessage: string | null;
  totalTeams: number;
  configuredTeams: number;
  cloneContext: {
    latest_period: string | null;
    available_source_periods: string[];
    latest_count: number;
    target_count: number;
    can_clone: boolean;
    message: string;
  } | null;
};

async function loadTeamRulesPageFastData(periodMonthInput?: string | null): Promise<TeamRulesPageFastData> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client not available");

  const [latestPeriodResult, availableStatusPeriods] = await Promise.all([
    queryWithRetry(() =>
      supabase
        .from("sales_force_status")
        .select("period_month")
        .eq("is_deleted", false)
        .order("period_month", { ascending: false })
        .limit(1),
    ),
    loadDistinctPeriodsFromStatus(supabase),
  ]);

  const latestAvailablePeriodMonth = normalizePeriodMonthInput(
    String(latestPeriodResult.data?.[0]?.period_month ?? "").trim() || getCurrentPeriodMonth(),
  );
  if (latestPeriodResult.error) {
    const fallbackPeriod = latestAvailablePeriodMonth ?? getCurrentPeriodMonth();
    return {
      periodMonth: fallbackPeriod,
      availableStatusPeriods: [fallbackPeriod],
      rows: [],
      storageReady: false,
      storageMessage: `Conexion temporalmente inestable al cargar periodos de status: ${latestPeriodResult.error.message}`,
      totalTeams: 0,
      configuredTeams: 0,
      cloneContext: null,
    };
  }
  const statusPeriodsSafe =
    availableStatusPeriods.length > 0
      ? availableStatusPeriods
      : [latestAvailablePeriodMonth ?? getCurrentPeriodMonth()];
  const requestedPeriod = normalizePeriodMonthInput(periodMonthInput);
  const periodMonth =
    requestedPeriod && statusPeriodsSafe.includes(requestedPeriod)
      ? requestedPeriod
      : latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const salesForceResult = await queryWithRetry(() =>
    supabase
      .from("sales_force_status")
      .select("team_id, is_active, is_vacant")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
  );

  if (salesForceResult.error) {
    throw new Error(`Failed to load sales force teams: ${salesForceResult.error.message}`);
  }

  const rowsByTeam = new Map<
    string,
    {
      teamId: string;
      salesForceTotal: number;
      salesForceActive: number;
      salesForceVacant: number;
      latestVersionNo: number | null;
      latestVersionAt: string | null;
      rulesCount: number;
    }
  >();

  for (const row of (salesForceResult.data ?? []) as SalesForceTeamRow[]) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;

    const current = rowsByTeam.get(teamId) ?? {
      teamId,
      salesForceTotal: 0,
      salesForceActive: 0,
      salesForceVacant: 0,
      latestVersionNo: null,
      latestVersionAt: null,
      rulesCount: 0,
    };

    current.salesForceTotal += 1;
    if (row.is_active) current.salesForceActive += 1;
    if (row.is_vacant) current.salesForceVacant += 1;
    rowsByTeam.set(teamId, current);
  }

  let storageReady = true;
  let storageMessage: string | null = null;
  let cloneContext: TeamRulesPageFastData["cloneContext"] = null;
  let latestRowsByTeam: TeamRuleVersionRawRow[] = [];

  const [rulesVersionResult, latestRulesPeriodResult, availableSourcePeriods] = await Promise.all([
    queryWithRetry(() =>
      supabase
        .from("team_incentive_rule_versions")
        .select("team_id, version_no, created_at, rule_definition_id")
        .eq("period_month", periodMonth)
        .order("version_no", { ascending: false }),
    ),
    queryWithRetry(() =>
      supabase
        .from("team_incentive_rule_versions")
        .select("period_month")
        .order("period_month", { ascending: false })
        .limit(1),
    ),
    loadDistinctPeriodsFromRules(supabase),
  ]);

  if (rulesVersionResult.error) {
    if (isMissingRelationError(rulesVersionResult.error)) {
      storageReady = false;
      const tableName = getMissingRelationName(rulesVersionResult.error) ?? "team_incentive_rule_versions";
      storageMessage = `La tabla ${tableName} aun no existe.`;
    } else {
      throw new Error(`Failed to load team rule versions: ${rulesVersionResult.error.message}`);
    }
  } else {
    latestRowsByTeam = pickLatestVersionsByTeam((rulesVersionResult.data ?? []) as TeamRuleVersionRawRow[]);
    for (const row of latestRowsByTeam) {
      const teamId = String(row.team_id ?? "").trim();
      const current = rowsByTeam.get(teamId);
      if (!current) continue;
      current.latestVersionNo = Number(row.version_no ?? 0) || null;
      current.latestVersionAt = row.created_at ?? null;
    }

    const definitionIds = latestRowsByTeam
      .map((row) => String(row.rule_definition_id ?? "").trim())
      .filter((value) => value.length > 0);

    if (definitionIds.length > 0) {
      const itemsResult = await queryWithRetry(() =>
        supabase
          .from("team_rule_definition_items")
          .select("definition_id")
          .in("definition_id", definitionIds),
      );

      if (itemsResult.error) {
        if (isMissingRelationError(itemsResult.error)) {
          storageReady = false;
          const tableName = getMissingRelationName(itemsResult.error) ?? "team_rule_definition_items";
          storageMessage = `La tabla ${tableName} aun no existe.`;
        } else {
          throw new Error(`Failed to load rule items: ${itemsResult.error.message}`);
        }
      } else {
        const countByDefinition = new Map<string, number>();
        for (const itemRow of (itemsResult.data ?? []) as RuleItemRow[]) {
          const definitionId = String(itemRow.definition_id ?? "").trim();
          if (!definitionId) continue;
          countByDefinition.set(definitionId, (countByDefinition.get(definitionId) ?? 0) + 1);
        }
        for (const versionRow of latestRowsByTeam) {
          const teamId = String(versionRow.team_id ?? "").trim();
          const definitionId = String(versionRow.rule_definition_id ?? "").trim();
          const current = rowsByTeam.get(teamId);
          if (!current || !definitionId) continue;
          current.rulesCount = countByDefinition.get(definitionId) ?? 0;
        }
      }
    }
  }

  if (storageReady) {
    const latestRulesPeriod = normalizePeriodMonthInput(
      String(latestRulesPeriodResult.data?.[0]?.period_month ?? "").trim(),
    );
    const sourcePeriodsSafe =
      availableSourcePeriods.length > 0
        ? availableSourcePeriods
        : normalizePeriodCollection((latestRulesPeriodResult.data ?? []).map((row) => row.period_month));
    if (!latestRulesPeriod) {
      cloneContext = {
        latest_period: null,
        available_source_periods: sourcePeriodsSafe,
        latest_count: 0,
        target_count: latestRowsByTeam.length,
        can_clone: false,
        message: "Aun no hay PayComponents versionados para clonar.",
      };
    } else {
      const latestRowsResult = await supabase
        .from("team_incentive_rule_versions")
        .select("team_id, version_no, created_at, rule_definition_id")
        .eq("period_month", latestRulesPeriod);

      const latestCount = latestRowsResult.error
        ? 0
        : pickLatestVersionsByTeam((latestRowsResult.data ?? []) as TeamRuleVersionRawRow[]).length;
      const targetCount = latestRowsByTeam.length;
      const isSamePeriod = latestRulesPeriod === periodMonth;
      const canClone = latestCount > 0 && targetCount === 0 && !isSamePeriod;

      cloneContext = {
        latest_period: latestRulesPeriod,
        available_source_periods: sourcePeriodsSafe,
        latest_count: latestCount,
        target_count: targetCount,
        can_clone: canClone,
        message: canClone
          ? "Listo para clonar PayComponents al periodo destino seleccionado."
          : isSamePeriod
            ? "El periodo destino coincide con el ultimo periodo con datos."
            : targetCount > 0
              ? "El periodo destino ya tiene datos de PayComponents."
              : "No hay datos origen para clonar.",
      };
    }
  }

  const rows = Array.from(rowsByTeam.values()).sort((a, b) => a.teamId.localeCompare(b.teamId, "es"));
  const configuredTeams = rows.filter((row) => row.latestVersionNo !== null).length;

  return {
    periodMonth,
    availableStatusPeriods: statusPeriodsSafe,
    rows,
    storageReady,
    storageMessage,
    totalTeams: rows.length,
    configuredTeams,
    cloneContext,
  };
}

const getCachedTeamRulesPageFastData = unstable_cache(
  async (periodMonthInput?: string | null) => loadTeamRulesPageFastData(periodMonthInput),
  ["admin-incentive-rules-page-fast"],
  { revalidate: 120, tags: ["admin-incentive-rules"] },
);

export async function getTeamRulesPageFastData(periodMonthInput?: string | null): Promise<TeamRulesPageFastData> {
  return getCachedTeamRulesPageFastData(periodMonthInput ?? null);
}
