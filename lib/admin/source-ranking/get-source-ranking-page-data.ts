import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
} from "@/lib/admin/incentive-rules/shared";
import { RANKING_REQUIRED_FILES } from "@/lib/admin/source-ranking/constants";

type RankingSourceUploadRow = {
  file_code: string | null;
  display_name: string | null;
  original_file_name: string | null;
  uploaded_at: string | null;
  period_month: string | null;
};

export type SourceRankingPageData = {
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
      periodMonth: string | null;
    }>;
  };
};

export async function getSourceRankingPageData(): Promise<SourceRankingPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  let storageReady = true;
  let storageMessage: string | null = null;
  const uploadedSourceFilesByCode = new Map<string, RankingSourceUploadRow>();

  const sourceFilesResult = await supabase
    .from("ranking_source_files")
    .select("period_month, file_code, display_name, original_file_name, uploaded_at")
    .order("uploaded_at", { ascending: false });

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
      if (uploadedSourceFilesByCode.has(fileCode)) continue;
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
      periodMonth: uploadedInfo?.period_month ?? null,
    };
  });
  const uploadedCount = sourceFileRows.filter((row) => row.uploaded).length;

  return {
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
