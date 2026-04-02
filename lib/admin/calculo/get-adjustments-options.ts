import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";

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
  if (!isBigQueryConfigured()) {
    return { rutas: [], productNames: [], message: "BigQuery no configurado para cargar opciones." };
  }

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) {
    return { rutas: [], productNames: [], message: "Falta GCP_PROJECT_ID para cargar opciones." };
  }

  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const periodCode = toPeriodCode(periodMonth);

  const [rutasRows, productsRows] = await Promise.all([
    fetchBigQueryRows<OptionRow>({
      query: `
        SELECT DISTINCT ruta AS value
        FROM ${tableRef}
        WHERE periodo = @periodo
          AND ruta IS NOT NULL
          AND TRIM(ruta) <> ''
        ORDER BY value ASC
        LIMIT 5000
      `,
      parameters: [{ name: "periodo", type: "STRING", value: periodCode }],
    }),
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

  const rutas = (rutasRows ?? [])
    .map((row) => String(row.value ?? "").trim())
    .filter((value) => value.length > 0);
  const productNames = (productsRows ?? [])
    .map((row) => String(row.value ?? "").trim())
    .filter((value) => value.length > 0);

  return { rutas, productNames, message: null };
}
