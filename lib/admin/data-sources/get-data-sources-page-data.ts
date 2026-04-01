import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuleDefinitionsByIds } from "@/lib/admin/incentive-rules/rule-definition-normalized";
import { getCurrentPeriodMonth, normalizePeriodMonthInput, normalizeSourceFileCode } from "@/lib/admin/incentive-rules/shared";

type TeamRuleVersionRawRow = {
  team_id: string;
  version_no: number;
  created_at: string;
  rule_definition_id: string;
};

type TeamSourceFileUploadRow = {
  file_code: string | null;
  display_name: string | null;
  original_file_name: string | null;
  uploaded_at: string | null;
};

type RuleRow = {
  sources?: unknown;
  file1?: unknown;
  file2?: unknown;
  file3?: unknown;
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

export type DataSourcesPageData = {
  periodMonth: string;
  availableStatusPeriods: string[];
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

export async function getDataSourcesPageData(periodMonthInput?: string | null): Promise<DataSourcesPageData> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client not available");

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

  if (latestPeriodResult.error) throw new Error(latestPeriodResult.error.message);
  if (statusPeriodsResult.error) throw new Error(statusPeriodsResult.error.message);

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
    .eq("period_month", periodMonth);

  const requiredSourceFilesMap = new Map<string, { fileCode: string; displayName: string; usageCount: number }>();
  let storageReady = true;
  let storageMessage: string | null = null;

  if (!versionsResult.error) {
    const latestRowsByTeam = pickLatestVersionsByTeam((versionsResult.data ?? []) as TeamRuleVersionRawRow[]);
    const definitionIds = latestRowsByTeam
      .map((row) => String(row.rule_definition_id ?? "").trim())
      .filter((value) => value.length > 0);

    const definitionsById = await loadRuleDefinitionsByIds({ supabase, definitionIds });
    for (const latestRow of latestRowsByTeam) {
      const definition = definitionsById.get(String(latestRow.rule_definition_id ?? "").trim()) ?? null;
      collectRequiredSourceFiles(definition, requiredSourceFilesMap);
    }
  } else {
    storageReady = false;
    storageMessage = "No fue posible cargar reglas para detectar archivos requeridos.";
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
      storageReady = false;
      storageMessage = "No fue posible cargar estado de archivos subidos.";
    } else {
      for (const row of (sourceFilesResult.data ?? []) as TeamSourceFileUploadRow[]) {
        const fileCode = normalizeSourceFileCode(row.file_code);
        if (!fileCode) continue;
        uploadedSourceFilesByCode.set(fileCode, row);
      }
    }
  }

  const rows = requiredSourceFiles.map((requirement) => {
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
  const uploadedCount = rows.filter((row) => row.uploaded).length;

  return {
    periodMonth,
    availableStatusPeriods,
    sourceFiles: {
      storageReady,
      storageMessage,
      totalRequired: rows.length,
      uploadedCount,
      missingCount: rows.length - uploadedCount,
      rows,
    },
  };
}

