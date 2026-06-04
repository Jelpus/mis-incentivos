import { createAdminClient } from "@/lib/supabase/admin";
import {
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
  period_month: string | null;
};

type PeriodOnlyRow = {
  period_month: string | null;
};

type PeriodStat = {
  periodMonth: string;
  rows: number;
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
      normalizedMaxPeriodMonth: string | null;
      periodStats: PeriodStat[];
      coverageStatus: "missing" | "aligned" | "ahead" | "behind" | "unknown";
    }>;
    cutoff: {
      periodMonth: string | null;
      label: string;
      ready: boolean;
      message: string;
    };
  };
};

function buildPeriodStats(rows: PeriodOnlyRow[]): PeriodStat[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const period = normalizePeriodMonthInput(String(row.period_month ?? "").trim());
    if (!period) continue;
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([periodMonth, rowsCount]) => ({ periodMonth, rows: rowsCount }))
    .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));
}

async function loadNormalizedPeriodStats(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  tableName: string,
): Promise<{ stats: PeriodStat[]; message: string | null }> {
  const result = await supabase
    .from(tableName)
    .select("period_month")
    .order("period_month", { ascending: true })
    .limit(50000);

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return { stats: [], message: `Falta ${getMissingRelationName(result.error) ?? tableName}.` };
    }
    return { stats: [], message: result.error.message };
  }

  return { stats: buildPeriodStats((result.data ?? []) as PeriodOnlyRow[]), message: null };
}

function getMaxPeriod(stats: PeriodStat[]): string | null {
  return stats.length > 0 ? stats[stats.length - 1].periodMonth : null;
}

function getCoverageStatus(params: {
  uploaded: boolean;
  maxPeriod: string | null;
  cutoff: string | null;
}): "missing" | "aligned" | "ahead" | "behind" | "unknown" {
  if (!params.uploaded) return "missing";
  if (!params.maxPeriod || !params.cutoff) return "unknown";
  if (params.maxPeriod === params.cutoff) return "aligned";
  return params.maxPeriod > params.cutoff ? "ahead" : "behind";
}

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

  const [kpiStatsResult, icvaStatsResult] = await Promise.all([
    loadNormalizedPeriodStats(supabase, "ranking_kpi_local_ytd_raw"),
    loadNormalizedPeriodStats(supabase, "ranking_icva_48hrs_raw"),
  ]);
  const periodStatsByCode = new Map<string, PeriodStat[]>([
    ["kpi_local_ytd", kpiStatsResult.stats],
    ["icva_48hrs", icvaStatsResult.stats],
  ]);
  const maxPeriodByCode = new Map<string, string | null>([
    ["kpi_local_ytd", getMaxPeriod(kpiStatsResult.stats)],
    ["icva_48hrs", getMaxPeriod(icvaStatsResult.stats)],
  ]);
  const normalizedMaxPeriods = Array.from(maxPeriodByCode.values()).filter((value): value is string => Boolean(value));
  const cutoffPeriodMonth = normalizedMaxPeriods.length === RANKING_REQUIRED_FILES.length
    ? normalizedMaxPeriods.sort((a, b) => a.localeCompare(b))[0]
    : null;
  const diagnosticsMessages = [kpiStatsResult.message, icvaStatsResult.message].filter((value): value is string => Boolean(value));

  const sourceFileRows = RANKING_REQUIRED_FILES.map((requiredFile) => {
    const uploadedInfo = uploadedSourceFilesByCode.get(requiredFile.fileCode);
    const normalizedMaxPeriodMonth = maxPeriodByCode.get(requiredFile.fileCode) ?? null;
    return {
      fileCode: requiredFile.fileCode,
      displayName: requiredFile.displayName,
      description: requiredFile.description,
      uploaded: Boolean(uploadedInfo),
      uploadedAt: uploadedInfo?.uploaded_at ?? null,
      originalFileName: uploadedInfo?.original_file_name ?? null,
      periodMonth: uploadedInfo?.period_month ?? null,
      normalizedMaxPeriodMonth,
      periodStats: periodStatsByCode.get(requiredFile.fileCode) ?? [],
      coverageStatus: getCoverageStatus({
        uploaded: Boolean(uploadedInfo),
        maxPeriod: normalizedMaxPeriodMonth,
        cutoff: cutoffPeriodMonth,
      }),
    };
  });
  const uploadedCount = sourceFileRows.filter((row) => row.uploaded).length;
  const hasAllFiles = uploadedCount === sourceFileRows.length;
  const aligned = hasAllFiles && sourceFileRows.every((row) => row.coverageStatus === "aligned");
  const cutoffMessage = diagnosticsMessages.length > 0
    ? `No se pudo validar completo: ${diagnosticsMessages.join(" ")}`
    : !hasAllFiles
      ? "Faltan archivos requeridos para definir un corte usable."
      : cutoffPeriodMonth
        ? aligned
          ? `Los dos archivos estan alineados al corte ${cutoffPeriodMonth.slice(0, 7)}.`
          : `El corte usable sera ${cutoffPeriodMonth.slice(0, 7)} porque algun archivo no llega al mes maximo de los demas.`
        : "No se detectaron periodos normalizados en los archivos cargados.";

  return {
    sourceFiles: {
      storageReady,
      storageMessage,
      totalRequired: sourceFileRows.length,
      uploadedCount,
      missingCount: sourceFileRows.length - uploadedCount,
      rows: sourceFileRows,
      cutoff: {
        periodMonth: cutoffPeriodMonth,
        label: cutoffPeriodMonth ? cutoffPeriodMonth.slice(0, 7) : "-",
        ready: aligned,
        message: cutoffMessage,
      },
    },
  };
}
