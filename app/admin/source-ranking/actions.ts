"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
  sanitizeStoragePathChunk,
} from "@/lib/admin/incentive-rules/shared";
import { RANKING_REQUIRED_FILES } from "@/lib/admin/source-ranking/constants";
import {
  aggregateKpiLocalYtdRawRows,
  normalizeKpiLocalYtdRaw,
} from "@/lib/admin/source-ranking/normalize-kpi-local-ytd";
import {
  aggregateIcva48hrsRawRows,
  normalizeIcva48hrsRaw,
} from "@/lib/admin/source-ranking/normalize-icva-48hrs";

const MAX_SOURCE_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

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

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function sanitizeUploadedFileName(fileName: string): string {
  const safeName = sanitizeStoragePathChunk(fileName);
  if (!safeName) return "file";
  return safeName;
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

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido. Usa formato YYYY-MM o YYYY-MM-01." };
  }

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

  const statusPeriodValidation = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (statusPeriodValidation.error) {
    return {
      ok: false,
      message: `No se pudo validar el periodo en Status: ${statusPeriodValidation.error.message}`,
    };
  }

  if ((statusPeriodValidation.count ?? 0) === 0) {
    return {
      ok: false,
      message: "No existe informacion en sales_force_status para el periodo seleccionado.",
    };
  }

  const bucketName =
    process.env.SUPABASE_SOURCE_RANKING_BUCKET ??
    process.env.NEXT_PUBLIC_SUPABASE_SOURCE_RANKING_BUCKET ??
    "source-ranking-files";

  const bucketCheckResult = await supabase.storage.getBucket(bucketName);
  if (bucketCheckResult.error) {
    const message = String(bucketCheckResult.error.message ?? "").toLowerCase();
    const notFound =
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("bucket");

    if (notFound) {
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
    } else {
      return {
        ok: false,
        message: `No se pudo validar bucket "${bucketName}": ${bucketCheckResult.error.message}`,
      };
    }
  }

  const safeFileName = sanitizeUploadedFileName(uploadedFile.name);
  const safeCodeChunk = sanitizeStoragePathChunk(fileCodeInput) || "source-ranking";
  const targetPath = `${periodMonth.slice(0, 7)}/${safeCodeChunk}/${Date.now()}-${safeFileName}`;
  const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());

  let kpiNormalization:
    | ReturnType<typeof normalizeKpiLocalYtdRaw>
    | null = null;
  let icvaNormalization:
    | ReturnType<typeof normalizeIcva48hrsRaw>
    | null = null;

  if (fileCodeInput === "kpi_local_ytd" || fileCodeInput === "icva_48hrs") {
    const statusRowsResult = await supabase
      .from("sales_force_status")
      .select("territorio_individual, nombre_completo, no_empleado")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true)
      .eq("is_vacant", false);

    if (statusRowsResult.error) {
      return {
        ok: false,
        message: `No se pudo cargar status para normalizar KPI Local YTD: ${statusRowsResult.error.message}`,
      };
    }

    try {
      const salesForceRows = (statusRowsResult.data ?? []) as Array<{
        territorio_individual: string | null;
        nombre_completo: string | null;
        no_empleado: number | string | null;
      }>;

      if (fileCodeInput === "kpi_local_ytd") {
        kpiNormalization = normalizeKpiLocalYtdRaw({
          fileBuffer,
          periodMonth,
          salesForceRows,
        });
      } else {
        icvaNormalization = normalizeIcva48hrsRaw({
          fileBuffer,
          periodMonth,
          salesForceRows,
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
      period_month: periodMonth,
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

    normalizationSummary =
      `KPI raw: ${kpiNormalization.rows.length} filas | agregado: ${aggregatedRows.length} reps | filas YTD: ${kpiNormalization.summary.ytdRows} | ` +
      `match nombre: ${kpiNormalization.summary.nameMatchedRows} | fallback territorio: ${kpiNormalization.summary.territoryFallbackRows} | ` +
      `sin match: ${kpiNormalization.summary.unmatchedRows}`;
  }

  if (icvaNormalization) {
    const deleteRawResult = await supabase
      .from("ranking_icva_48hrs_raw")
      .delete()
      .eq("period_month", periodMonth);

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

    const deleteAggResult = await supabase
      .from("ranking_icva_48hrs_agg")
      .delete()
      .eq("period_month", periodMonth);

    if (deleteAggResult.error) {
      if (isMissingRelationError(deleteAggResult.error)) {
        const tableName = getMissingRelationName(deleteAggResult.error) ?? "ranking_icva_48hrs_agg";
        return {
          ok: false,
          message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-icva-48hrs-agg-schema.sql y vuelve a subir el archivo.`,
        };
      }
      return {
        ok: false,
        message: `Archivo cargado, pero no se pudo limpiar ICVA agregado del periodo: ${deleteAggResult.error.message}`,
      };
    }

    if (aggregatedRows.length > 0) {
      const insertAggResult = await supabase.from("ranking_icva_48hrs_agg").insert(
        aggregatedRows,
      );

      if (insertAggResult.error) {
        if (isMissingRelationError(insertAggResult.error)) {
          const tableName = getMissingRelationName(insertAggResult.error) ?? "ranking_icva_48hrs_agg";
          return {
            ok: false,
            message: `Archivo cargado, pero falta la tabla ${tableName}. Ejecuta docs/source-ranking-icva-48hrs-agg-schema.sql y vuelve a subir el archivo.`,
          };
        }
        return {
          ok: false,
          message: `Archivo cargado, pero no se pudo guardar ICVA agregado: ${insertAggResult.error.message}`,
        };
      }
    }

    const unmatchedFilePreviewList = icvaNormalization.summary.unmatchedFileNames;
    const statusWithoutDataPreviewList = icvaNormalization.summary.statusWithoutDataNames;
    const unmatchedFilePreview = unmatchedFilePreviewList.join(", ");
    const statusWithoutDataPreview = statusWithoutDataPreviewList.join(", ");
    const unmatchedFileRemaining =
      icvaNormalization.summary.unmatchedFileNames.length - unmatchedFilePreviewList.length;
    const statusWithoutDataRemaining =
      icvaNormalization.summary.statusWithoutDataNames.length - statusWithoutDataPreviewList.length;

    normalizationSummary =
      `ICVA raw: ${icvaNormalization.rows.length} filas | agregado: ${aggregatedRows.length} reps | ` +
      `match nombre: ${icvaNormalization.summary.nameMatchedRows} | sin match: ${icvaNormalization.summary.unmatchedRows}. ` +
      `Sin relacion (archivo): ${icvaNormalization.summary.unmatchedFileNames.length}` +
      (unmatchedFilePreview
        ? ` (mostrando ${unmatchedFilePreviewList.length}): [${unmatchedFilePreview}]${unmatchedFileRemaining > 0 ? ` +${unmatchedFileRemaining} mas` : ""}`
        : "") +
      `. Status sin data: ${icvaNormalization.summary.statusWithoutDataNames.length}` +
      (statusWithoutDataPreview
        ? ` (mostrando ${statusWithoutDataPreviewList.length}): [${statusWithoutDataPreview}]${statusWithoutDataRemaining > 0 ? ` +${statusWithoutDataRemaining} mas` : ""}`
        : "");
  }

  revalidatePath("/admin/source-ranking");

  return {
    ok: true,
    message: normalizationSummary ? `Archivo cargado correctamente. ${normalizationSummary}` : "Archivo cargado correctamente.",
    periodMonth,
    fileCode: fileCodeInput,
    uploadedPath: targetPath,
    normalizedRows: kpiNormalization?.rows.length ?? icvaNormalization?.rows.length,
    aggregatedRows: aggregatedRowsCount,
    normalizationSummary,
  };
}
