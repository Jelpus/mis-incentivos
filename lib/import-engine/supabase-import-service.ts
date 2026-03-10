import { createAdminClient } from "@/lib/supabase/admin";
import { previewExcelImport } from "./import-preview";
import { parseExcelBuffer } from "./excel-parser";
import { buildRowsFromSheet } from "./build-rows";
import { resolveHeaderMappings, type KnownMapping } from "./column-mapper";

type ImportBatchRow = {
  id: string;
};

type CreateImportBatchResult = {
  batchId: string;
  suggestedSheetName: string | null;
  selectedSheetName: string;
  headerRowNumber: number;
  totalRowsLoaded: number;
  mappedColumns: Array<{
    originalHeader: string;
    normalizedHeader: string;
    targetField: string | null;
    isMapped: boolean;
  }>;
  unmappedColumns: Array<{
    originalHeader: string;
    normalizedHeader: string;
    targetField: string | null;
    isMapped: boolean;
  }>;
};

type CreateImportBatchParams = {
  importTypeCode: string;
  fileName: string;
  fileBuffer: Buffer;
  periodMonth?: string | null;
  selectedSheetName?: string | null;
  selectedHeaderRowNumber?: number | null;
  userId?: string | null;
};

export async function createImportBatchFromExcel({
  importTypeCode,
  fileName,
  fileBuffer,
  periodMonth = null,
  selectedSheetName = null,
  selectedHeaderRowNumber = null,
  userId = null,
}: CreateImportBatchParams): Promise<CreateImportBatchResult> {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const workbookPreview = previewExcelImport(fileBuffer);

  const finalSheetName =
    selectedSheetName ??
    workbookPreview.suggestedSheetName ??
    workbookPreview.sheetNames[0];

  if (!finalSheetName) {
    throw new Error("No se encontraron sheets en el archivo");
  }

  const sheetPreview = workbookPreview.previews.find(
    (sheet) => sheet.sheetName === finalSheetName,
  );

  if (!sheetPreview) {
    throw new Error(`No se encontró preview para la sheet "${finalSheetName}"`);
  }

  const parsed = parseExcelBuffer(fileBuffer);
  const selectedMatrix = parsed.sheets[finalSheetName];

  if (!selectedMatrix) {
    throw new Error(`No se encontró la sheet "${finalSheetName}"`);
  }

  const finalHeaderRowNumber =
    selectedHeaderRowNumber ?? sheetPreview.detectedHeader?.headerRowNumber;

  if (!finalHeaderRowNumber) {
    throw new Error("No fue posible detectar la fila de encabezados");
  }

  const headerRowIndex = finalHeaderRowNumber - 1;
  const builtRows = buildRowsFromSheet(selectedMatrix, headerRowIndex);
  const headerRow = selectedMatrix[headerRowIndex] ?? [];
  const headers = headerRow.map((cell) => String(cell ?? "").trim()).filter(Boolean);

  const { data: validFieldsData, error: validFieldsError } = await supabase.rpc(
    "get_import_type_columns",
    { p_import_type_code: importTypeCode },
  );

  if (validFieldsError) {
    throw new Error(validFieldsError.message);
  }

  const validTargetFields =
    (validFieldsData as Array<{ column_name: string }> | null)?.map(
      (item) => item.column_name,
    ) ?? [];

  const { data: mappingsData, error: mappingsError } = await supabase.rpc(
    "get_import_type_mappings",
    { p_import_type_code: importTypeCode },
  );

  if (mappingsError) {
    throw new Error(mappingsError.message);
  }

  const knownMappings = (mappingsData as KnownMapping[] | null) ?? [];

  const mappingResolution = resolveHeaderMappings(
    headers,
    knownMappings,
    validTargetFields,
  );

  const mappingSnapshot = Object.fromEntries(
    [...mappingResolution.mapped, ...mappingResolution.unmapped].map((item) => [
      item.originalHeader,
      item.targetField,
    ]),
  );

 const { data: batchData, error: batchError } = await supabase.rpc(
  "create_import_batch",
  {
    p_import_type_code: importTypeCode,
    p_period_month: periodMonth,
    p_file_name: fileName,
    p_sheet_name: finalSheetName,
    p_header_row: finalHeaderRowNumber,
    p_metadata: {
      available_sheet_names: workbookPreview.sheetNames,
      suggested_sheet_name: workbookPreview.suggestedSheetName,
    },
    p_created_by: userId, // nuevo
  },
);

  if (batchError) {
    throw new Error(batchError.message);
  }

  const batch = batchData as ImportBatchRow | null;

  if (!batch?.id) {
    throw new Error("No fue posible crear el import batch");
  }

  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      mapping_snapshot: mappingSnapshot,
      status:
        mappingResolution.unmapped.length > 0
          ? "mapping_required"
          : "ready_for_preview",
    })
    .eq("id", batch.id);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  const rowsPayload = builtRows.map((row) => ({
    batch_id: batch.id,
    row_number: row.rowNumber,
    raw_data: row.rawData,
  }));

  if (rowsPayload.length > 0) {
    const { error: rowsInsertError } = await supabase
      .from("import_rows")
      .insert(rowsPayload);

    if (rowsInsertError) {
      throw new Error(rowsInsertError.message);
    }
  }

  const { error: refreshError } = await supabase.rpc("refresh_import_batch_stats", {
    p_batch_id: batch.id,
  });

  if (refreshError) {
    throw new Error(refreshError.message);
  }

  return {
    batchId: batch.id,
    suggestedSheetName: workbookPreview.suggestedSheetName,
    selectedSheetName: finalSheetName,
    headerRowNumber: finalHeaderRowNumber,
    totalRowsLoaded: builtRows.length,
    mappedColumns: mappingResolution.mapped,
    unmappedColumns: mappingResolution.unmapped,
  };
}