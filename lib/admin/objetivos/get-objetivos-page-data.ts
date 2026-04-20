import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

type ObjectiveVersionRow = {
  id: string;
  version_no: number;
  source_file_name: string | null;
  sheet_name: string | null;
  total_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  missing_required_count: number | null;
  summary: Record<string, unknown> | null;
  created_at: string | null;
  created_by: string | null;
};

function hasStoredSourceFile(
  summary: Record<string, unknown> | null,
  source: "private" | "drilldown",
): boolean {
  if (!summary || typeof summary !== "object") return false;
  const sourceFiles = summary.sourceFiles;
  if (!sourceFiles || typeof sourceFiles !== "object") return false;
  const sourceMetadata = (sourceFiles as Record<string, unknown>)[source];
  if (!sourceMetadata || typeof sourceMetadata !== "object") return false;

  const bucket = String((sourceMetadata as Record<string, unknown>).storageBucket ?? "").trim();
  const path = String((sourceMetadata as Record<string, unknown>).storagePath ?? "").trim();

  return Boolean(bucket && path);
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

export type ObjetivosPageData = {
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  availableStatusPeriods: string[];
  storageReady: boolean;
  storageMessage: string | null;
  latestVersion: {
    versionNo: number;
    createdAt: string | null;
    sourceFileName: string | null;
    sheetName: string | null;
    validRows: number;
    invalidRows: number;
    missingRequiredCount: number;
  } | null;
  versions: Array<{
    id: string;
    versionNo: number;
    sourceFileName: string | null;
    sheetName: string | null;
    hasPrivateFile: boolean;
    hasDrillDownFile: boolean;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    missingRequiredCount: number;
    createdAt: string | null;
    createdBy: string | null;
  }>;
};

async function loadObjetivosPageData(
  periodMonthInput?: string | null,
): Promise<ObjetivosPageData> {
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

  let storageReady = true;
  let storageMessage: string | null = null;
  let versions: ObjetivosPageData["versions"] = [];

  const versionsResult = await supabase
    .from("team_objective_target_versions")
    .select(
      "id, version_no, source_file_name, sheet_name, total_rows, valid_rows, invalid_rows, missing_required_count, summary, created_at, created_by",
    )
    .eq("period_month", periodMonth)
    .order("version_no", { ascending: false })
    .limit(20);

  if (versionsResult.error) {
    if (isMissingRelationError(versionsResult.error)) {
      storageReady = false;
      const tableName =
        getMissingRelationName(versionsResult.error) ?? "team_objective_target_versions";
      storageMessage =
        `La tabla ${tableName} aun no existe. Crea docs/team-objectives-schema.sql para habilitar Gestion de Objetivos.`;
    } else {
      throw new Error(`Failed to load objective versions: ${versionsResult.error.message}`);
    }
  } else {
    const rawRows = (versionsResult.data ?? []) as ObjectiveVersionRow[];
    versions = rawRows.map((row) => ({
      id: row.id,
      versionNo: Number(row.version_no ?? 0),
      sourceFileName: row.source_file_name ?? null,
      sheetName: row.sheet_name ?? null,
      hasPrivateFile: hasStoredSourceFile(row.summary, "private"),
      hasDrillDownFile: hasStoredSourceFile(row.summary, "drilldown"),
      totalRows: Number(row.total_rows ?? 0),
      validRows: Number(row.valid_rows ?? 0),
      invalidRows: Number(row.invalid_rows ?? 0),
      missingRequiredCount: Number(row.missing_required_count ?? 0),
      createdAt: row.created_at ?? null,
      createdBy: row.created_by ?? null,
    }));
  }

  const latest = versions[0] ?? null;

  return {
    periodMonth,
    latestAvailablePeriodMonth,
    availableStatusPeriods,
    storageReady,
    storageMessage,
    latestVersion: latest
      ? {
        versionNo: latest.versionNo,
        createdAt: latest.createdAt,
        sourceFileName: latest.sourceFileName,
        sheetName: latest.sheetName,
        validRows: latest.validRows,
        invalidRows: latest.invalidRows,
        missingRequiredCount: latest.missingRequiredCount,
      }
      : null,
    versions,
  };
}

const getCachedObjetivosPageData = unstable_cache(
  async (periodMonthInput?: string | null) => loadObjetivosPageData(periodMonthInput),
  ["admin-objetivos-page"],
  { revalidate: 120, tags: ["admin-objetivos"] },
);

export async function getObjetivosPageData(
  periodMonthInput?: string | null,
): Promise<ObjetivosPageData> {
  return getCachedObjetivosPageData(periodMonthInput ?? null);
}
