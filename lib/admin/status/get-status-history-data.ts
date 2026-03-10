import { createAdminClient } from "@/lib/supabase/admin";

export type StatusHistoryBatch = {
  id: string;
  status: string;
  period_month: string | null;
  file_name: string | null;
  created_at: string;
  total_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  insert_rows: number | null;
  update_rows: number | null;
  noop_rows: number | null;
};

export async function getStatusHistoryData(limit = 50): Promise<StatusHistoryBatch[]> {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const { data, error } = await supabase
    .from("import_batches")
    .select(`
      id,
      status,
      period_month,
      file_name,
      created_at,
      total_rows,
      valid_rows,
      invalid_rows,
      insert_rows,
      update_rows,
      noop_rows,
      import_type:import_types!inner(code)
    `)
    .eq("import_type.code", "sales_force_status")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load status history: ${error.message}`);
  }

  return (data ?? []) as StatusHistoryBatch[];
}
