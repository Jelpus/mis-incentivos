import { buildResultadosV2Preview, type ResultadosV2PreviewResult } from "@/lib/admin/calculo/build-resultados-v2-preview";
import { copyBigQueryTable, isBigQueryConfigured, loadBigQueryJsonRows, runBigQueryQuery } from "@/lib/integrations/bigquery";

const RESULTADOS_V2_SCHEMA = [
  { name: "team_id", type: "STRING" as const },
  { name: "plan_type_name", type: "STRING" as const },
  { name: "product_name", type: "STRING" as const },
  { name: "prod_weight", type: "FLOAT64" as const },
  { name: "agrupador", type: "STRING" as const },
  { name: "garantia", type: "BOOL" as const },
  { name: "elemento", type: "STRING" as const },
  { name: "ruta", type: "STRING" as const },
  { name: "representante", type: "STRING" as const },
  { name: "actual", type: "FLOAT64" as const },
  { name: "resultado", type: "FLOAT64" as const },
  { name: "objetivo", type: "FLOAT64" as const },
  { name: "cobertura", type: "FLOAT64" as const },
  { name: "pagovariable", type: "FLOAT64" as const },
  { name: "coberturapago", type: "FLOAT64" as const },
  { name: "nombre", type: "STRING" as const },
  { name: "linea", type: "STRING" as const },
  { name: "manager", type: "STRING" as const },
  { name: "empleado", type: "INT64" as const },
  { name: "pagoresultado", type: "FLOAT64" as const },
  { name: "periodo", type: "STRING" as const },
];

function quoteIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

function quoteColumn(value: string): string {
  return `\`${value.replace(/`/g, "")}\``;
}

function castColumnExpression(field: (typeof RESULTADOS_V2_SCHEMA)[number]): string {
  const column = quoteColumn(field.name);
  if (field.type === "STRING") return `CAST(${column} AS STRING) AS ${column}`;
  return `SAFE_CAST(${column} AS ${field.type}) AS ${column}`;
}

const RESULTADOS_V2_SELECT_EXPRESSIONS = RESULTADOS_V2_SCHEMA.map(castColumnExpression).join(", ");

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
  const runId = `${periodCode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stageTableId = quoteIdentifier(`${tableId}__stage_${runId}`);
  const replacementTableId = quoteIdentifier(`${tableId}__replace_${runId}`);
  const stageTableRef = `\`${projectId}.${datasetId}.${stageTableId}\``;
  const replacementTableRef = `\`${projectId}.${datasetId}.${replacementTableId}\``;

  const preview = prebuiltPreview ?? await buildResultadosV2Preview(periodMonth);

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

  try {
    if (rowsForBigQuery.length > 0) {
      await loadBigQueryJsonRows({
        datasetId,
        tableId: stageTableId,
        rows: rowsForBigQuery,
        schema: RESULTADOS_V2_SCHEMA,
        writeDisposition: "WRITE_TRUNCATE",
      });
    } else {
      await runBigQueryQuery({
        query: `
          CREATE OR REPLACE TABLE ${stageTableRef} AS
          SELECT ${RESULTADOS_V2_SELECT_EXPRESSIONS}
          FROM ${tableRef}
          WHERE FALSE
        `,
      });
    }

    await runBigQueryQuery({
      query: `
        CREATE OR REPLACE TABLE ${replacementTableRef} AS
        SELECT ${RESULTADOS_V2_SELECT_EXPRESSIONS}
        FROM ${tableRef}
        WHERE periodo IS NULL OR CAST(periodo AS STRING) != @periodo
        UNION ALL
        SELECT ${RESULTADOS_V2_SELECT_EXPRESSIONS}
        FROM ${stageTableRef}
      `,
      parameters: [{ name: "periodo", type: "STRING", value: periodCode }],
    });

    await copyBigQueryTable({
      datasetId,
      sourceTableId: replacementTableId,
      destinationTableId: tableId,
      writeDisposition: "WRITE_TRUNCATE",
    });
  } finally {
    await runBigQueryQuery({ query: `DROP TABLE IF EXISTS ${stageTableRef}` }).catch(() => undefined);
    await runBigQueryQuery({ query: `DROP TABLE IF EXISTS ${replacementTableRef}` }).catch(() => undefined);
  }

  return {
    rowsCount: rowsForBigQuery.length,
    totalPagoResultado: preview.summary.totalPagoResultado,
    totalPagoVariable: preview.summary.totalPagoVariable,
  };
}
