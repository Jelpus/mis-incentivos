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
  type IcvaKpiReferenceRow,
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
        kpiNormalization = normalizeKpiLocalYtdRaw({
          fileBuffer,
          periodMonth,
          salesForceRows,
        });
      } else {
        const kpiReferenceResult = await supabase
          .from("ranking_kpi_local_ytd_raw")
          .select("territory_source, status_nombre_source, matched_empleado, matched_nombre")
          .eq("period_month", periodMonth);

        if (kpiReferenceResult.error) {
          if (isMissingRelationError(kpiReferenceResult.error)) {
            const tableName = getMissingRelationName(kpiReferenceResult.error) ?? "ranking_kpi_local_ytd_raw";
            return {
              ok: false,
              message: `Para cargar ICVA primero debe existir ${tableName}. Ejecuta docs/source-ranking-kpi-local-ytd-raw-schema.sql y carga KPI Local YTD.`,
            };
          }

          return {
            ok: false,
            message: `No se pudo cargar KPI Local YTD como referencia para ICVA: ${kpiReferenceResult.error.message}`,
          };
        }

        const kpiReferenceRows = (kpiReferenceResult.data ?? []) as IcvaKpiReferenceRow[];
        if (kpiReferenceRows.length === 0) {
          return {
            ok: false,
            message: "Carga primero KPI Local YTD para este periodo. ICVA necesita STATUS.NOMBRE y STATUS.TERRITORIO de KPI para asignar rutas.",
          };
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
    const statusFallbackPreviewList = icvaNormalization.summary.statusFallbackMatchedNames;
    const statusFallbackHintPreviewList = icvaNormalization.summary.statusFallbackKpiCandidateHints;
    const referenceWithoutDataPreviewList = icvaNormalization.summary.kpiReferenceWithoutIcvaNames;
    const unmatchedFilePreview = unmatchedFilePreviewList.join(", ");
    const statusFallbackPreview = statusFallbackPreviewList.join(", ");
    const statusFallbackHintPreview = statusFallbackHintPreviewList.join("; ");
    const referenceWithoutDataPreview = referenceWithoutDataPreviewList.join(", ");
    const unmatchedFileRemaining =
      icvaNormalization.summary.unmatchedFileNames.length - unmatchedFilePreviewList.length;
    const statusFallbackRemaining =
      icvaNormalization.summary.statusFallbackMatchedNames.length - statusFallbackPreviewList.length;
    const referenceWithoutDataRemaining =
      icvaNormalization.summary.kpiReferenceWithoutIcvaNames.length - referenceWithoutDataPreviewList.length;

    normalizationSummary =
      `ICVA raw: ${icvaNormalization.rows.length} filas | agregado: ${aggregatedRows.length} reps | ` +
      `match nombre: ${icvaNormalization.summary.nameMatchedRows} ` +
      `(KPI: ${icvaNormalization.summary.kpiMatchedRows}, status fallback: ${icvaNormalization.summary.statusFallbackMatchedRows}) | ` +
      `sin match: ${icvaNormalization.summary.unmatchedRows}. ` +
      (statusFallbackPreview
        ? `Fallback status (mostrando ${statusFallbackPreviewList.length}): [${statusFallbackPreview}]${statusFallbackRemaining > 0 ? ` +${statusFallbackRemaining} mas` : ""}. `
        : "") +
      (statusFallbackHintPreview
        ? `Mejor candidato KPI para fallback: [${statusFallbackHintPreview}]. `
        : "") +
      `Sin relacion (archivo): ${icvaNormalization.summary.unmatchedFileNames.length}` +
      (unmatchedFilePreview
        ? ` (mostrando ${unmatchedFilePreviewList.length}): [${unmatchedFilePreview}]${unmatchedFileRemaining > 0 ? ` +${unmatchedFileRemaining} mas` : ""}`
        : "") +
      `. Nombres KPI sin data ICVA: ${icvaNormalization.summary.kpiReferenceWithoutIcvaNames.length}` +
      (referenceWithoutDataPreview
        ? ` (mostrando ${referenceWithoutDataPreviewList.length}): [${referenceWithoutDataPreview}]${referenceWithoutDataRemaining > 0 ? ` +${referenceWithoutDataRemaining} mas` : ""}`
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

export async function createSourceRankingFileDownloadUrlAction(params: {
  periodMonth: string;
  fileCode: string;
}): Promise<DownloadSourceRankingFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodMonth = normalizePeriodMonthInput(params.periodMonth);
  const fileCode = String(params.fileCode ?? "").trim().toLowerCase();
  if (!periodMonth || !fileCode) {
    return { ok: false, message: "Periodo o archivo invalido." };
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
  let metadataResult = await supabase
    .from("ranking_source_files")
    .select(metadataSelect)
    .eq("period_month", periodMonth)
    .eq("file_code", fileCode)
    .maybeSingle<{
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

  if (!metadataResult.data) {
    metadataResult = await supabase
      .from("ranking_source_files")
      .select(metadataSelect)
      .eq("file_code", fileCode)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        original_file_name: string | null;
        storage_bucket: string | null;
        storage_path: string | null;
      }>();

    if (metadataResult.error) {
      return {
        ok: false,
        message: `No se pudo buscar el ultimo archivo cargado: ${metadataResult.error.message}`,
      };
    }
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
