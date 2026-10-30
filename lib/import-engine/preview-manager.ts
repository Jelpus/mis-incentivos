import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/paginated-query";
import { mapRawRowToTargetFields } from "./mappers";
import {
  MANAGER_FIELD_CLEANERS,
  MANAGER_REQUIRED_FIELDS,
} from "./manager-config";
import {
  validateEmailField,
  validateRequiredFields,
  type ValidationIssue,
} from "./validators";
import { inferVacancyFromName } from "./vacancy";
import { getRetiredStatusTerritories, getStatusSnapshotDuplicateIssues, statusTerritoryKey } from "./status-snapshot";

type ExistingManager = {
  id: string;
  territorio_manager: string;
  nombre_manager: string;
  correo_manager: string | null;
  no_empleado_manager: number | null;
  team_id: string | null;
  is_active: boolean;
  is_vacant: boolean;
};

type PreviewManagerBatchResult = {
  batchId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  insertRows: number;
  updateRows: number;
  noopRows: number;
};

type ImportRowSource = {
  id: string;
  row_number: number;
  raw_data: Record<string, unknown> | null;
};

function cleanMappedData(mappedData: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(mappedData)) {
    const cleaner = MANAGER_FIELD_CLEANERS[field];
    cleaned[field] = cleaner ? cleaner(value) : value;
  }

  return cleaned;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function hasText(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export async function previewManagerImportBatch(
  batchId: string,
  supabase = createAdminClient(),
): Promise<PreviewManagerBatchResult> {
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select(`
      id,
      period_month,
      mapping_snapshot,
      import_type:import_types!inner(
        code,
        target_table
      )
    `)
    .eq("id", batchId)
    .single();

  if (batchError) {
    throw new Error(batchError.message);
  }

  const mappingSnapshot = (batch.mapping_snapshot ?? {}) as Record<string, string | null>;

  const rows = await fetchAllSupabaseRows<ImportRowSource>({
    context: `No se pudieron leer las filas del lote ${batchId}`,
    pageQuery: async (from, to) => {
      const result = await supabase
        .from("import_rows")
        .select("id, row_number, raw_data")
        .eq("batch_id", batchId)
        .order("row_number", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data: (result.data ?? []) as ImportRowSource[], error: result.error };
    },
  });
  const existingRecords = await fetchAllSupabaseRows<ExistingManager>({
    context: `No se pudieron leer los managers de ${batch.period_month}`,
    pageQuery: async (from, to) => supabase.from("manager_status")
      .select("id, territorio_manager, nombre_manager, correo_manager, no_empleado_manager, team_id, is_active, is_vacant")
      .eq("period_month", batch.period_month).eq("is_deleted", false)
      .order("id", { ascending: true }).range(from, to),
  });
  const byTerritory = new Map(existingRecords.map((record) => [statusTerritoryKey(record.territorio_manager), record]));

  let totalRows = 0;
  let validRows = 0;
  let invalidRows = 0;
  let insertRows = 0;
  let updateRows = 0;
  let noopRows = 0;

  const pendingRowUpdates: Array<{
    id: string;
    batch_id: string;
    row_number: number;
    raw_data: Record<string, unknown>;
    cleaned_data: Record<string, unknown>;
    mapped_data: Record<string, unknown>;
    validation_errors: ValidationIssue[];
    warnings: ValidationIssue[];
    action_type: "insert" | "update" | "noop" | "invalid";
    target_record_id: string | null;
    action_details: Record<string, unknown>;
  }> = [];

  for (const row of rows) {
    totalRows += 1;

    const rawData = (row.raw_data ?? {}) as Record<string, unknown>;
    const mappedData = mapRawRowToTargetFields(rawData, mappingSnapshot);
    const cleanedData = cleanMappedData(mappedData);
    const inferredVacancy = inferVacancyFromName(cleanedData.nombre_manager);
    cleanedData.is_vacant = cleanedData.is_vacant === true || inferredVacancy;

    const isVacant = cleanedData.is_vacant === true;
    const conditionalErrors: ValidationIssue[] = [];

    if (!isVacant) {
      if (
        cleanedData.correo_manager === null ||
        cleanedData.correo_manager === undefined ||
        cleanedData.correo_manager === ""
      ) {
        conditionalErrors.push({
          field: "correo_manager",
          message: "Falta correo_manager",
        });
      }

      if (
        cleanedData.no_empleado_manager === null ||
        cleanedData.no_empleado_manager === undefined ||
        cleanedData.no_empleado_manager === ""
      ) {
        conditionalErrors.push({
          field: "no_empleado_manager",
          message: "Falta no_empleado_manager",
        });
      }
    }

    const validationErrors: ValidationIssue[] = [
      ...validateRequiredFields(cleanedData, MANAGER_REQUIRED_FIELDS),
      ...conditionalErrors,
      ...(!isVacant ? validateEmailField(cleanedData, "correo_manager") : []),
    ];

    const warnings: ValidationIssue[] = [];

    for (const [key, value] of Object.entries(mappedData)) {
      if (hasText(value) && !hasText(cleanedData[key])) {
        warnings.push({
          field: key,
          message: `${key} no pudo interpretarse y se dejó vacío`,
        });
      }
    }

    if (inferredVacancy && !Object.prototype.hasOwnProperty.call(mappedData, "is_vacant")) {
      warnings.push({
        field: "is_vacant",
        message:
          "Se detectó vacante automáticamente a partir de nombre_manager.",
      });
    }

    const existing = byTerritory.get(statusTerritoryKey(cleanedData.territorio_manager));
    const sameData = existing && ["nombre_manager", "correo_manager", "no_empleado_manager", "team_id", "is_active", "is_vacant"].every((field) => {
      const incoming = cleanedData[field] ?? (field === "is_active" ? true : field === "is_vacant" ? false : null);
      return incoming === existing[field as keyof ExistingManager];
    });
    const actionType: "insert" | "update" | "noop" | "invalid" = validationErrors.length > 0
      ? "invalid" : !existing ? "insert" : sameData ? "noop" : "update";

    if (actionType === "invalid") {
      invalidRows += 1;
    } else {
      validRows += 1;
      if (actionType === "insert") insertRows += 1;
      if (actionType === "update") updateRows += 1;
      if (actionType === "noop") noopRows += 1;
    }

    pendingRowUpdates.push({
      id: row.id,
      batch_id: batchId,
      row_number: row.row_number,
      raw_data: rawData,
      cleaned_data: cleanedData,
      mapped_data: mappedData,
      validation_errors: validationErrors,
      warnings,
      action_type: actionType,
      target_record_id: existing?.id ?? null,
      action_details: existing ? { existing_status_id: existing.id } : {},
    });
  }

  const duplicateIssues = getStatusSnapshotDuplicateIssues(pendingRowUpdates, "manager_status");
  for (const row of pendingRowUpdates) {
    const issues = duplicateIssues.get(row.id);
    if (!issues) continue;
    if (row.action_type !== "invalid") {
      validRows -= 1;
      invalidRows += 1;
      if (row.action_type === "insert") insertRows -= 1;
      if (row.action_type === "update") updateRows -= 1;
      if (row.action_type === "noop") noopRows -= 1;
    }
    row.action_type = "invalid";
    row.validation_errors.push(...issues);
  }
  const retiredRecords = getRetiredStatusTerritories(pendingRowUpdates, existingRecords, "manager_status");

  for (const updateChunk of chunk(pendingRowUpdates, 500)) {
    const { error: updateRowsError } = await supabase
      .from("import_rows")
      .upsert(updateChunk, { onConflict: "id" });

    if (updateRowsError) {
      throw new Error(updateRowsError.message);
    }
  }

  const previewSummary = {
    apply_mode: "full_period",
    retired_rows: retiredRecords.length,
    total_rows: totalRows,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    insert_rows: insertRows,
    update_rows: updateRows,
    noop_rows: noopRows,
  };

  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: "preview_ready",
      preview_summary: previewSummary,
      total_rows: totalRows,
      valid_rows: validRows,
      invalid_rows: invalidRows,
      insert_rows: insertRows,
      update_rows: updateRows,
      noop_rows: noopRows,
    })
    .eq("id", batchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  return {
    batchId,
    totalRows,
    validRows,
    invalidRows,
    insertRows,
    updateRows,
    noopRows,
  };
}
