import { BigQuery } from "@google-cloud/bigquery";
import { randomUUID } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

type BigQueryParameter = {
  name: string;
  type: "STRING" | "INT64" | "FLOAT64" | "BOOL";
  value: string | number | boolean | null;
};

type BigQueryInsertRow = {
  rowId?: string;
  json: Record<string, unknown>;
};

type BigQuerySchemaField = {
  name: string;
  type: "STRING" | "INT64" | "FLOAT64" | "BOOL" | "TIMESTAMP" | "DATE" | "DATETIME" | "NUMERIC";
  mode?: "NULLABLE" | "REQUIRED" | "REPEATED";
};

function resolvePrivateKey(): string | null {
  const raw = process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (raw && raw.trim()) {
    return raw.replace(/\\n/g, "\n");
  }

  const base64 = process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64;
  if (base64 && base64.trim()) {
    return Buffer.from(base64, "base64").toString("utf8");
  }

  return null;
}

let cachedClient: BigQuery | null = null;

export function isBigQueryConfigured(): boolean {
  return Boolean(
    process.env.GCP_PROJECT_ID &&
      process.env.GCP_SERVICE_ACCOUNT_EMAIL &&
      resolvePrivateKey(),
  );
}

function getBigQueryClient(): BigQuery {
  if (cachedClient) return cachedClient;

  const projectId = process.env.GCP_PROJECT_ID;
  const clientEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const privateKey = resolvePrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing BigQuery service account credentials.");
  }

  cachedClient = new BigQuery({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
  return cachedClient;
}

function getBigQueryProjectId(): string {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("Missing GCP_PROJECT_ID for BigQuery.");
  }
  return projectId;
}

export async function runBigQueryQuery(params: {
  query: string;
  parameters?: BigQueryParameter[];
}): Promise<void> {
  getBigQueryProjectId();
  const client = getBigQueryClient();
  const queryLocation = process.env.BQ_LOCATION?.trim() || undefined;

  const paramsObject =
    params.parameters && params.parameters.length > 0
      ? Object.fromEntries(params.parameters.map((param) => [param.name, param.value]))
      : undefined;

  try {
    await client.query({
      query: params.query,
      useLegacySql: false,
      location: queryLocation,
      params: paramsObject,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BigQuery error.";
    throw new Error(`BigQuery query failed: ${message}`);
  }
}

export async function fetchBigQueryRows<T>(params: {
  query: string;
  parameters?: BigQueryParameter[];
}): Promise<T[]> {
  getBigQueryProjectId();
  const client = getBigQueryClient();
  const queryLocation = process.env.BQ_LOCATION?.trim() || undefined;

  const paramsObject =
    params.parameters && params.parameters.length > 0
      ? Object.fromEntries(params.parameters.map((param) => [param.name, param.value]))
      : undefined;

  try {
    const [rows] = await client.query({
      query: params.query,
      useLegacySql: false,
      location: queryLocation,
      params: paramsObject,
    });

    return rows as T[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BigQuery error.";
    throw new Error(`BigQuery query failed: ${message}`);
  }
}

export async function insertBigQueryRows(params: {
  datasetId: string;
  tableId: string;
  rows: BigQueryInsertRow[];
}): Promise<void> {
  getBigQueryProjectId();
  const client = getBigQueryClient();
  const table = client.dataset(params.datasetId).table(params.tableId);
  const batchSizeRaw = Number(process.env.BQ_INSERT_BATCH_SIZE ?? 5000);
  const batchSize =
    Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.floor(batchSizeRaw) : 5000;

  try {
    for (let start = 0; start < params.rows.length; start += batchSize) {
      const chunk = params.rows.slice(start, start + batchSize);
      await table.insert(
        chunk.map((row) => ({
          insertId: row.rowId,
          json: row.json,
        })),
        {
          ignoreUnknownValues: true,
          skipInvalidRows: false,
          raw: true,
        },
      );
    }
  } catch (error) {
    const maybePartialFailure = error as {
      errors?: Array<{ errors?: Array<{ message?: string }> }>;
      message?: string;
    };

    if (Array.isArray(maybePartialFailure.errors) && maybePartialFailure.errors.length > 0) {
      const joined = maybePartialFailure.errors
        .map((item, index) => {
          const details = (item.errors ?? [])
            .map((detail) => detail.message ?? "unknown")
            .join("; ");
          return `row ${index}: ${details || "unknown"}`;
        })
        .join(" | ");

      throw new Error(`BigQuery insertAll errors: ${joined}`);
    }

    const message = error instanceof Error ? error.message : "Unknown BigQuery error.";
    throw new Error(`BigQuery insert failed: ${message}`);
  }
}

export async function loadBigQueryJsonRows(params: {
  datasetId: string;
  tableId: string;
  rows: Record<string, unknown>[];
  schema: BigQuerySchemaField[];
  writeDisposition?: "WRITE_APPEND" | "WRITE_TRUNCATE" | "WRITE_EMPTY";
}): Promise<void> {
  getBigQueryProjectId();
  const client = getBigQueryClient();
  const table = client.dataset(params.datasetId).table(params.tableId);
  const queryLocation = process.env.BQ_LOCATION?.trim() || undefined;
  const tmpDir = await mkdtemp(join(tmpdir(), `bq-json-${randomUUID()}-`));
  const filePath = join(tmpDir, "rows.ndjson");

  try {
    const payload = params.rows.map((row) => JSON.stringify(row)).join("\n");
    await writeFile(filePath, payload.length > 0 ? `${payload}\n` : "", "utf8");
    await table.load(filePath, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      schema: { fields: params.schema },
      writeDisposition: params.writeDisposition ?? "WRITE_TRUNCATE",
      createDisposition: "CREATE_IF_NEEDED",
      ignoreUnknownValues: true,
      location: queryLocation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BigQuery error.";
    throw new Error(`BigQuery load job failed: ${message}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function copyBigQueryTable(params: {
  datasetId: string;
  sourceTableId: string;
  destinationTableId: string;
  writeDisposition?: "WRITE_APPEND" | "WRITE_TRUNCATE" | "WRITE_EMPTY";
}): Promise<void> {
  getBigQueryProjectId();
  const client = getBigQueryClient();
  const sourceTable = client.dataset(params.datasetId).table(params.sourceTableId);
  const destinationTable = client.dataset(params.datasetId).table(params.destinationTableId);
  const queryLocation = process.env.BQ_LOCATION?.trim() || undefined;

  try {
    await sourceTable.copy(destinationTable, {
      writeDisposition: params.writeDisposition ?? "WRITE_TRUNCATE",
      createDisposition: "CREATE_IF_NEEDED",
      location: queryLocation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BigQuery error.";
    throw new Error(`BigQuery copy job failed: ${message}`);
  }
}

export async function validateBigQueryTableConnection(params: {
  datasetId: string;
  tableId: string;
}): Promise<void> {
  const projectId = getBigQueryProjectId();
  const tableRef = `\`${projectId}.${params.datasetId}.${params.tableId}\``;
  await runBigQueryQuery({
    query: `SELECT 1 AS ok FROM ${tableRef} LIMIT 1`,
  });
}
