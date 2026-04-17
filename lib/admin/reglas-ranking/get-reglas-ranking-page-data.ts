import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { loadRuleDefinitionsByIds } from "@/lib/admin/incentive-rules/rule-definition-normalized";

type TeamRuleVersionRow = {
  team_id: string | null;
  version_no: number | null;
  created_at: string | null;
  rule_definition_id: string | null;
};

type JsonLike = Record<string, unknown>;

function formatMaxTwoDecimals(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return raw;

  const rounded = Math.round(parsed * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return rounded.toString();
}

function normalizePeriodCollection(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePeriodMonthInput(String(value ?? "").trim()))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

function pickLatestVersionsByTeam(rows: TeamRuleVersionRow[]): TeamRuleVersionRow[] {
  const latestByTeam = new Map<string, TeamRuleVersionRow>();

  for (const row of rows) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;

    const current = latestByTeam.get(teamId);
    if (!current) {
      latestByTeam.set(teamId, row);
      continue;
    }

    const currentVersion = Number(current.version_no ?? 0);
    const rowVersion = Number(row.version_no ?? 0);
    if (rowVersion > currentVersion) {
      latestByTeam.set(teamId, row);
      continue;
    }
    if (rowVersion === currentVersion && String(row.created_at ?? "") > String(current.created_at ?? "")) {
      latestByTeam.set(teamId, row);
    }
  }

  return Array.from(latestByTeam.values());
}

function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readFromExtraFields(extraFields: unknown, keys: string[]): string {
  if (!extraFields || typeof extraFields !== "object" || Array.isArray(extraFields)) return "";
  const row = extraFields as JsonLike;
  const normalizedMap = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(row)) {
    normalizedMap.set(normalizeHeaderKey(rawKey), String(rawValue ?? "").trim());
  }
  for (const key of keys) {
    const value = normalizedMap.get(normalizeHeaderKey(key));
    if (value) return value;
  }
  return "";
}

export type ReglasRankingPageData = {
  periodMonth: string;
  availableStatusPeriods: string[];
  complementsStorageReady: boolean;
  complementsStorageMessage: string | null;
  rankingOptions: string[];
  puntosRankingLvuOptions: string[];
  rows: Array<{
    teamId: string;
    productName: string;
    ranking: string;
    puntosRankingLvu: string;
    prodWeight: string;
    source: "rules" | "complement";
  }>;
};

export async function getReglasRankingPageData(
  periodMonthInput?: string | null,
): Promise<ReglasRankingPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const [latestPeriodResult, statusPeriodsResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false })
      .limit(1),
    supabase
      .from("sales_force_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false }),
  ]);

  if (latestPeriodResult.error) {
    throw new Error(`Failed to load latest period: ${latestPeriodResult.error.message}`);
  }
  if (statusPeriodsResult.error) {
    throw new Error(`Failed to load status periods: ${statusPeriodsResult.error.message}`);
  }

  const latestAvailablePeriodMonth = normalizePeriodMonthInput(
    String(latestPeriodResult.data?.[0]?.period_month ?? "").trim(),
  );
  const availableStatusPeriods = normalizePeriodCollection(
    (statusPeriodsResult.data ?? []).map((row) => row.period_month),
  );

  const requestedPeriod = normalizePeriodMonthInput(periodMonthInput);
  const periodMonth =
    requestedPeriod && availableStatusPeriods.includes(requestedPeriod)
      ? requestedPeriod
      : latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const versionsResult = await supabase
    .from("team_incentive_rule_versions")
    .select("team_id, version_no, created_at, rule_definition_id")
    .eq("period_month", periodMonth)
    .order("team_id", { ascending: true })
    .order("version_no", { ascending: false });

  if (versionsResult.error) {
    throw new Error(`Failed to load rule versions: ${versionsResult.error.message}`);
  }

  const latestByTeam = pickLatestVersionsByTeam((versionsResult.data ?? []) as TeamRuleVersionRow[]);
  const definitionIds = Array.from(
    new Set(
      latestByTeam
        .map((row) => String(row.rule_definition_id ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );
  const definitionsById =
    definitionIds.length > 0
      ? await loadRuleDefinitionsByIds({
          supabase,
          definitionIds,
        })
      : new Map<string, JsonLike>();
  const rows: ReglasRankingPageData["rows"] = [];
  const rowsByKey = new Map<string, ReglasRankingPageData["rows"][number]>();

  for (const version of latestByTeam) {
    const teamId = String(version.team_id ?? "").trim();
    if (!teamId) continue;
    const definitionId = String(version.rule_definition_id ?? "").trim();
    const definition = definitionId ? definitionsById.get(definitionId) ?? null : null;
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) continue;
    const definitionObj = definition as JsonLike;
    const rules = Array.isArray(definitionObj.rules) ? definitionObj.rules : [];

    for (const ruleItem of rules) {
      if (!ruleItem || typeof ruleItem !== "object" || Array.isArray(ruleItem)) continue;
      const rule = ruleItem as JsonLike;
      const productName = String(rule.product_name ?? "").trim();
      if (!productName) continue;

      const extraFields = rule.extra_fields;
      const ranking =
        readFromExtraFields(extraFields, ["ranking"]) ||
        String(rule.ranking ?? "").trim();
      const puntosRankingLvu = formatMaxTwoDecimals(
        readFromExtraFields(extraFields, ["puntos_ranking_lvu", "puntos ranking lvu"]) ||
        String(rule.puntos_ranking_lvu ?? "").trim(),
      );
      const prodWeight = formatMaxTwoDecimals(
        String(rule.prod_weight ?? "").trim() ||
          readFromExtraFields(extraFields, ["prod_weigh", "prod_weight", "product_weight"]),
      );

      const rowData = {
        teamId,
        productName,
        ranking,
        puntosRankingLvu,
        prodWeight,
        source: "rules" as const,
      };
      rowsByKey.set(`${teamId.toUpperCase()}|${productName.toUpperCase()}`, rowData);
      rows.push(rowData);
    }
  }

  let complementsStorageReady = true;
  let complementsStorageMessage: string | null = null;
  const complementsResult = await supabase
    .from("ranking_rule_complements")
    .select("team_id, product_name, ranking, puntos_ranking_lvu, prod_weight")
    .eq("period_month", periodMonth)
    .eq("is_active", true);

  if (complementsResult.error) {
    if (isMissingRelationError(complementsResult.error)) {
      complementsStorageReady = false;
      const tableName = getMissingRelationName(complementsResult.error) ?? "ranking_rule_complements";
      complementsStorageMessage =
        `Tabla ${tableName} no creada. Ejecuta docs/ranking-rule-complements-schema.sql.`;
    } else {
      throw new Error(`Failed to load ranking complements: ${complementsResult.error.message}`);
    }
  } else {
    type ComplementRow = {
      team_id: string | null;
      product_name: string | null;
      ranking: string | null;
      puntos_ranking_lvu: number | string | null;
      prod_weight: number | string | null;
    };

    for (const item of (complementsResult.data ?? []) as ComplementRow[]) {
      const teamId = String(item.team_id ?? "").trim();
      const productName = String(item.product_name ?? "").trim();
      if (!teamId || !productName) continue;
      const key = `${teamId.toUpperCase()}|${productName.toUpperCase()}`;
      const ranking = String(item.ranking ?? "").trim();
      const puntosRankingLvu = formatMaxTwoDecimals(String(item.puntos_ranking_lvu ?? "").trim());
      const prodWeight = formatMaxTwoDecimals(String(item.prod_weight ?? "").trim());

      const existing = rowsByKey.get(key);
      if (existing) {
        const merged = {
          ...existing,
          ranking: ranking || existing.ranking,
          puntosRankingLvu: puntosRankingLvu || existing.puntosRankingLvu,
          prodWeight: prodWeight || existing.prodWeight,
          source: "complement" as const,
        };
        rowsByKey.set(key, merged);
      } else {
        rowsByKey.set(key, {
          teamId,
          productName,
          ranking,
          puntosRankingLvu,
          prodWeight,
          source: "complement",
        });
      }
    }
  }

  const finalRows = Array.from(rowsByKey.values());
  finalRows.sort((a, b) => {
    const teamCmp = a.teamId.localeCompare(b.teamId, "es");
    if (teamCmp !== 0) return teamCmp;
    return a.productName.localeCompare(b.productName, "es");
  });

  const rankingOptions = Array.from(
    new Set(
      finalRows
        .map((row) => row.ranking.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const puntosRankingLvuOptions = Array.from(
    new Set(
      finalRows
        .map((row) => row.puntosRankingLvu.trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => Number(a) - Number(b));

  return {
    periodMonth,
    availableStatusPeriods,
    complementsStorageReady,
    complementsStorageMessage,
    rankingOptions,
    puntosRankingLvuOptions,
    rows: finalRows,
  };
}
