import { createAdminClient } from "@/lib/supabase/admin";

export type ImportPreviewRow = {
  id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  mapped_data: Record<string, unknown>;
  cleaned_data: Record<string, unknown>;
  validation_errors: Array<{
    field: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
  action_type: "insert" | "update" | "noop" | "invalid" | null;
  target_record_id: string | null;
  action_details: Record<string, unknown>;
};

export type ImportBatchPreviewData = {
  summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    insert_rows: number;
    update_rows: number;
    noop_rows: number;
  };
  rows: ImportPreviewRow[];
};

export async function getImportBatchPreview(batchId: string): Promise<ImportBatchPreviewData> {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, preview_summary")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Batch no encontrado");
  }

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select(`
      id,
      row_number,
      raw_data,
      mapped_data,
      cleaned_data,
      validation_errors,
      warnings,
      action_type,
      target_record_id,
      action_details
    `)
    .eq("batch_id", batchId)
    .order("row_number", { ascending: true });

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  const summary = {
    total_rows: Number((batch.preview_summary as Record<string, unknown> | null)?.total_rows ?? 0),
    valid_rows: Number((batch.preview_summary as Record<string, unknown> | null)?.valid_rows ?? 0),
    invalid_rows: Number((batch.preview_summary as Record<string, unknown> | null)?.invalid_rows ?? 0),
    insert_rows: Number((batch.preview_summary as Record<string, unknown> | null)?.insert_rows ?? 0),
    update_rows: Number((batch.preview_summary as Record<string, unknown> | null)?.update_rows ?? 0),
    noop_rows: Number((batch.preview_summary as Record<string, unknown> | null)?.noop_rows ?? 0),
  };

  return {
    summary,
    rows: (rows ?? []) as ImportPreviewRow[],
  };
}