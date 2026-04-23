"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createImportBatchFromExcel } from "@/lib/import-engine/supabase-import-service";
import { previewSalesForceImportBatch } from "@/lib/import-engine/preview-sales-force";
import { previewManagerImportBatch } from "@/lib/import-engine/preview-manager";

type UploadStatusImportResult =
  | {
      ok: true;
      batchId: string;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

type UnifiedUploadStatusImportResult =
  | {
      ok: true;
      message: string;
      svaBatchId: string;
      svmBatchId: string;
    }
  | {
      ok: false;
      message: string;
      svaBatchId?: string;
      svmBatchId?: string;
    };

type ClonePeriodResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type ResolveMappingsResult =
  | { ok: true; message: string; batchId: string }
  | { ok: false; message: string; batchId?: string };

type ApplyImportBatchResult =
  | { ok: true; message: string; batchId: string }
  | { ok: false; message: string; batchId?: string };

type SaveSalesForceStatusResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type SaveManagerStatusResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const DEFAULT_VALID_SINCE_PERIOD = "2026-01-01";

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

async function uploadImportByType(
  formData: FormData,
  importTypeCode: "sales_force_status" | "manager_status",
): Promise<UploadStatusImportResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const file = formData.get("file");
  const periodMonth = String(formData.get("period_month") ?? "").trim();
  const sheetName = String(formData.get("sheet_name") ?? "").trim();

  if (!(file instanceof File)) {
    return {
      ok: false,
      message: "No se recibió ningún archivo.",
    };
  }

  if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
    return {
      ok: false,
      message: "El archivo debe ser Excel (.xlsx o .xls).",
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const result = await createImportBatchFromExcel({
      importTypeCode,
      fileName: file.name,
      fileBuffer: buffer,
      periodMonth: periodMonth ? `${periodMonth}-01` : null,
      selectedSheetName: sheetName || null,
      userId: user.id,
    });

    revalidatePath("/admin/status");

    return {
      ok: true,
      batchId: result.batchId,
      message:
        importTypeCode === "sales_force_status"
          ? "Archivo cargado correctamente."
          : "Archivo de managers cargado correctamente.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo procesar el archivo.",
    };
  }
}

function isExcelFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

export async function uploadUnifiedStatusImportAction(
  _prevState: UnifiedUploadStatusImportResult | null,
  formData: FormData,
): Promise<UnifiedUploadStatusImportResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const importMode = String(formData.get("import_mode") ?? "shared").trim();
  const periodMonth = String(formData.get("period_month") ?? "").trim();
  const svaSheetName = String(formData.get("sva_sheet_name") ?? "").trim();
  const svmSheetName = String(formData.get("svm_sheet_name") ?? "").trim();

  if (!periodMonth) {
    return {
      ok: false,
      message: "Debes seleccionar un período.",
    };
  }

  if (!svaSheetName || !svmSheetName) {
    return {
      ok: false,
      message: "Debes indicar la pestaña para SVA y SVM.",
    };
  }

  const sharedFile = formData.get("shared_file");
  const svaFileInput = formData.get("sva_file");
  const svmFileInput = formData.get("svm_file");

  const loadBuffer = async (
    input: FormDataEntryValue | null,
    label: string,
  ): Promise<{ fileName: string; buffer: Buffer } | { error: string }> => {
    if (!(input instanceof File)) {
      return {
        error: `No se recibió archivo para ${label}.`,
      };
    }

    if (!isExcelFile(input)) {
      return {
        error: `El archivo de ${label} debe ser Excel (.xlsx o .xls).`,
      };
    }

    const arrayBuffer = await input.arrayBuffer();

    return {
      fileName: input.name,
      buffer: Buffer.from(arrayBuffer),
    };
  };

  let svaFileName = "";
  let svmFileName = "";
  let svaBuffer: Buffer;
  let svmBuffer: Buffer;

  if (importMode === "shared") {
    const sharedResult = await loadBuffer(sharedFile, "SVA/SVM");
    if ("error" in sharedResult) {
      return {
        ok: false,
        message: sharedResult.error,
      };
    }

    svaFileName = sharedResult.fileName;
    svmFileName = sharedResult.fileName;
    svaBuffer = sharedResult.buffer;
    svmBuffer = sharedResult.buffer;
  } else if (importMode === "separate") {
    const svaResult = await loadBuffer(svaFileInput, "SVA");
    if ("error" in svaResult) {
      return {
        ok: false,
        message: svaResult.error,
      };
    }

    const svmResult = await loadBuffer(svmFileInput, "SVM");
    if ("error" in svmResult) {
      return {
        ok: false,
        message: svmResult.error,
      };
    }

    svaFileName = svaResult.fileName;
    svmFileName = svmResult.fileName;
    svaBuffer = svaResult.buffer;
    svmBuffer = svmResult.buffer;
  } else {
    return {
      ok: false,
      message: "Modo de importación inválido.",
    };
  }

  let svaBatchId: string | undefined;
  let svmBatchId: string | undefined;

  try {
    const svaResult = await createImportBatchFromExcel({
      importTypeCode: "sales_force_status",
      fileName: svaFileName,
      fileBuffer: svaBuffer,
      periodMonth: `${periodMonth}-01`,
      selectedSheetName: svaSheetName,
      userId: user.id,
    });
    svaBatchId = svaResult.batchId;
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `No se pudo procesar SVA: ${error.message}`
          : "No se pudo procesar SVA.",
    };
  }

  try {
    const svmResult = await createImportBatchFromExcel({
      importTypeCode: "manager_status",
      fileName: svmFileName,
      fileBuffer: svmBuffer,
      periodMonth: `${periodMonth}-01`,
      selectedSheetName: svmSheetName,
      userId: user.id,
    });
    svmBatchId = svmResult.batchId;
  } catch (error) {
    revalidatePath("/admin/status");
    return {
      ok: false,
      message:
        error instanceof Error
          ? `SVA se creó correctamente, pero falló SVM: ${error.message}`
          : "SVA se creó correctamente, pero falló SVM.",
      svaBatchId,
    };
  }

  revalidatePath("/admin/status");

  return {
    ok: true,
    message: "Se crearon los batches de SVA y SVM correctamente.",
    svaBatchId,
    svmBatchId,
  };
}

export async function uploadStatusImportAction(
  _prevState: UploadStatusImportResult | null,
  formData: FormData,
): Promise<UploadStatusImportResult> {
  return uploadImportByType(formData, "sales_force_status");
}

export async function uploadManagerImportAction(
  _prevState: UploadStatusImportResult | null,
  formData: FormData,
): Promise<UploadStatusImportResult> {
  return uploadImportByType(formData, "manager_status");
}

export async function goToStatusImportBatchAction(formData: FormData) {
  const batchId = String(formData.get("batch_id") ?? "").trim();

  if (!batchId) {
    redirect("/admin/status");
  }

  redirect(`/admin/status/imports/${batchId}`);
}

export async function cloneSalesForcePeriodAction(
  _prevState: ClonePeriodResult | null,
  formData: FormData,
): Promise<ClonePeriodResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const sourcePeriod = String(formData.get("source_period") ?? "");
  const targetPeriod = String(formData.get("target_period") ?? "");
  const activeOnly = String(formData.get("active_only") ?? "true") !== "false";

  if (!sourcePeriod || !targetPeriod) {
    return {
      ok: false,
      message: "Faltan periodos para realizar la copia.",
    };
  }

  const adminSupabase = createAdminClient();

  if (!adminSupabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const sourcePeriodDate = `${sourcePeriod}-01`;
  const targetPeriodDate = `${targetPeriod}-01`;
  const userSupabase = await createClient();

  const cloneParamsCandidates = [
    {
      p_source_period: sourcePeriodDate,
      p_target_period: targetPeriodDate,
      p_active_only: activeOnly,
    },
    {
      p_source_period: sourcePeriodDate,
      p_target_period: targetPeriodDate,
      p_active_only: activeOnly,
      p_actor_user_id: user.id,
    },
    {
      p_source_period: sourcePeriodDate,
      p_target_period: targetPeriodDate,
      p_active_only: activeOnly,
      p_actor_id: user.id,
    },
  ];

  let salesForceCloneData: unknown = null;
  let salesForceCloneErrorMessage: string | null = null;

  for (const client of [userSupabase, adminSupabase]) {
    for (const params of cloneParamsCandidates) {
      const { data, error } = await client.rpc("clone_sales_force_period", params);

      if (!error) {
        salesForceCloneData = data;
        salesForceCloneErrorMessage = null;
        break;
      }

      salesForceCloneErrorMessage = error.message;
    }

    if (!salesForceCloneErrorMessage) {
      break;
    }
  }

  if (salesForceCloneErrorMessage) {
    return {
      ok: false,
      message: salesForceCloneErrorMessage,
    };
  }

  const { count: targetManagersCount, error: targetManagersCountError } =
    await adminSupabase
      .from("manager_status")
      .select("id", { count: "exact", head: true })
      .eq("period_month", targetPeriodDate)
      .eq("is_deleted", false);

  if (targetManagersCountError) {
    return {
      ok: false,
      message: `No se pudo validar managers en destino: ${targetManagersCountError.message}`,
    };
  }

  if ((targetManagersCount ?? 0) > 0) {
    return {
      ok: false,
      message: "El periodo destino ya tiene managers cargados.",
    };
  }

  let managersQuery = adminSupabase
    .from("manager_status")
    .select(
      `
        territorio_manager,
        nombre_manager,
        correo_manager,
        no_empleado_manager,
        team_id,
        is_active,
        is_vacant
      `,
    )
    .eq("period_month", sourcePeriodDate)
    .eq("is_deleted", false);

  if (activeOnly) {
    managersQuery = managersQuery.eq("is_active", true);
  }

  const { data: sourceManagers, error: sourceManagersError } = await managersQuery;

  if (sourceManagersError) {
    return {
      ok: false,
      message: `No se pudo leer managers del periodo origen: ${sourceManagersError.message}`,
    };
  }

  const managerInsertRows = (sourceManagers ?? []).map((row) => ({
    period_month: targetPeriodDate,
    territorio_manager: row.territorio_manager,
    nombre_manager: row.nombre_manager,
    correo_manager: row.correo_manager,
    no_empleado_manager: row.no_empleado_manager,
    team_id: row.team_id,
    is_active: row.is_active,
    is_vacant: row.is_vacant,
    source_type: "manual",
    import_batch_id: null,
    created_by: user.id,
    updated_by: user.id,
  }));

  if (managerInsertRows.length > 0) {
    const { error: insertManagersError } = await adminSupabase
      .from("manager_status")
      .insert(managerInsertRows);

    if (insertManagersError) {
      return {
        ok: false,
        message: `No se pudo copiar managers: ${insertManagersError.message}`,
      };
    }
  }

  revalidatePath("/admin/status");

  const salesForceMessage =
    (salesForceCloneData as { message?: string } | null)?.message ??
    "SVA copiado correctamente";

  return {
    ok: true,
    message: `${salesForceMessage}. SVM copiados: ${managerInsertRows.length}.`,
  };
}

export async function resolveImportMappingsAction(
  _prevState: ResolveMappingsResult | null,
  formData: FormData,
): Promise<ResolveMappingsResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const batchId = String(formData.get("batch_id") ?? "");
  const importTypeCode = String(formData.get("import_type_code") ?? "");

  if (!batchId || !importTypeCode) {
    return {
      ok: false,
      message: "Faltan datos del batch o del tipo de importación.",
    };
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
      batchId,
    };
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, mapping_snapshot")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return {
      ok: false,
      message: "No se encontró el batch.",
      batchId,
    };
  }

  const existingSnapshot = (batch.mapping_snapshot ?? {}) as Record<string, string | null>;
  const nextSnapshot: Record<string, string | null> = {};

  for (const header of Object.keys(existingSnapshot)) {
    nextSnapshot[header] = null;
  }

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field__")) continue;

    const targetField = key.replace("field__", "");
    const rawHeader = String(value ?? "").trim();

    if (!targetField || !rawHeader) continue;

    nextSnapshot[rawHeader] = targetField;

    const { error: upsertError } = await supabase.rpc("upsert_import_column_mapping", {
      p_import_type_code: importTypeCode,
      p_excel_header: rawHeader,
      p_target_field: targetField,
      p_confidence: 1,
      p_created_by: user.id,
    });

    if (upsertError) {
      return {
        ok: false,
        message: `No se pudo guardar el mapping "${rawHeader} -> ${targetField}": ${upsertError.message}`,
        batchId,
      };
    }
  }

  const { error: updateSnapshotError } = await supabase.rpc(
    "update_import_batch_mapping_snapshot",
    {
      p_batch_id: batchId,
      p_mapping_snapshot: nextSnapshot,
    },
  );

  if (updateSnapshotError) {
    return {
      ok: false,
      message: `No se pudo actualizar el mapping del batch: ${updateSnapshotError.message}`,
      batchId,
    };
  }

  try {
    if (importTypeCode === "sales_force_status") {
      await previewSalesForceImportBatch(batchId);
    } else if (importTypeCode === "manager_status") {
      await previewManagerImportBatch(batchId);
    } else {
      return {
        ok: false,
        message: `No hay preview configurado para el import type "${importTypeCode}".`,
        batchId,
      };
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo generar el preview del batch.",
      batchId,
    };
  }

  revalidatePath("/admin/status");
  revalidatePath(`/admin/status/imports/${batchId}`);

  return {
    ok: true,
    message: "Mappings guardados y preview generado correctamente.",
    batchId,
  };
}

export async function applyImportBatchAction(
  _prevState: ApplyImportBatchResult | null,
  formData: FormData,
): Promise<ApplyImportBatchResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const batchId = String(formData.get("batch_id") ?? "");
  const importTypeCode = String(formData.get("import_type_code") ?? "");

  if (!batchId || !importTypeCode) {
    return {
      ok: false,
      message: "Faltan datos del batch.",
      batchId,
    };
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
      batchId,
    };
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, status, preview_summary")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return {
      ok: false,
      message: "No se encontró el batch.",
      batchId,
    };
  }

  if (batch.status !== "preview_ready") {
    return {
      ok: false,
      message: `El batch no está listo para aplicar. Estado actual: ${batch.status}.`,
      batchId,
    };
  }

  const previewSummary = (batch.preview_summary ?? {}) as Record<string, unknown>;
  const invalidRows = Number(previewSummary.invalid_rows ?? 0);

  if (invalidRows > 0) {
    return {
      ok: false,
      message: "No se puede aplicar el batch porque existen filas inválidas.",
      batchId,
    };
  }

  const applyRpcName =
    importTypeCode === "sales_force_status"
      ? "apply_import_batch_sales_force_status"
      : importTypeCode === "manager_status"
        ? "apply_import_batch_manager_status"
        : null;

  if (!applyRpcName) {
    return {
      ok: false,
      message: `Todavía no existe apply para el import type "${importTypeCode}".`,
      batchId,
    };
  }

  const { data: applyResult, error: applyError } = await supabase.rpc(
    applyRpcName,
    {
      p_batch_id: batchId,
      p_actor_user_id: user.id,
    },
  );

  if (applyError) {
    return {
      ok: false,
      message: applyError.message,
      batchId,
    };
  }

  revalidatePath("/admin/status");
  revalidatePath(`/admin/status/imports/${batchId}`);

  const appliedCount =
    (applyResult as { results?: { applied_count?: number } } | null)?.results
      ?.applied_count ?? 0;

  return {
    ok: true,
    message: `Batch aplicado correctamente. Registros procesados: ${appliedCount}.`,
    batchId,
  };
}

function parseOptionalInteger(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return null;

  return parsed;
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  return parsed;
}

function normalizeDateInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function isValidEmail(value: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
}

export async function saveSalesForceStatusAction(
  _prevState: SaveSalesForceStatusResult | null,
  formData: FormData,
): Promise<SaveSalesForceStatusResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const mode = String(formData.get("mode") ?? "").trim();
  const statusId = String(formData.get("status_id") ?? "").trim();
  const periodMonth = String(formData.get("period_month") ?? "").trim();
  const lineaPrincipal = String(formData.get("linea_principal") ?? "").trim();
  const parrilla = String(formData.get("parrilla") ?? "").trim();
  const nombreCompleto = String(formData.get("nombre_completo") ?? "").trim();
  const territorioPadre = String(formData.get("territorio_padre") ?? "").trim();
  const territorioIndividual = String(formData.get("territorio_individual") ?? "").trim();
  const puesto = String(formData.get("puesto") ?? "").trim();
  const teamId = String(formData.get("team_id") ?? "").trim();
  const correo = String(formData.get("correo_electronico") ?? "").trim();
  const ciudad = String(formData.get("ciudad") ?? "").trim();
  const fechaIngreso = String(formData.get("fecha_ingreso") ?? "").trim();
  const validSincePeriodInput = String(
    formData.get("valid_since_period") ?? "",
  ).trim();
  const isActiveRow = String(formData.get("is_active") ?? "") === "on";
  const isVacant = String(formData.get("is_vacant") ?? "") === "on";

  const noEmpleado = parseOptionalInteger(formData.get("no_empleado"));
  const baseIncentivos = parseOptionalNumber(formData.get("base_incentivos"));
  const validSincePeriod =
    normalizeDateInput(validSincePeriodInput) ?? DEFAULT_VALID_SINCE_PERIOD;

  if (mode !== "create" && mode !== "edit") {
    return {
      ok: false,
      message: "Modo inválido.",
    };
  }

  if (mode === "edit" && !statusId) {
    return {
      ok: false,
      message: "Falta el identificador del registro a editar.",
    };
  }

  if (!periodMonth) {
    return {
      ok: false,
      message: "Falta el período.",
    };
  }

  const requiredTextFields: Array<[string, string]> = [
    ["linea_principal", lineaPrincipal],
    ["parrilla", parrilla],
    ["nombre_completo", nombreCompleto],
    ["territorio_padre", territorioPadre],
    ["territorio_individual", territorioIndividual],
    ["puesto", puesto],
    ["team_id", teamId],
  ];

  const missingField = requiredTextFields.find(([, value]) => !value);
  if (missingField) {
    return {
      ok: false,
      message: `Falta ${missingField[0]}.`,
    };
  }

  if (baseIncentivos === null || baseIncentivos < 0) {
    return {
      ok: false,
      message: "base_incentivos es requerido y debe ser mayor o igual a 0.",
    };
  }

  if (!isVacant) {
    if (noEmpleado === null || noEmpleado <= 0) {
      return {
        ok: false,
        message: "no_empleado es requerido si no es vacante.",
      };
    }

    if (!correo) {
      return {
        ok: false,
        message: "correo_electronico es requerido si no es vacante.",
      };
    }

    if (!isValidEmail(correo)) {
      return {
        ok: false,
        message: "correo_electronico inválido.",
      };
    }
  } else if (correo && !isValidEmail(correo)) {
    return {
      ok: false,
      message: "correo_electronico inválido.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const payload = {
    period_month: periodMonth,
    linea_principal: lineaPrincipal,
    parrilla,
    nombre_completo: nombreCompleto,
    no_empleado: noEmpleado,
    territorio_padre: territorioPadre,
    territorio_individual: territorioIndividual,
    puesto,
    correo_electronico: correo || null,
    ciudad: ciudad || null,
    fecha_ingreso: fechaIngreso || null,
    valid_since_period: validSincePeriod,
    team_id: teamId,
    base_incentivos: baseIncentivos,
    is_active: isActiveRow,
    is_vacant: isVacant,
    source_type: "manual",
    record_origin: "manual",
    import_batch_id: null,
    updated_by: user.id,
  };

  if (mode === "create") {
    const { error } = await supabase.from("sales_force_status").insert({
      ...payload,
      created_by: user.id,
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }
  } else {
    const { error } = await supabase
      .from("sales_force_status")
      .update(payload)
      .eq("id", statusId);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }
  }

  revalidatePath("/admin/status");

  return {
    ok: true,
    message: mode === "create" ? "Registro creado." : "Registro actualizado.",
  };
}

export async function saveManagerStatusAction(
  _prevState: SaveManagerStatusResult | null,
  formData: FormData,
): Promise<SaveManagerStatusResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const mode = String(formData.get("mode") ?? "").trim();
  const managerId = String(formData.get("manager_id") ?? "").trim();
  const periodMonth = String(formData.get("period_month") ?? "").trim();
  const territorioManager = String(formData.get("territorio_manager") ?? "").trim();
  const nombreManager = String(formData.get("nombre_manager") ?? "").trim();
  const correoManager = String(formData.get("correo_manager") ?? "").trim();
  const isActiveRow = String(formData.get("is_active") ?? "") === "on";
  const isVacant = String(formData.get("is_vacant") ?? "") === "on";
  const noEmpleadoManager = parseOptionalInteger(formData.get("no_empleado_manager"));

  if (mode !== "create" && mode !== "edit") {
    return {
      ok: false,
      message: "Modo inválido.",
    };
  }

  if (mode === "edit" && !managerId) {
    return {
      ok: false,
      message: "Falta el identificador del manager a editar.",
    };
  }

  if (!periodMonth || !territorioManager || !nombreManager) {
    return {
      ok: false,
      message: "Faltan campos requeridos del manager.",
    };
  }

  if (!isVacant) {
    if (noEmpleadoManager === null || noEmpleadoManager <= 0) {
      return {
        ok: false,
        message: "no_empleado_manager es requerido si no es vacante.",
      };
    }

    if (!correoManager) {
      return {
        ok: false,
        message: "correo_manager es requerido si no es vacante.",
      };
    }
  }

  if (correoManager && !isValidEmail(correoManager)) {
    return {
      ok: false,
      message: "correo_manager inválido.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const payload = {
    period_month: periodMonth,
    territorio_manager: territorioManager,
    nombre_manager: nombreManager,
    correo_manager: correoManager || null,
    no_empleado_manager: noEmpleadoManager,
    is_active: isActiveRow,
    is_vacant: isVacant,
    source_type: "manual",
    import_batch_id: null,
    updated_by: user.id,
  };

  if (mode === "create") {
    const { error } = await supabase.from("manager_status").insert({
      ...payload,
      created_by: user.id,
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }
  } else {
    const { error } = await supabase
      .from("manager_status")
      .update(payload)
      .eq("id", managerId);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }
  }

  revalidatePath("/admin/status");

  return {
    ok: true,
    message: mode === "create" ? "Manager creado." : "Manager actualizado.",
  };
}

