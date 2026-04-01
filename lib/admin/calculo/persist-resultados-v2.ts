import { buildResultadosV2Preview, type ResultadosV2PreviewResult } from "@/lib/admin/calculo/build-resultados-v2-preview";
import { insertBigQueryRows, isBigQueryConfigured, runBigQueryQuery } from "@/lib/integrations/bigquery";

function chunkArray<T>(rows: T[], chunkSize: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    output.push(rows.slice(index, index + chunkSize));
  }
  return output;
}

export async function persistResultadosV2(
  periodMonth: string,
  prebuiltPreview?: ResultadosV2PreviewResult,
): Promise<{
  rowsCount: number;
  totalPagoResultado: number;
  totalPagoVariable: number;
}> {
  if (!isBigQueryConfigured()) {
    throw new Error("BigQuery no esta configurado.");
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("Falta GCP_PROJECT_ID.");
  }

  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const periodCode = `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  const preview = prebuiltPreview ?? await buildResultadosV2Preview(periodMonth);

  await runBigQueryQuery({
    query: `DELETE FROM ${tableRef} WHERE periodo = @periodo`,
    parameters: [{ name: "periodo", type: "STRING", value: periodCode }],
  });

  const rowsForBigQuery = preview.rows.map((row) => ({
    team_id: row.team_id,
    plan_type_name: row.plan_type_name,
    product_name: row.product_name,
    prod_weight: row.prod_weight,
    agrupador: row.agrupador,
    garantia: row.garantia,
    elemento: row.elemento,
    ruta: row.ruta,
    representante: row.representante,
    actual: row.actual,
    resultado: row.resultado,
    objetivo: row.objetivo,
    cobertura: row.cobertura,
    pagovariable: row.pagovariable,
    coberturapago: row.coberturapago,
    nombre: row.nombre,
    linea: row.linea,
    manager: row.manager,
    empleado: row.empleado,
    pagoresultado: row.pagoresultado,
    periodo: periodCode,
  }));

  const chunks = chunkArray(rowsForBigQuery, 5_000);
  for (const [chunkIndex, chunk] of chunks.entries()) {
    await insertBigQueryRows({
      datasetId,
      tableId,
      rows: chunk.map((row, index) => ({
        rowId: `${periodCode}-${row.team_id}-${row.ruta}-${row.product_name}-${chunkIndex}-${index}`,
        json: row,
      })),
    });
  }

  return {
    rowsCount: rowsForBigQuery.length,
    totalPagoResultado: preview.summary.totalPagoResultado,
    totalPagoVariable: preview.summary.totalPagoVariable,
  };
}
