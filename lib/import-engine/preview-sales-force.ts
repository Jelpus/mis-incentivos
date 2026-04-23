// lib/import-engine/preview-sales-force.ts

import { createAdminClient } from "@/lib/supabase/admin";
import { mapRawRowToTargetFields } from "./mappers";
import {
  SALES_FORCE_FIELD_CLEANERS,

  SALES_FORCE_REQUIRED_FIELDS,
} from "./sales-force-config";
import {
  validateEmailField,
  validatePositiveNumberField,
  validateRequiredFields,
  type ValidationIssue,
} from "./validators";

import { inferVacancyFromName } from "./vacancy";

type ExistingSalesForceRecord = {
  id: string;
  linea_principal: string | null;
  parrilla: string | null;
  nombre_completo: string | null;
  no_empleado: number | null;
  territorio_padre: string | null;
  territorio_individual: string | null;
  puesto: string | null;
  correo_electronico: string | null;
  ciudad: string | null;
  fecha_ingreso: string | null;
  valid_since_period: string | null;
  team_id: string | null;
  base_incentivos: number | null;
};

type PreviewSalesForceBatchResult = {
  batchId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  insertRows: number;
  updateRows: number;
  noopRows: number;
};

const DEFAULT_VALID_SINCE_PERIOD = "2026-01-01";

function cleanMappedData(mappedData: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(mappedData)) {
    const cleaner = SALES_FORCE_FIELD_CLEANERS[field];

    cleaned[field] = cleaner ? cleaner(value) : value;
  }

  return cleaned;
}

function buildWarnings(
  mappedData: Record<string, unknown>,
  cleanedData: Record<string, unknown>,
): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];

  for (const key of Object.keys(mappedData)) {
    const original = mappedData[key];
    const cleaned = cleanedData[key];

    if (
      original !== null &&
      original !== undefined &&
      String(original).trim() !== "" &&
      (cleaned === null || cleaned === undefined || cleaned === "")
    ) {
      warnings.push({
        field: key,
        message: `${key} no pudo interpretarse y se dejó vacío`,
      });
    }
  }

  return warnings;
}

function comparableSalesForceData(data: {
  linea_principal?: unknown;
  parrilla?: unknown;
  nombre_completo?: unknown;
  no_empleado?: unknown;
  territorio_padre?: unknown;
  territorio_individual?: unknown;
  puesto?: unknown;
  correo_electronico?: unknown;
  ciudad?: unknown;
  fecha_ingreso?: unknown;
  valid_since_period?: unknown;
  team_id?: unknown;
  base_incentivos?: unknown;
  is_vacant?: unknown;
}) {
  return {
    is_vacant: data.is_vacant ?? false,
    linea_principal: data.linea_principal ?? null,
    parrilla: data.parrilla ?? null,
    nombre_completo: data.nombre_completo ?? null,
    no_empleado: data.no_empleado ?? null,
    territorio_padre: data.territorio_padre ?? null,
    territorio_individual: data.territorio_individual ?? null,
    puesto: data.puesto ?? null,
    correo_electronico: data.correo_electronico ?? null,
    ciudad: data.ciudad ?? null,
    fecha_ingreso: data.fecha_ingreso ?? null,
    valid_since_period: data.valid_since_period ?? null,
    team_id: data.team_id ?? null,
    base_incentivos: data.base_incentivos ?? null,
  };
}

function keyFromUnknown(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildExistingRecordIndexes(records: ExistingSalesForceRecord[]) {
  const byNoEmpleado = new Map<string, ExistingSalesForceRecord>();
  const byTerritorio = new Map<string, ExistingSalesForceRecord>();
  const byCorreo = new Map<string, ExistingSalesForceRecord>();

  for (const record of records) {
    const noEmpleadoKey = keyFromUnknown(record.no_empleado);
    const territorioKey = keyFromUnknown(record.territorio_individual);
    const correoKey = keyFromUnknown(record.correo_electronico);

    if (noEmpleadoKey && !byNoEmpleado.has(noEmpleadoKey)) {
      byNoEmpleado.set(noEmpleadoKey, record);
    }

    if (territorioKey && !byTerritorio.has(territorioKey)) {
      byTerritorio.set(territorioKey, record);
    }

    if (correoKey && !byCorreo.has(correoKey)) {
      byCorreo.set(correoKey, record);
    }
  }

  return { byNoEmpleado, byTerritorio, byCorreo };
}

export async function previewSalesForceImportBatch(
  batchId: string,
): Promise<PreviewSalesForceBatchResult> {
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

  const periodMonth = batch.period_month;
  const mappingSnapshot = (batch.mapping_snapshot ?? {}) as Record<string, string | null>;

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select("id, row_number, raw_data")
    .eq("batch_id", batchId)
    .order("row_number", { ascending: true });

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  const { data: existingRecords, error: existingRecordsError } = await supabase
    .from("sales_force_status")
    .select(`
      id,
      linea_principal,
      parrilla,
      nombre_completo,
      no_empleado,
      territorio_padre,
      territorio_individual,
      puesto,
      correo_electronico,
      ciudad,
      fecha_ingreso,
      valid_since_period,
      team_id,
      base_incentivos
    `)
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (existingRecordsError) {
    throw new Error(existingRecordsError.message);
  }

  const indexes = buildExistingRecordIndexes(
    (existingRecords ?? []) as ExistingSalesForceRecord[],
  );

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

  for (const row of rows ?? []) {
    totalRows += 1;

    const rawData = (row.raw_data ?? {}) as Record<string, unknown>;
    const mappedData = mapRawRowToTargetFields(rawData, mappingSnapshot);
    const cleanedData = cleanMappedData(mappedData);

    if (
      cleanedData.valid_since_period === null ||
      cleanedData.valid_since_period === undefined ||
      cleanedData.valid_since_period === ""
    ) {
      cleanedData.valid_since_period = DEFAULT_VALID_SINCE_PERIOD;
    }

    const inferredVacancy = inferVacancyFromName(cleanedData.nombre_completo);
    cleanedData.is_vacant = cleanedData.is_vacant === true || inferredVacancy;

    const isVacant = cleanedData.is_vacant === true;

    const conditionalErrors: ValidationIssue[] = [];

    if (!isVacant) {
      if (
        cleanedData.correo_electronico === null ||
        cleanedData.correo_electronico === undefined ||
        cleanedData.correo_electronico === ""
      ) {
        conditionalErrors.push({
          field: "correo_electronico",
          message: "Falta correo_electronico",
        });
      }

      if (
        cleanedData.no_empleado === null ||
        cleanedData.no_empleado === undefined ||
        cleanedData.no_empleado === ""
      ) {
        conditionalErrors.push({
          field: "no_empleado",
          message: "Falta no_empleado",
        });
      }
    }

    if(isVacant && !cleanedData.base_incentivos){
      cleanedData.base_incentivos = 0;
    }

    const validationErrors: ValidationIssue[] = [
      ...validateRequiredFields(cleanedData, SALES_FORCE_REQUIRED_FIELDS),
      ...conditionalErrors,
      ...(!isVacant ? validateEmailField(cleanedData, "correo_electronico") : []),
      ...validatePositiveNumberField(cleanedData, "base_incentivos"),
    ];

    const warnings = buildWarnings(mappedData, cleanedData);

    const hadExplicitVacancyField = Object.prototype.hasOwnProperty.call(
      mappedData,
      "is_vacant",
    );

    if (inferredVacancy && !hadExplicitVacancyField) {
      cleanedData.is_vacant = true;
      warnings.push({
        field: "is_vacant",
        message:
          "Se detectó vacante automáticamente a partir de nombre_completo.",
      });
    }

    let actionType: "insert" | "update" | "noop" | "invalid" = "insert";
    let targetRecordId: string | null = null;
    let actionDetails: Record<string, unknown> = {};

    if (validationErrors.length > 0) {
      actionType = "invalid";
      invalidRows += 1;
    } else {
      const noEmpleadoKey = keyFromUnknown(cleanedData.no_empleado);
      const territorioKey = keyFromUnknown(cleanedData.territorio_individual);
      const correoKey = keyFromUnknown(cleanedData.correo_electronico);

      const existingRecord =
        (noEmpleadoKey ? indexes.byNoEmpleado.get(noEmpleadoKey) : null) ??
        (territorioKey ? indexes.byTerritorio.get(territorioKey) : null) ??
        (correoKey ? indexes.byCorreo.get(correoKey) : null) ??
        null;

      if (!existingRecord) {
        actionType = "insert";
        insertRows += 1;
      } else {
        targetRecordId = existingRecord.id;

        const currentComparable = comparableSalesForceData(existingRecord);
        const nextComparable = comparableSalesForceData(cleanedData);

        const hasChanges =
          JSON.stringify(currentComparable) !== JSON.stringify(nextComparable);

        if (hasChanges) {
          actionType = "update";
          updateRows += 1;
          actionDetails = {
            existing_status_id: existingRecord.id,
          };
        } else {
          actionType = "noop";
          noopRows += 1;
          actionDetails = {
            existing_status_id: existingRecord.id,
          };
        }
      }

      validRows += 1;
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
      target_record_id: targetRecordId,
      action_details: actionDetails,
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
