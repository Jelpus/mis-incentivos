import { BigQuery } from "@google-cloud/bigquery";

type BigQueryParameter = {
  name: string;
  type: "STRING" | "INT64" | "FLOAT64" | "BOOL";
  value: string | number | boolean;
};

type BigQueryInsertRow = {
  rowId?: string;
  json: Record<string, unknown>;
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

export async function insertBigQueryRows(params: {
  datasetId: string;
  tableId: string;
  rows: BigQueryInsertRow[];
}): Promise<void> {
  getBigQueryProjectId();
  const client = getBigQueryClient();
  const table = client.dataset(params.datasetId).table(params.tableId);

  try {
    await table.insert(
      params.rows.map((row) => ({
        insertId: row.rowId,
        json: row.json,
      })),
      {
        ignoreUnknownValues: true,
        skipInvalidRows: false,
        raw: true,
      },
    );
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
