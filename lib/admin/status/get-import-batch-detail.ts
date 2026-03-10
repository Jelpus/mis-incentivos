import { createAdminClient } from "@/lib/supabase/admin";
import {
  MANAGER_OPTIONAL_IMPORT_FIELDS,
  MANAGER_REQUIRED_FIELDS,
} from "@/lib/import-engine/manager-config";
import {
  SALES_FORCE_OPTIONAL_IMPORT_FIELDS,
  SALES_FORCE_REQUIRED_FIELDS,
} from "@/lib/import-engine/sales-force-config";

export type ImportBatchDetail = {
  id: string;
  status: string;
  period_month: string | null;
  file_name: string | null;
  sheet_name: string | null;
  header_row: number | null;
  mapping_snapshot: Record<string, string | null>;
  preview_summary: Record<string, unknown>;
  import_type: {
    code: string;
    name: string;
    target_table: string;
  };
};

const REQUIRED_FIELDS_BY_IMPORT_TYPE: Record<string, string[]> = {
  sales_force_status: [...SALES_FORCE_REQUIRED_FIELDS],
  manager_status: [...MANAGER_REQUIRED_FIELDS],
};

const OPTIONAL_FIELDS_BY_IMPORT_TYPE: Record<string, string[]> = {
  sales_force_status: [...SALES_FORCE_OPTIONAL_IMPORT_FIELDS],
  manager_status: [...MANAGER_OPTIONAL_IMPORT_FIELDS],
};

export async function getImportBatchDetail(batchId: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select(`
      id,
      status,
      period_month,
      file_name,
      sheet_name,
      header_row,
      mapping_snapshot,
      preview_summary,
      import_type:import_types!inner(
        code,
        name,
        target_table
      )
    `)
    .eq("id", batchId)
    .single<ImportBatchDetail>();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Batch no encontrado");
  }

  const { data: validFieldsData, error: validFieldsError } = await supabase.rpc(
    "get_import_type_columns",
    { p_import_type_code: batch.import_type.code },
  );

  if (validFieldsError) {
    throw new Error(validFieldsError.message);
  }

  const validFields =
    (validFieldsData as Array<{ column_name: string }> | null)?.map(
      (item) => item.column_name,
    ) ?? [];

  const requiredFields =
    REQUIRED_FIELDS_BY_IMPORT_TYPE[batch.import_type.code] ??
    validFields;

  const optionalFields =
    OPTIONAL_FIELDS_BY_IMPORT_TYPE[batch.import_type.code] ?? [];

  const mappingSnapshot = batch.mapping_snapshot ?? {};
  const detectedHeaders = Object.keys(mappingSnapshot);

  // invertimos: header -> field  ==> field -> header
  const fieldAssignments = Object.fromEntries(
    [...requiredFields, ...optionalFields].map((field) => {
      const assignedHeader =
        Object.entries(mappingSnapshot).find(
          ([, targetField]) => targetField === field,
        )?.[0] ?? null;

      return [field, assignedHeader];
    }),
  ) as Record<string, string | null>;

  const unassignedRequiredFields = requiredFields.filter(
    (field) => !fieldAssignments[field],
  );

  const unusedDetectedHeaders = detectedHeaders.filter((header) => {
    const target = mappingSnapshot[header];
    return !target;
  });

  return {
    batch,
    validFields,
    requiredFields,
    optionalFields,
    detectedHeaders,
    fieldAssignments,
    unassignedRequiredFields,
    unusedDetectedHeaders,
  };
}
