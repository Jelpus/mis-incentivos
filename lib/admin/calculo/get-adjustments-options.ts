import { fetchBigQueryRows } from "@/lib/integrations/bigquery";
import { createAdminClient } from "@/lib/supabase/admin";

type OptionRow = { value: string | null };

export type AdjustmentsOptionsData = {
  rutas: string[];
  productNames: string[];
  message: string | null;
};

function toPeriodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

export async function getAdjustmentsOptionsData(periodMonth: string): Promise<AdjustmentsOptionsData> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { rutas: [], productNames: [], message: "Sin conexion admin para leer rutas de Status." };
  }

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) {
    return { rutas: [], productNames: [], message: "Falta GCP_PROJECT_ID para cargar opciones." };
  }

  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const periodCode = toPeriodCode(periodMonth);

  const [statusRoutesResult, productsRows] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("territorio_individual")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
    fetchBigQueryRows<OptionRow>({
      query: `
        SELECT DISTINCT product_name AS value
        FROM ${tableRef}
        WHERE periodo = @periodo
          AND product_name IS NOT NULL
          AND TRIM(product_name) <> ''
        ORDER BY value ASC
        LIMIT 5000
      `,
      parameters: [{ name: "periodo", type: "STRING", value: periodCode }],
    }),
  ]);

  if (statusRoutesResult.error) {
    return {
      rutas: [],
      productNames: [],
      message: `No se pudieron cargar rutas desde sales_force_status: ${statusRoutesResult.error.message}`,
    };
  }

  const rutas = Array.from(
    new Set(
      (statusRoutesResult.data ?? [])
        .map((row) => String(row.territorio_individual ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const productNames = (productsRows ?? [])
    .map((row) => String(row.value ?? "").trim())
    .filter((value) => value.length > 0);

  return { rutas, productNames, message: null };
}
