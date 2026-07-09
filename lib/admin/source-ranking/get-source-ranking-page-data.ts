import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import {
  getSourceRankingPeriodOptions,
  isSourceRankingPeriodAllowed,
  RANKING_REQUIRED_FILES,
  SOURCE_RANKING_PERIOD_CHECKS,
  SOURCE_RANKING_READY_TABLE_NAMES,
} from "@/lib/admin/source-ranking/constants";

type RankingSourceUploadRow = {
  file_code: string | null;
  display_name: string | null;
  original_file_name: string | null;
  uploaded_at: string | null;
  period_month: string | null;
};

type PeriodStat = {
  periodMonth: string;
  rows: number;
};

type PeriodCheck = {
  key: string;
  label: string;
  tableName: string;
  rows: number | null;
  status: "ok" | "missing" | "unknown";
};

type TableDiagnostics = {
  stats: PeriodStat[];
  selectedRows: number | null;
  message: string | null;
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
      selectedPeriodChecks: PeriodCheck[];
      periodStats: PeriodStat[];
      coverageStatus: "missing" | "aligned" | "ahead" | "behind" | "missing_period" | "unknown";
    }>;
    cutoff: {
      periodMonth: string | null;
      label: string;
      ready: boolean;
      message: string;
      options: string[];
    };
  };
};

async function loadTableDiagnostics(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  tableName: string,
  periodMonths: string[],
  selectedPeriodMonth: string | null,
): Promise<TableDiagnostics> {
  const periodRows = await Promise.all(
    periodMonths.map(async (periodMonth) => {
      const result = await loadSelectedPeriodRows(supabase, tableName, periodMonth);
      return { periodMonth, ...result };
    }),
  );

  let selectedRows: number | null = selectedPeriodMonth ? 0 : null;
  let message: string | null = null;
  const stats: PeriodStat[] = [];

  for (const row of periodRows) {
    if (row.message && !message) message = row.message;
    if (row.periodMonth === selectedPeriodMonth) selectedRows = row.rows;
    if (row.rows && row.rows > 0) {
      stats.push({ periodMonth: row.periodMonth, rows: row.rows });
    }
  }

  return {
    stats: stats.sort((a, b) => a.periodMonth.localeCompare(b.periodMonth)),
    selectedRows,
    message,
  };
}

async function loadSelectedPeriodRows(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  tableName: string,
  periodMonth: string,
): Promise<{ rows: number | null; message: string | null }> {
  const result = await supabase
    .from(tableName)
    .select("period_month", { count: "exact", head: true })
    .eq("period_month", periodMonth);

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return { rows: null, message: `Falta ${getMissingRelationName(result.error) ?? tableName}.` };
    }
    return { rows: null, message: result.error.message };
  }

  return { rows: result.count ?? 0, message: null };
}

function getMaxPeriod(stats: PeriodStat[]): string | null {
  return stats.length > 0 ? stats[stats.length - 1].periodMonth : null;
}

function getCoverageStatus(params: {
  uploaded: boolean;
  maxPeriod: string | null;
  cutoff: string | null;
  checks: PeriodCheck[];
}): "missing" | "aligned" | "ahead" | "behind" | "missing_period" | "unknown" {
  if (!params.uploaded) return "missing";
  if (!params.maxPeriod || !params.cutoff) return "unknown";
  if (params.checks.some((check) => check.status === "unknown")) return "unknown";
  if (params.checks.some((check) => check.status === "missing")) {
    return params.maxPeriod < params.cutoff ? "behind" : "missing_period";
  }
  if (params.maxPeriod === params.cutoff) return "aligned";
  return params.maxPeriod > params.cutoff ? "ahead" : "behind";
}

function getPrimaryDiagnosticsTableName(fileCode: string): string {
  if (fileCode === "kpi_local_ytd") return "ranking_kpi_local_ytd_agg";
  if (fileCode === "icva_48hrs") return "ranking_icva_48hrs_agg";
  return "ranking_source_files";
}

function buildCheckStatus(rows: number | null): PeriodCheck["status"] {
  if (rows === null) return "unknown";
  return rows > 0 ? "ok" : "missing";
}

export async function getSourceRankingPageData(periodMonthInput?: string | null): Promise<SourceRankingPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const periodOptions = getSourceRankingPeriodOptions();
  const requestedPeriod = normalizePeriodMonthInput(periodMonthInput);
  const selectedPeriodMonth =
    requestedPeriod && isSourceRankingPeriodAllowed(requestedPeriod)
      ? requestedPeriod
      : periodOptions[0] ?? null;

  let storageReady = true;
  let storageMessage: string | null = null;
  const uploadedSourceFilesByCode = new Map<string, RankingSourceUploadRow>();

  let sourceFilesQuery = supabase
    .from("ranking_source_files")
    .select("period_month, file_code, display_name, original_file_name, uploaded_at")
    .order("uploaded_at", { ascending: false });

  if (selectedPeriodMonth) {
    sourceFilesQuery = sourceFilesQuery.eq("period_month", selectedPeriodMonth);
  }

  const sourceFilesResult = await sourceFilesQuery;

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

  const tableDiagnosticsEntries = await Promise.all(
    SOURCE_RANKING_READY_TABLE_NAMES.map(async (tableName) => {
      return [
        tableName,
        await loadTableDiagnostics(supabase, tableName, periodOptions, selectedPeriodMonth),
      ] as const;
    }),
  );
  const tableDiagnosticsByName = new Map<string, TableDiagnostics>(tableDiagnosticsEntries);
  const maxPeriodByCode = new Map<string, string | null>(
    RANKING_REQUIRED_FILES.map((requiredFile) => {
      const tableName = getPrimaryDiagnosticsTableName(requiredFile.fileCode);
      return [
        requiredFile.fileCode,
        getMaxPeriod(tableDiagnosticsByName.get(tableName)?.stats ?? []),
      ];
    }),
  );
  const cutoffPeriodMonth = selectedPeriodMonth;
  const diagnosticsMessages = Array.from(
    new Set(
      Array.from(tableDiagnosticsByName.values())
        .map((diagnostics) => diagnostics.message)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const sourceFileRows = RANKING_REQUIRED_FILES.map((requiredFile) => {
    const uploadedInfo = uploadedSourceFilesByCode.get(requiredFile.fileCode);
    const normalizedMaxPeriodMonth = maxPeriodByCode.get(requiredFile.fileCode) ?? null;
    const selectedPeriodChecks = SOURCE_RANKING_PERIOD_CHECKS
      .filter((check) => check.fileCode === requiredFile.fileCode)
      .map((check) => {
        const rows = tableDiagnosticsByName.get(check.tableName)?.selectedRows ?? null;
        return {
          key: check.key,
          label: check.label,
          tableName: check.tableName,
          rows,
          status: buildCheckStatus(rows),
        };
      });
    const primaryTableName = getPrimaryDiagnosticsTableName(requiredFile.fileCode);
    return {
      fileCode: requiredFile.fileCode,
      displayName: requiredFile.displayName,
      description: requiredFile.description,
      uploaded: Boolean(uploadedInfo),
      uploadedAt: uploadedInfo?.uploaded_at ?? null,
      originalFileName: uploadedInfo?.original_file_name ?? null,
      periodMonth: uploadedInfo?.period_month ?? null,
      normalizedMaxPeriodMonth,
      selectedPeriodChecks,
      periodStats: tableDiagnosticsByName.get(primaryTableName)?.stats ?? [],
      coverageStatus: getCoverageStatus({
        uploaded: Boolean(uploadedInfo),
        maxPeriod: normalizedMaxPeriodMonth,
        cutoff: cutoffPeriodMonth,
        checks: selectedPeriodChecks,
      }),
    };
  });
  const uploadedCount = sourceFileRows.filter((row) => row.uploaded).length;
  const hasAllFiles = uploadedCount === sourceFileRows.length;
  const missingChecks = sourceFileRows.flatMap((row) =>
    row.selectedPeriodChecks
      .filter((check) => check.status === "missing")
      .map((check) => `${row.displayName}: ${check.label}`),
  );
  const hasUnknownChecks = sourceFileRows.some((row) =>
    row.selectedPeriodChecks.some((check) => check.status === "unknown"),
  );
  const hasSelectedPeriodRows = missingChecks.length === 0 && !hasUnknownChecks;
  const aligned = hasAllFiles && hasSelectedPeriodRows;
  const cutoffMessage = diagnosticsMessages.length > 0
    ? `No se pudo validar completo: ${diagnosticsMessages.join(" ")}`
    : !hasAllFiles
      ? "Faltan archivos requeridos para el periodo seleccionado."
      : missingChecks.length > 0
        ? `Para ${cutoffPeriodMonth?.slice(0, 7) ?? "el periodo seleccionado"} falta informacion en: ${missingChecks.join(", ")}.`
      : cutoffPeriodMonth
        ? aligned
          ? `Periodo listo: los archivos y las tablas de ranking tienen datos para ${cutoffPeriodMonth.slice(0, 7)}.`
          : `Falta informacion normalizada para ${cutoffPeriodMonth.slice(0, 7)} en al menos un archivo.`
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
        options: periodOptions,
      },
    },
  };
}
