import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows } from "@/lib/supabase/paginated-query";
import {
  formatStatusImportError,
  getStatusUniqueConflict,
  type StatusDatabaseError,
  type StatusErrorImportRow,
  type StatusConflictRecord,
} from "./import-errors";

export async function getImportErrorFeedback(params: {
  supabase: SupabaseClient;
  error: StatusDatabaseError;
  batchId: string;
  importTypeCode: string;
  periodMonth: string | null;
}) {
  const { supabase, error, batchId, importTypeCode, periodMonth } = params;
  const fallback = formatStatusImportError(error, { batchId, periodMonth });
  const conflict = getStatusUniqueConflict(error);
  const isSalesForce = importTypeCode === "sales_force_status";
  const allowedFields = isSalesForce
    ? ["territorio_individual", "no_empleado", "correo_electronico"]
    : ["territorio_manager", "no_empleado_manager", "correo_manager"];
  if (!conflict || !allowedFields.includes(conflict.field)) return fallback;

  try {
    const [rows, existingRecords] = await Promise.all([
      fetchAllSupabaseRows<StatusErrorImportRow>({
        context: "No se pudieron consultar las filas con conflicto",
        pageQuery: async (from, to) => supabase
          .from("import_rows")
          .select("id, row_number, cleaned_data")
          .eq("batch_id", batchId)
          .order("row_number", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      }),
      fetchAllSupabaseRows<StatusConflictRecord>({
        context: "No se pudo consultar el Status existente",
        pageQuery: async (from, to) => supabase
          .from(isSalesForce ? "sales_force_status" : "manager_status")
          .select(isSalesForce ? "id, nombre_completo, no_empleado" : "id, nombre_manager, no_empleado_manager")
          .eq("period_month", conflict.period ?? periodMonth)
          .eq("is_deleted", false)
          .eq(conflict.field, conflict.value)
          .order("id", { ascending: true })
          .range(from, to),
      }),
    ]);
    return formatStatusImportError(error, { batchId, periodMonth, rows, existingRecords });
  } catch (lookupError) {
    // A diagnostic failure must not replace the original database error.
    console.error("[status-import] No se pudo ampliar el error", { batchId, lookupError });
    return {
      ...fallback,
      issues: ["No se pudieron consultar los nombres y filas relacionados. Comparte el detalle técnico con soporte."],
    };
  }
}
