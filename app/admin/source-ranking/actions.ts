"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
  sanitizeStoragePathChunk,
} from "@/lib/admin/incentive-rules/shared";
import { RANKING_REQUIRED_FILES } from "@/lib/admin/source-ranking/constants";
import {
  aggregateKpiLocalYtdRawRows,
  type DiasCicloRow,
  normalizeKpiLocalYtdRaw,
} from "@/lib/admin/source-ranking/normalize-kpi-local-ytd";
import {
  aggregateIcva48hrsRawRows,
  type Icva48AggRow,
  type IcvaKpiReferenceRow,
  normalizeIcva48hrsRaw,
} from "@/lib/admin/source-ranking/normalize-icva-48hrs";

const MAX_SOURCE_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

type IcvaAggUpsertSummary = {
  inserted: number;
  updated: number;
  skipped: number;
};

export type UploadSourceRankingFileResult =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    fileCode: string;
    uploadedPath: string;
    normalizedRows?: number;
    aggregatedRows?: number;
    normalizationSummary?: string;
  }
  | {
    ok: false;
    message: string;
  };

export type DownloadSourceRankingFileResult =
  | {
    ok: true;
    url: string;
    fileName: string;
  }
  | {
    ok: false;
    message: string;
  };

export type PrepareSourceRankingDirectUploadResult =
  | {
    ok: true;
    bucket: string;
    path: string;
    token: string;
  }
  | {
    ok: false;
    message: string;
  };

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function getSourceRankingBucketName() {
  return (
    process.env.SUPABASE_SOURCE_RANKING_BUCKET ??
    process.env.NEXT_PUBLIC_SUPABASE_SOURCE_RANKING_BUCKET ??
    "source-ranking-files"
  );
}

function sanitizeUploadedFileName(fileName: string): string {
  const safeName = sanitizeStoragePathChunk(fileName);
  if (!safeName) return "file";
  return safeName;
}

function getMaxPeriodMonth(values: Array<string | null | undefined>, fallback: string): string {
  const normalizedValues = values
    .map((value) => normalizePeriodMonthInput(value))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a));

  return normalizedValues[0] ?? fallback;
}

function toComparableNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

function makeIcvaAggKey(row: {
  period_month?: unknown;
  territorio_individual?: unknown;
  empleado?: unknown;
}) {
  const periodMonth = normalizePeriodMonthInput(String(row.period_month ?? "").trim()) ?? "";
  const territory = String(row.territorio_individual ?? "").trim().toUpperCase();
  const empleadoRaw = row.empleado;
  const empleado = empleadoRaw === null || empleadoRaw === undefined || String(empleadoRaw).trim() === ""
    ? "na"
    : String(Number(empleadoRaw));
  return `${periodMonth}|${territory}|${empleado}`;
}

async function ensureSourceRankingBucket(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  bucketName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const bucketCheckResult = await supabase.storage.getBucket(bucketName);
  if (!bucketCheckResult.error) return { ok: true };

  const message = String(bucketCheckResult.error.message ?? "").toLowerCase();
  const notFound =
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("bucket");

  if (!notFound) {
    return {
      ok: false,
      message: `No se pudo validar bucket "${bucketName}": ${bucketCheckResult.error.message}`,
    };
  }

  const createBucketResult = await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: "50MB",
  });

  if (createBucketResult.error) {
    return {
      ok: false,
      message: `No existe el bucket "${bucketName}" y no se pudo crear automaticamente: ${createBucketResult.error.message}`,
    };
  }

  return { ok: true };
}

function hasIcvaAggChanges(
  existing: {
    nombre?: unknown;
    total_calls?: unknown;
    icva_calls?: unknown;
    on_time_call?: unknown;
    on_time_icva?: unknown;
    pct_48h?: unknown;
    pct_icva?: unknown;
  },
  next: Icva48AggRow,
) {
  return (
    String(existing.nombre ?? "").trim() !== String(next.nombre ?? "").trim() ||
    toComparableNumber(existing.total_calls) !== toComparableNumber(next.total_calls) ||
    toComparableNumber(existing.icva_calls) !== toComparableNumber(next.icva_calls) ||
    toComparableNumber(existing.on_time_call) !== toComparableNumber(next.on_time_call) ||
    toComparableNumber(existing.on_time_icva) !== toComparableNumber(next.on_time_icva) ||
    toComparableNumber(existing.pct_48h) !== toComparableNumber(next.pct_48h) ||
    toComparableNumber(existing.pct_icva) !== toComparableNumber(next.pct_icva)
  );
}

async function syncIcvaAggRows(params: {
  supabase: NonNullable<ReturnType<typeof createAdminClient>>;
  periods: string[];
  rows: Icva48AggRow[];
}): Promise<{ ok: true; summary: IcvaAggUpsertSummary } | { ok: false; message: string }> {
  if (params.rows.length === 0) {
    return { ok: true, summary: { inserted: 0, updated: 0, skipped: 0 } };
  }

  const existingResult = await params.supabase
    .from("ranking_icva_48hrs_agg")
    .select("id, period_month, territorio_individual, empleado, nombre, total_calls, icva_calls, on_time_call, on_time_icva, pct_48h, pct_icva")
    .in("period_month", params.periods);

  if (existingResult.error) {
    if (isMissingRelationError(existingResult.error)) {
      const tableName = getMissingRelationName(existingResult.error) ?? "ranking_icva_48hrs_agg";
      return {
        ok: false,
        message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-icva-48hrs-agg-schema.sql y vuelve a subir el archivo.`,
      };
    }
    return {
      ok: false,
      message: `Archivo cargado, pero no se pudo leer ICVA agregado existente: ${existingResult.error.message}`,
    };
  }

  type ExistingAggRow = {
    id: string;
    period_month: string | null;
    territorio_individual: string | null;
    empleado: number | string | null;
    nombre: string | null;
    total_calls: number | string | null;
    icva_calls: number | string | null;
    on_time_call: number | string | null;
    on_time_icva: number | string | null;
    pct_48h: number | string | null;
    pct_icva: number | string | null;
  };

  const existingByKey = new Map<string, ExistingAggRow>();
  for (const row of (existingResult.data ?? []) as ExistingAggRow[]) {
    const key = makeIcvaAggKey(row);
    if (!key || existingByKey.has(key)) continue;
    existingByKey.set(key, row);
  }

  const inserts: Icva48AggRow[] = [];
  const updates: Array<{ id: string; row: Icva48AggRow }> = [];
  let skipped = 0;

  for (const row of params.rows) {
    const key = makeIcvaAggKey(row);
    const existing = existingByKey.get(key);
    if (!existing) {
      inserts.push(row);
      continue;
    }
    if (hasIcvaAggChanges(existing, row)) {
      updates.push({ id: existing.id, row });
    } else {
      skipped += 1;
    }
  }

  if (inserts.length > 0) {
    const insertResult = await params.supabase.from("ranking_icva_48hrs_agg").insert(inserts);
    if (insertResult.error) {
      if (isMissingRelationError(insertResult.error)) {
        const tableName = getMissingRelationName(insertResult.error) ?? "ranking_icva_48hrs_agg";
        return {
          ok: false,
          message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-icva-48hrs-agg-schema.sql y vuelve a subir el archivo.`,
        };
      }
      return {
        ok: false,
        message: `Archivo cargado, pero no se pudo insertar ICVA agregado: ${insertResult.error.message}`,
      };
    }
  }

  for (const item of updates) {
    const updateResult = await params.supabase
      .from("ranking_icva_48hrs_agg")
      .update({
        nombre: item.row.nombre,
        total_calls: item.row.total_calls,
        icva_calls: item.row.icva_calls,
        on_time_call: item.row.on_time_call,
        on_time_icva: item.row.on_time_icva,
        pct_48h: item.row.pct_48h,
        pct_icva: item.row.pct_icva,
      })
      .eq("id", item.id);

    if (updateResult.error) {
      return {
        ok: false,
        message: `Archivo cargado, pero no se pudo actualizar ICVA agregado: ${updateResult.error.message}`,
      };
    }
  }

  return {
    ok: true,
    summary: {
      inserted: inserts.length,
      updated: updates.length,
      skipped,
    },
  };
}

export async function prepareSourceRankingDirectUploadAction(params: {
  fileCode: string;
  displayName?: string | null;
  fileName: string;
  fileSize: number;
  contentType?: string | null;
}): Promise<PrepareSourceRankingDirectUploadResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const fileCodeInput = String(params.fileCode ?? "").trim().toLowerCase();
  const fileSize = Number(params.fileSize ?? 0);

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, message: "El archivo esta vacio." };
  }

  if (fileSize > MAX_SOURCE_FILE_SIZE_BYTES) {
    return { ok: false, message: "El archivo excede el limite de 50MB." };
  }

  const requiredFile = RANKING_REQUIRED_FILES.find((item) => item.fileCode === fileCodeInput);
  if (!requiredFile) {
    return {
      ok: false,
      message: "Archivo no permitido para Source Ranking. Refresca la vista e intenta de nuevo.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const bucketName = getSourceRankingBucketName();
  const bucketReadyResult = await ensureSourceRankingBucket(supabase, bucketName);
  if (!bucketReadyResult.ok) return bucketReadyResult;

  const safeFileName = sanitizeUploadedFileName(params.fileName);
  const safeCodeChunk = sanitizeStoragePathChunk(fileCodeInput) || "source-ranking";
  const targetPath = `_incoming/${safeCodeChunk}/${Date.now()}-${safeFileName}`;
  const signedUploadResult = await supabase.storage.from(bucketName).createSignedUploadUrl(targetPath);

  if (signedUploadResult.error || !signedUploadResult.data?.token) {
    return {
      ok: false,
      message: `No se pudo preparar la carga directa: ${signedUploadResult.error?.message ?? "token no disponible"}`,
    };
  }

  return {
    ok: true,
    bucket: bucketName,
    path: signedUploadResult.data.path || targetPath,
    token: signedUploadResult.data.token,
  };
}

export async function completeSourceRankingDirectUploadAction(params: {
  bucket: string;
  path: string;
  fileCode: string;
  displayName?: string | null;
  fileName: string;
  fileSize: number;
  contentType?: string | null;
}): Promise<UploadSourceRankingFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const bucketName = getSourceRankingBucketName();
  const bucket = String(params.bucket ?? "").trim();
  const path = String(params.path ?? "").trim();
  if (bucket !== bucketName || !path || !path.startsWith("_incoming/")) {
    return { ok: false, message: "Ruta temporal invalida para procesar el archivo." };
  }

  const fileSize = Number(params.fileSize ?? 0);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, message: "El archivo esta vacio." };
  }
  if (fileSize > MAX_SOURCE_FILE_SIZE_BYTES) {
    return { ok: false, message: "El archivo excede el limite de 50MB." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const downloadResult = await supabase.storage.from(bucketName).download(path);
  if (downloadResult.error || !downloadResult.data) {
    return {
      ok: false,
      message: `No se pudo descargar el archivo temporal de storage: ${downloadResult.error?.message ?? "archivo no disponible"}`,
    };
  }

  try {
    const file = new File(
      [await downloadResult.data.arrayBuffer()],
      sanitizeUploadedFileName(params.fileName),
      { type: params.contentType || undefined },
    );
    const formData = new FormData();
    formData.append("file_code", String(params.fileCode ?? ""));
    formData.append("display_name", String(params.displayName ?? ""));
    formData.append("file", file);
    return await uploadSourceRankingFileAction(null, formData);
  } finally {
    await supabase.storage.from(bucketName).remove([path]);
  }
}

export async function uploadSourceRankingFileAction(
  _prevState: UploadSourceRankingFileResult | null,
  formData: FormData,
): Promise<UploadSourceRankingFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const fileCodeInput = String(formData.get("file_code") ?? "").trim().toLowerCase();
  const displayNameInput = String(formData.get("display_name") ?? "").trim();
  const uploadedFile = formData.get("file");

  const requestedPeriodMonth = normalizePeriodMonthInput(periodInput);

  if (!(uploadedFile instanceof File)) {
    return { ok: false, message: "Debes seleccionar un archivo." };
  }

  if (uploadedFile.size <= 0) {
    return { ok: false, message: "El archivo esta vacio." };
  }

  if (uploadedFile.size > MAX_SOURCE_FILE_SIZE_BYTES) {
    return { ok: false, message: "El archivo excede el limite de 50MB." };
  }

  const requiredFile = RANKING_REQUIRED_FILES.find((item) => item.fileCode === fileCodeInput);
  if (!requiredFile) {
    return {
      ok: false,
      message: "Archivo no permitido para Source Ranking. Refresca la vista e intenta de nuevo.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const latestStatusPeriodResult = await supabase
    .from("sales_force_status")
    .select("period_month")
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1);

  if (latestStatusPeriodResult.error) {
    return {
      ok: false,
      message: `No se pudo buscar el ultimo status disponible: ${latestStatusPeriodResult.error.message}`,
    };
  }

  const latestStatusPeriod = normalizePeriodMonthInput(
    String(latestStatusPeriodResult.data?.[0]?.period_month ?? "").trim(),
  );
  const periodMonth = requestedPeriodMonth ?? latestStatusPeriod ?? getCurrentPeriodMonth();

  const bucketName = getSourceRankingBucketName();
  const bucketReadyResult = await ensureSourceRankingBucket(supabase, bucketName);
  if (!bucketReadyResult.ok) return bucketReadyResult;

  const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());

  let kpiNormalization:
    | ReturnType<typeof normalizeKpiLocalYtdRaw>
    | null = null;
  let icvaNormalization:
    | ReturnType<typeof normalizeIcva48hrsRaw>
    | null = null;

  if (fileCodeInput === "kpi_local_ytd" || fileCodeInput === "icva_48hrs") {
    let statusRowsResult = await supabase
      .from("sales_force_status")
      .select("territorio_individual, nombre_completo, no_empleado")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true)
      .eq("is_vacant", false);

    if (statusRowsResult.error) {
      return {
        ok: false,
        message: `No se pudo cargar status para normalizar el archivo: ${statusRowsResult.error.message}`,
      };
    }

    if ((statusRowsResult.data ?? []).length === 0) {
      const latestStatusPeriodResult = await supabase
        .from("sales_force_status")
        .select("period_month")
        .lte("period_month", periodMonth)
        .eq("is_deleted", false)
        .order("period_month", { ascending: false })
        .limit(1);

      if (latestStatusPeriodResult.error) {
        return {
          ok: false,
          message: `No se pudo buscar ultimo status disponible: ${latestStatusPeriodResult.error.message}`,
        };
      }

      const fallbackPeriod = String(latestStatusPeriodResult.data?.[0]?.period_month ?? "").trim();
      if (fallbackPeriod) {
        statusRowsResult = await supabase
          .from("sales_force_status")
          .select("territorio_individual, nombre_completo, no_empleado")
          .eq("period_month", fallbackPeriod)
          .eq("is_deleted", false)
          .eq("is_active", true)
          .eq("is_vacant", false);

        if (statusRowsResult.error) {
          return {
            ok: false,
            message: `No se pudo cargar status fallback para normalizar el archivo: ${statusRowsResult.error.message}`,
          };
        }
      }
    }

    try {
      const salesForceRows = (statusRowsResult.data ?? []) as Array<{
        territorio_individual: string | null;
        nombre_completo: string | null;
        no_empleado: number | string | null;
      }>;

      if (fileCodeInput === "kpi_local_ytd") {
        const diasCicloResult = await supabase
          .from("dias_ciclo")
          .select("period, period_month, dias_ciclo");

        let diasCicloRows: DiasCicloRow[] = [];
        if (diasCicloResult.error) {
          if (isMissingRelationError(diasCicloResult.error)) {
            const tableName = getMissingRelationName(diasCicloResult.error) ?? "dias_ciclo";
            return {
              ok: false,
              message: `No existe ${tableName}. Crea la tabla dias_ciclo antes de cargar KPI Local YTD con CPD.`,
            };
          }
          return {
            ok: false,
            message: `No se pudo cargar dias_ciclo para CPD: ${diasCicloResult.error.message}`,
          };
        } else {
          diasCicloRows = (diasCicloResult.data ?? []) as DiasCicloRow[];
        }

        kpiNormalization = normalizeKpiLocalYtdRaw({
          fileBuffer,
          periodMonth,
          salesForceRows,
          diasCicloRows,
        });
      } else {
        const kpiReferenceResult = await supabase
          .from("ranking_kpi_local_ytd_raw")
          .select("territory_source, status_nombre_source, matched_empleado, matched_nombre")
          .eq("period_month", periodMonth);

        let kpiReferenceRows: IcvaKpiReferenceRow[] = [];
        if (kpiReferenceResult.error) {
          if (isMissingRelationError(kpiReferenceResult.error)) {
            kpiReferenceRows = [];
          } else {
            return {
              ok: false,
              message: `No se pudo cargar KPI Local YTD como referencia para ICVA: ${kpiReferenceResult.error.message}`,
            };
          }
        } else {
          kpiReferenceRows = (kpiReferenceResult.data ?? []) as IcvaKpiReferenceRow[];
        }

        icvaNormalization = normalizeIcva48hrsRaw({
          fileBuffer,
          periodMonth,
          salesForceRows,
          kpiReferenceRows,
        });
      }
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `No se pudo normalizar ${fileCodeInput === "kpi_local_ytd" ? "KPI Local YTD" : "ICVA + 48 hrs"}: ${error.message}`
            : `No se pudo normalizar ${fileCodeInput === "kpi_local_ytd" ? "KPI Local YTD" : "ICVA + 48 hrs"}.`,
      };
    }
  }

  const metadataPeriodMonth = icvaNormalization
    ? getMaxPeriodMonth(icvaNormalization.rows.map((row) => row.period_month), periodMonth)
    : periodMonth;
  const safeFileName = sanitizeUploadedFileName(uploadedFile.name);
  const safeCodeChunk = sanitizeStoragePathChunk(fileCodeInput) || "source-ranking";
  const targetPath = `${metadataPeriodMonth.slice(0, 7)}/${safeCodeChunk}/${Date.now()}-${safeFileName}`;

  const uploadResult = await supabase.storage.from(bucketName).upload(targetPath, fileBuffer, {
    cacheControl: "3600",
    upsert: true,
    contentType: uploadedFile.type || undefined,
  });

  if (uploadResult.error) {
    return {
      ok: false,
      message: `No se pudo subir el archivo a storage: ${uploadResult.error.message}`,
    };
  }

  const metadataResult = await supabase.from("ranking_source_files").upsert(
    {
      period_month: metadataPeriodMonth,
      file_code: fileCodeInput,
      display_name: displayNameInput || requiredFile.displayName,
      original_file_name: uploadedFile.name,
      storage_bucket: bucketName,
      storage_path: targetPath,
      content_type: uploadedFile.type || null,
      size_bytes: uploadedFile.size,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
    },
    {
      onConflict: "period_month,file_code",
    },
  );

  if (metadataResult.error) {
    if (isMissingRelationError(metadataResult.error)) {
      const tableName = getMissingRelationName(metadataResult.error) ?? "ranking_source_files";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/source-ranking-files-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo guardar metadata del archivo: ${metadataResult.error.message}`,
    };
  }

  let normalizationSummary: string | undefined;
  let aggregatedRowsCount: number | undefined;
  if (kpiNormalization) {
    const deleteResult = await supabase
      .from("ranking_kpi_local_ytd_raw")
      .delete()
      .eq("period_month", periodMonth);

    if (deleteResult.error) {
      if (isMissingRelationError(deleteResult.error)) {
        const tableName = getMissingRelationName(deleteResult.error) ?? "ranking_kpi_local_ytd_raw";
        return {
          ok: false,
          message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-kpi-local-ytd-raw-schema.sql y vuelve a subir el archivo.`,
        };
      }
      return {
        ok: false,
        message: `Archivo cargado, pero no se pudo limpiar KPI previo del periodo: ${deleteResult.error.message}`,
      };
    }

    if (kpiNormalization.rows.length > 0) {
      const insertResult = await supabase.from("ranking_kpi_local_ytd_raw").insert(
        kpiNormalization.rows,
      );

      if (insertResult.error) {
        if (isMissingRelationError(insertResult.error)) {
          const tableName = getMissingRelationName(insertResult.error) ?? "ranking_kpi_local_ytd_raw";
          return {
            ok: false,
            message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-kpi-local-ytd-raw-schema.sql y vuelve a subir el archivo.`,
          };
        }
        return {
          ok: false,
          message: `Archivo cargado, pero no se pudo guardar KPI normalizado: ${insertResult.error.message}`,
        };
      }
    }

    const aggregatedRows = aggregateKpiLocalYtdRawRows(kpiNormalization.rows);
    aggregatedRowsCount = aggregatedRows.length;

    const deleteAggResult = await supabase
      .from("ranking_kpi_local_ytd_agg")
      .delete()
      .eq("period_month", periodMonth);

    if (deleteAggResult.error) {
      if (isMissingRelationError(deleteAggResult.error)) {
        const tableName = getMissingRelationName(deleteAggResult.error) ?? "ranking_kpi_local_ytd_agg";
        return {
          ok: false,
          message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-kpi-local-ytd-agg-schema.sql y vuelve a subir el archivo.`,
        };
      }
      return {
        ok: false,
        message: `Archivo cargado, pero no se pudo limpiar agregado KPI del periodo: ${deleteAggResult.error.message}`,
      };
    }

    if (aggregatedRows.length > 0) {
      const insertAggResult = await supabase.from("ranking_kpi_local_ytd_agg").insert(
        aggregatedRows,
      );

      if (insertAggResult.error) {
        if (isMissingRelationError(insertAggResult.error)) {
          const tableName = getMissingRelationName(insertAggResult.error) ?? "ranking_kpi_local_ytd_agg";
          return {
            ok: false,
            message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-kpi-local-ytd-agg-schema.sql y vuelve a subir el archivo.`,
          };
        }
        return {
          ok: false,
          message: `Archivo cargado, pero no se pudo guardar KPI agregado: ${insertAggResult.error.message}`,
        };
      }
    }

    const cpdPeriods = Array.from(
      new Set(
        kpiNormalization.cpdRows
          .map((row) => normalizePeriodMonthInput(row.period_month))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (cpdPeriods.length > 0) {
      const deleteCpdResult = await supabase
        .from("ranking_cpd_raw")
        .delete()
        .in("period_month", cpdPeriods);

      if (deleteCpdResult.error) {
        if (isMissingRelationError(deleteCpdResult.error)) {
          const tableName = getMissingRelationName(deleteCpdResult.error) ?? "ranking_cpd_raw";
          return {
            ok: false,
            message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/ranking-cpd-raw-schema.sql y vuelve a subir el archivo.`,
          };
        }
        return {
          ok: false,
          message: `Archivo cargado, pero no se pudo limpiar CPD raw: ${deleteCpdResult.error.message}`,
        };
      }

      if (kpiNormalization.cpdRows.length > 0) {
        const insertCpdResult = await supabase.from("ranking_cpd_raw").insert(
          kpiNormalization.cpdRows,
        );

        if (insertCpdResult.error) {
          if (isMissingRelationError(insertCpdResult.error)) {
            const tableName = getMissingRelationName(insertCpdResult.error) ?? "ranking_cpd_raw";
            return {
              ok: false,
              message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/ranking-cpd-raw-schema.sql y vuelve a subir el archivo.`,
            };
          }
          return {
            ok: false,
            message: `Archivo cargado, pero no se pudo guardar CPD raw: ${insertCpdResult.error.message}`,
          };
        }
      }
    }

    normalizationSummary =
      `KPI raw: ${kpiNormalization.rows.length} filas | agregado: ${aggregatedRows.length} reps | CPD raw: ${kpiNormalization.cpdRows.length} filas | filas YTD: ${kpiNormalization.summary.ytdRows} | ` +
      `match nombre: ${kpiNormalization.summary.nameMatchedRows} | fallback territorio: ${kpiNormalization.summary.territoryFallbackRows} | ` +
      `sin match: ${kpiNormalization.summary.unmatchedRows}` +
      (kpiNormalization.summary.cpdRowsWithoutDiasCiclo > 0
        ? ` | CPD sin dias_ciclo: ${kpiNormalization.summary.cpdRowsWithoutDiasCiclo}`
        : "");
  }

  if (icvaNormalization) {
    const icvaPeriods = Array.from(
      new Set(
        icvaNormalization.rows
          .map((row) => normalizePeriodMonthInput(row.period_month))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const periodsToReplace = icvaPeriods.length > 0 ? icvaPeriods : [periodMonth];
    const deleteRawResult = await supabase
      .from("ranking_icva_48hrs_raw")
      .delete()
      .in("period_month", periodsToReplace);

    if (deleteRawResult.error) {
      if (isMissingRelationError(deleteRawResult.error)) {
        const tableName = getMissingRelationName(deleteRawResult.error) ?? "ranking_icva_48hrs_raw";
        return {
          ok: false,
          message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-icva-48hrs-raw-schema.sql y vuelve a subir el archivo.`,
        };
      }
      return {
        ok: false,
        message: `Archivo cargado, pero no se pudo limpiar ICVA raw del periodo: ${deleteRawResult.error.message}`,
      };
    }

    if (icvaNormalization.rows.length > 0) {
      const insertRawResult = await supabase.from("ranking_icva_48hrs_raw").insert(
        icvaNormalization.rows,
      );

      if (insertRawResult.error) {
        if (isMissingRelationError(insertRawResult.error)) {
          const tableName = getMissingRelationName(insertRawResult.error) ?? "ranking_icva_48hrs_raw";
          return {
            ok: false,
            message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-icva-48hrs-raw-schema.sql y vuelve a subir el archivo.`,
          };
        }
        return {
          ok: false,
          message: `Archivo cargado, pero no se pudo guardar ICVA raw: ${insertRawResult.error.message}`,
        };
      }
    }

    const aggregatedRows = aggregateIcva48hrsRawRows(icvaNormalization.rows);
    aggregatedRowsCount = aggregatedRows.length;

    const aggSyncResult = await syncIcvaAggRows({
      supabase,
      periods: periodsToReplace,
      rows: aggregatedRows,
    });

    if (!aggSyncResult.ok) {
      return {
        ok: false,
        message: aggSyncResult.message,
      };
    }

    const previewLimit = 8;
    const unmatchedFilePreviewList = icvaNormalization.summary.unmatchedFileNames.slice(0, previewLimit);
    const unmatchedFilePreview = unmatchedFilePreviewList.join(", ");
    const unmatchedFileRemaining =
      icvaNormalization.summary.unmatchedFileNames.length - unmatchedFilePreviewList.length;
    const matchedRows = icvaNormalization.summary.normalizedRows - icvaNormalization.summary.unmatchedRows;

    normalizationSummary =
      `ICVA raw: ${icvaNormalization.rows.length} filas | periodos: ${periodsToReplace.length} | agregado: ${aggregatedRows.length} reps | ` +
      `insert: ${aggSyncResult.summary.inserted} | update: ${aggSyncResult.summary.updated} | skip: ${aggSyncResult.summary.skipped} | ` +
      `relacionadas: ${matchedRows} | sin relacion: ${icvaNormalization.summary.unmatchedRows}` +
      (unmatchedFilePreview
        ? `. Revisa sin relacion: [${unmatchedFilePreview}]${unmatchedFileRemaining > 0 ? ` +${unmatchedFileRemaining} mas` : ""}`
        : "");
  }

  revalidatePath("/admin/source-ranking");

  return {
    ok: true,
    message: normalizationSummary ? `Archivo cargado correctamente. ${normalizationSummary}` : "Archivo cargado correctamente.",
    periodMonth: metadataPeriodMonth,
    fileCode: fileCodeInput,
    uploadedPath: targetPath,
    normalizedRows: kpiNormalization?.rows.length ?? icvaNormalization?.rows.length,
    aggregatedRows: aggregatedRowsCount,
    normalizationSummary,
  };
}

export async function createSourceRankingFileDownloadUrlAction(params: {
  periodMonth?: string | null;
  fileCode: string;
}): Promise<DownloadSourceRankingFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodMonth = normalizePeriodMonthInput(params.periodMonth);
  const fileCode = String(params.fileCode ?? "").trim().toLowerCase();
  if (!fileCode) {
    return { ok: false, message: "Archivo invalido." };
  }

  const requiredFile = RANKING_REQUIRED_FILES.find((item) => item.fileCode === fileCode);
  if (!requiredFile) {
    return { ok: false, message: "Archivo no permitido para Source Ranking." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const metadataSelect = "original_file_name, storage_bucket, storage_path";
  let metadataQuery = supabase
    .from("ranking_source_files")
    .select(metadataSelect)
    .eq("file_code", fileCode)
    .order("uploaded_at", { ascending: false })
    .limit(1);

  if (periodMonth) {
    metadataQuery = metadataQuery.eq("period_month", periodMonth);
  }

  const metadataResult = await metadataQuery.maybeSingle<{
    original_file_name: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
  }>();

  if (metadataResult.error) {
    if (isMissingRelationError(metadataResult.error)) {
      const tableName = getMissingRelationName(metadataResult.error) ?? "ranking_source_files";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/source-ranking-files-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo cargar metadata del archivo: ${metadataResult.error.message}`,
    };
  }

  const metadata = metadataResult.data;
  const bucketName = String(metadata?.storage_bucket ?? "").trim();
  const storagePath = String(metadata?.storage_path ?? "").trim();
  const fileName = String(metadata?.original_file_name ?? "").trim() || `${requiredFile.fileCode}.xlsx`;
  if (!bucketName || !storagePath) {
    return { ok: false, message: "No hay archivo cargado para descargar." };
  }

  const signedUrlResult = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, 60 * 10, { download: fileName });

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    return {
      ok: false,
      message: `No se pudo generar liga de descarga: ${signedUrlResult.error?.message ?? "sin URL"}`,
    };
  }

  return {
    ok: true,
    url: signedUrlResult.data.signedUrl,
    fileName,
  };
}
