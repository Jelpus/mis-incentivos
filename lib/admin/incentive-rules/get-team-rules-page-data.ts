import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
  normalizeSourceFileCode,
} from "@/lib/admin/incentive-rules/shared";
import { loadRuleDefinitionsByIds } from "@/lib/admin/incentive-rules/rule-definition-normalized";

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
  rule_definition_id: string;
  rule_definition: Record<string, unknown> | null;
};

type TeamRuleVersionRawRow = {
  team_id: string;
  version_no: number;
  created_at: string;
  rule_definition_id: string;
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
  rulesCount: number;
  productNamesSummary: string;
  productWeightSumPercent: number | null;
  productWeightStatus: "ok" | "incomplete" | "empty";
};

export type TeamRulesPageData = {
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  availableStatusPeriods: string[];
  rows: TeamRulesListRow[];
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
  sourceFiles: {
    storageReady: boolean;
    storageMessage: string | null;
    totalRequired: number;
    uploadedCount: number;
    missingCount: number;
    rows: Array<{
      fileCode: string;
      displayName: string;
      usageCount: number;
      uploaded: boolean;
      uploadedAt: string | null;
      originalFileName: string | null;
    }>;
  };
};

type RuleRow = {
  product_name?: unknown;
  prod_weight?: unknown;
  sources?: unknown;
  file1?: unknown;
  file2?: unknown;
  file3?: unknown;
};

type TeamSourceFileUploadRow = {
  file_code: string | null;
  display_name: string | null;
  original_file_name: string | null;
  uploaded_at: string | null;
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

function parseWeight(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectRequiredSourceFiles(
  ruleDefinition: Record<string, unknown> | null,
  accumulator: Map<string, { fileCode: string; displayName: string; usageCount: number }>,
) {
  const rulesRaw = Array.isArray(ruleDefinition?.rules)
    ? (ruleDefinition.rules as unknown[])
    : [];

  for (const item of rulesRaw) {
    if (!item || typeof item !== "object") continue;
    const rule = item as RuleRow;
    const currentRuleCodes = new Set<string>();
    const values: string[] = [];

    if (Array.isArray(rule.sources)) {
      for (const sourceItem of rule.sources) {
        if (!sourceItem || typeof sourceItem !== "object") continue;
        const source = sourceItem as Record<string, unknown>;
        const value = String(source.file ?? "").trim();
        if (value) values.push(value);
      }
    } else {
      values.push(
        String(rule.file1 ?? "").trim(),
        String(rule.file2 ?? "").trim(),
        String(rule.file3 ?? "").trim(),
      );
    }

    for (const rawValue of values) {
      const displayName = String(rawValue ?? "").trim();
      if (!displayName) continue;

      const fileCode = normalizeSourceFileCode(displayName);
      if (!fileCode || currentRuleCodes.has(fileCode)) continue;
      currentRuleCodes.add(fileCode);

      const current = accumulator.get(fileCode);
      if (!current) {
        accumulator.set(fileCode, {
          fileCode,
          displayName,
          usageCount: 1,
        });
      } else {
        current.usageCount += 1;
        if (
          current.displayName.length === 0 ||
          displayName.length < current.displayName.length
        ) {
          current.displayName = displayName;
        }
      }
    }
  }
}

function buildRuleSummary(ruleDefinition: Record<string, unknown> | null): {
  rulesCount: number;
  productNamesSummary: string;
  productWeightSumPercent: number | null;
  productWeightStatus: "ok" | "incomplete" | "empty";
} {
  const rulesRaw = Array.isArray(ruleDefinition?.rules)
    ? (ruleDefinition.rules as unknown[])
    : [];

  const rules = rulesRaw.filter(
    (item): item is RuleRow => Boolean(item) && typeof item === "object",
  );

  if (rules.length === 0) {
    return {
      rulesCount: 0,
      productNamesSummary: "-",
      productWeightSumPercent: null,
      productWeightStatus: "empty",
    };
  }

  const productNames = Array.from(
    new Set(
      rules
        .map((rule) => String(rule.product_name ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  const sumRaw = rules
    .map((rule) => parseWeight(rule.prod_weight))
    .filter((value): value is number => value !== null)
    .reduce((acc, value) => acc + value, 0);

  const sumPercent = sumRaw <= 1.5 ? sumRaw * 100 : sumRaw;
  const isOk = Math.abs(sumPercent - 100) <= 0.1;

  return {
    rulesCount: rules.length,
    productNamesSummary: productNames.length > 0 ? productNames.join(" | ") : "-",
    productWeightSumPercent: Number(sumPercent.toFixed(2)),
    productWeightStatus: isOk ? "ok" : "incomplete",
  };
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

export async function getTeamRulesPageData(
  periodMonthInput?: string | null,
): Promise<TeamRulesPageData> {
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

  const [
    salesForceResult,
    managerResult,
    rulesVersionResult,
    latestRulesPeriodResult,
    allRulesPeriodsResult,
  ] = await Promise.all([
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
      .select("team_id, version_no, created_at, rule_definition_id")
      .eq("period_month", periodMonth)
      .order("version_no", { ascending: false }),
    supabase
      .from("team_incentive_rule_versions")
      .select("period_month")
      .order("period_month", { ascending: false })
      .limit(1),
    supabase
      .from("team_incentive_rule_versions")
      .select("period_month")
      .order("period_month", { ascending: false }),
  ]);

  if (salesForceResult.error) {
    throw new Error(`Failed to load sales force teams: ${salesForceResult.error.message}`);
  }

  if (managerResult.error) {
    throw new Error(`Failed to load manager teams: ${managerResult.error.message}`);
  }

  if (latestRulesPeriodResult.error) {
    if (!isMissingRelationError(latestRulesPeriodResult.error)) {
      throw new Error(`Failed to load latest rules period: ${latestRulesPeriodResult.error.message}`);
    }
  }

  if (allRulesPeriodsResult.error) {
    if (!isMissingRelationError(allRulesPeriodsResult.error)) {
      throw new Error(`Failed to load available rules periods: ${allRulesPeriodsResult.error.message}`);
    }
  }

  let storageReady = true;
  let storageMessage: string | null = null;
  let ruleVersions: TeamRuleVersionRow[] = [];

  if (rulesVersionResult.error) {
    if (isMissingRelationError(rulesVersionResult.error)) {
      storageReady = false;
      const tableName =
        getMissingRelationName(rulesVersionResult.error) ?? "team_incentive_rule_versions";
      storageMessage =
        `La tabla ${tableName} aun no existe. Puedes crearla y luego versionar reglas.`;
    } else {
      throw new Error(`Failed to load team rule versions: ${rulesVersionResult.error.message}`);
    }
  } else {
    const rawRows = (rulesVersionResult.data ?? []) as TeamRuleVersionRawRow[];
    const latestRowsByTeam = pickLatestVersionsByTeam(rawRows);
    const definitionIds = latestRowsByTeam
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
    ruleVersions = latestRowsByTeam.map((row) => ({
      ...row,
      rule_definition:
        definitionsById.get(String(row.rule_definition_id ?? "").trim()) ?? null,
    }));
  }

  const rowsByTeam = new Map<string, TeamRulesListRow>();
  const latestRuleDefinitionByTeam = new Map<string, Record<string, unknown> | null>();

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
      rulesCount: 0,
      productNamesSummary: "-",
      productWeightSumPercent: null,
      productWeightStatus: "empty",
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
      rulesCount: 0,
      productNamesSummary: "-",
      productWeightSumPercent: null,
      productWeightStatus: "empty",
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
      const summary = buildRuleSummary(version.rule_definition);
      current.rulesCount = summary.rulesCount;
      current.productNamesSummary = summary.productNamesSummary;
      current.productWeightSumPercent = summary.productWeightSumPercent;
      current.productWeightStatus = summary.productWeightStatus;
      latestRuleDefinitionByTeam.set(version.team_id, version.rule_definition);
    }
  }

  const rows = Array.from(rowsByTeam.values()).sort((a, b) =>
    a.teamId.localeCompare(b.teamId, "es"),
  );

  let cloneContext: TeamRulesPageData["cloneContext"] = null;
  const latestRulesPeriod = normalizePeriodMonthInput(
    String(latestRulesPeriodResult.data?.[0]?.period_month ?? "").trim(),
  );

  if (storageReady) {
    if (!latestRulesPeriod) {
      cloneContext = {
        latest_period: null,
        available_source_periods: [],
        latest_count: 0,
        target_count: 0,
        can_clone: false,
        message: "Aun no hay reglas versionadas para clonar.",
      };
    } else {
      const [latestRulesRowsResult] = await Promise.all([
        supabase
          .from("team_incentive_rule_versions")
          .select("team_id, version_no, created_at, rule_definition_id")
          .eq("period_month", latestRulesPeriod),
      ]);

      if (latestRulesRowsResult.error) {
        cloneContext = {
          latest_period: latestRulesPeriod,
          available_source_periods: [],
          latest_count: 0,
          target_count: 0,
          can_clone: false,
          message: "No fue posible cargar contexto de clonacion de PayComponents.",
        };
      } else {
        const latestTeams = new Set(
          pickLatestVersionsByTeam(
            (latestRulesRowsResult.data ?? []) as TeamRuleVersionRawRow[],
          )
            .map((row) => String(row.team_id ?? "").trim())
            .filter((value) => value.length > 0),
        );
        const targetTeams = new Set(
          ruleVersions
            .map((row) => String(row.team_id ?? "").trim())
            .filter((value) => value.length > 0),
        );
        const availableSourcePeriods = normalizePeriodCollection(
          (allRulesPeriodsResult.data ?? []).map((row) => row.period_month),
        );

        const latestCount = latestTeams.size;
        const targetCount = targetTeams.size;
        const isSamePeriod = latestRulesPeriod === periodMonth;
        const canClone = latestCount > 0 && targetCount === 0 && !isSamePeriod;
        const message = canClone
          ? "Listo para clonar PayComponents al periodo destino seleccionado."
          : isSamePeriod
            ? "El periodo destino coincide con el ultimo periodo con datos."
            : targetCount > 0
              ? "El periodo destino ya tiene datos de PayComponents."
              : "No hay datos origen para clonar.";

        cloneContext = {
          latest_period: latestRulesPeriod,
          available_source_periods: availableSourcePeriods,
          latest_count: latestCount,
          target_count: targetCount,
          can_clone: canClone,
          message,
        };
      }
    }
  }

  let sourceFilesStorageReady = true;
  let sourceFilesStorageMessage: string | null = null;
  const requiredSourceFilesMap = new Map<
    string,
    { fileCode: string; displayName: string; usageCount: number }
  >();

  for (const definition of latestRuleDefinitionByTeam.values()) {
    collectRequiredSourceFiles(definition, requiredSourceFilesMap);
  }

  const requiredSourceFiles = Array.from(requiredSourceFilesMap.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es"),
  );
  const uploadedSourceFilesByCode = new Map<string, TeamSourceFileUploadRow>();

  if (requiredSourceFiles.length > 0) {
    const sourceFilesResult = await supabase
      .from("team_incentive_source_files")
      .select("file_code, display_name, original_file_name, uploaded_at")
      .eq("period_month", periodMonth);

    if (sourceFilesResult.error) {
      if (isMissingRelationError(sourceFilesResult.error)) {
        sourceFilesStorageReady = false;
        const tableName =
          getMissingRelationName(sourceFilesResult.error) ?? "team_incentive_source_files";
        sourceFilesStorageMessage =
          `La tabla ${tableName} aun no existe. Crea la tabla para cargar archivos fuente.`;
      } else {
        throw new Error(
          `Failed to load source files status: ${sourceFilesResult.error.message}`,
        );
      }
    } else {
      for (const row of (sourceFilesResult.data ?? []) as TeamSourceFileUploadRow[]) {
        const fileCode = normalizeSourceFileCode(row.file_code);
        if (!fileCode) continue;
        uploadedSourceFilesByCode.set(fileCode, row);
      }
    }
  }

  const sourceFileRows = requiredSourceFiles.map((requirement) => {
    const uploadedInfo = uploadedSourceFilesByCode.get(requirement.fileCode);
    return {
      fileCode: requirement.fileCode,
      displayName: requirement.displayName,
      usageCount: requirement.usageCount,
      uploaded: Boolean(uploadedInfo),
      uploadedAt: uploadedInfo?.uploaded_at ?? null,
      originalFileName: uploadedInfo?.original_file_name ?? null,
    };
  });
  const uploadedSourceCount = sourceFileRows.filter((row) => row.uploaded).length;

  return {
    periodMonth,
    latestAvailablePeriodMonth,
    availableStatusPeriods,
    rows,
    storageReady,
    storageMessage,
    totalTeams: rows.length,
    configuredTeams: rows.filter((row) => row.latestVersionNo !== null).length,
    cloneContext,
    sourceFiles: {
      storageReady: sourceFilesStorageReady,
      storageMessage: sourceFilesStorageMessage,
      totalRequired: sourceFileRows.length,
      uploadedCount: uploadedSourceCount,
      missingCount: sourceFileRows.length - uploadedSourceCount,
      rows: sourceFileRows,
    },
  };
}
