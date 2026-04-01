import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { RANKING_REQUIRED_FILES } from "@/lib/admin/source-ranking/constants";

type RankingSourceUploadRow = {
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

export type SourceRankingPageData = {
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
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
      description: string;
      uploaded: boolean;
      uploadedAt: string | null;
      originalFileName: string | null;
    }>;
  };
};

export async function getSourceRankingPageData(
  periodMonthInput?: string | null,
): Promise<SourceRankingPageData> {
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

  let storageReady = true;
  let storageMessage: string | null = null;
  const uploadedSourceFilesByCode = new Map<string, RankingSourceUploadRow>();

  const sourceFilesResult = await supabase
    .from("ranking_source_files")
    .select("file_code, display_name, original_file_name, uploaded_at")
    .eq("period_month", periodMonth);

  if (sourceFilesResult.error) {
    if (isMissingRelationError(sourceFilesResult.error)) {
      storageReady = false;
      const tableName =
        getMissingRelationName(sourceFilesResult.error) ?? "ranking_source_files";
      storageMessage =
        `La tabla ${tableName} aun no existe. Crea el esquema docs/source-ranking-files-schema.sql para habilitar este modulo.`;
    } else {
      throw new Error(
        `Failed to load source ranking files status: ${sourceFilesResult.error.message}`,
      );
    }
  } else {
    for (const row of (sourceFilesResult.data ?? []) as RankingSourceUploadRow[]) {
      const fileCode = String(row.file_code ?? "").trim().toLowerCase();
      if (!fileCode) continue;
      uploadedSourceFilesByCode.set(fileCode, row);
    }
  }

  const sourceFileRows = RANKING_REQUIRED_FILES.map((requiredFile) => {
    const uploadedInfo = uploadedSourceFilesByCode.get(requiredFile.fileCode);
    return {
      fileCode: requiredFile.fileCode,
      displayName: requiredFile.displayName,
      description: requiredFile.description,
      uploaded: Boolean(uploadedInfo),
      uploadedAt: uploadedInfo?.uploaded_at ?? null,
      originalFileName: uploadedInfo?.original_file_name ?? null,
    };
  });
  const uploadedCount = sourceFileRows.filter((row) => row.uploaded).length;

  return {
    periodMonth,
    latestAvailablePeriodMonth,
    availableStatusPeriods,
    sourceFiles: {
      storageReady,
      storageMessage,
      totalRequired: sourceFileRows.length,
      uploadedCount,
      missingCount: sourceFileRows.length - uploadedCount,
      rows: sourceFileRows,
    },
  };
}

