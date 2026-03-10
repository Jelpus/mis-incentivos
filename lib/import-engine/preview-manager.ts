import { createAdminClient } from "@/lib/supabase/admin";
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

type PreviewManagerBatchResult = {
  batchId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  insertRows: number;
  updateRows: number;
  noopRows: number;
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
): Promise<PreviewManagerBatchResult> {
  const supabase = createAdminClient();

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

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select("id, row_number, raw_data")
    .eq("batch_id", batchId)
    .order("row_number", { ascending: true });

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  let totalRows = 0;
  let validRows = 0;
  let invalidRows = 0;
  let insertRows = 0;
  const updateRows = 0;
  const noopRows = 0;

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

  for (const row of rows ?? []) {
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

    const actionType: "insert" | "update" | "noop" | "invalid" =
      validationErrors.length > 0 ? "invalid" : "insert";

    if (actionType === "invalid") {
      invalidRows += 1;
    } else {
      validRows += 1;
      insertRows += 1;
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
      target_record_id: null,
      action_details: {},
    });
  }

  for (const updateChunk of chunk(pendingRowUpdates, 500)) {
    const { error: updateRowsError } = await supabase
      .from("import_rows")
      .upsert(updateChunk, { onConflict: "id" });

    if (updateRowsError) {
      throw new Error(updateRowsError.message);
    }
  }

  const previewSummary = {
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
