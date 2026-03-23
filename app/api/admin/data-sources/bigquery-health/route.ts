import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import {
  isBigQueryConfigured,
  validateBigQueryTableConnection,
} from "@/lib/integrations/bigquery";

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

export async function POST() {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return NextResponse.json({ ok: false, message: "No autorizado." }, { status: 401 });
  }

  if (!isBigQueryConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "BigQuery no esta configurado. Revisa GCP_PROJECT_ID, GCP_SERVICE_ACCOUNT_EMAIL y la llave privada.",
      },
      { status: 400 },
    );
  }

  const datasetId = process.env.BQ_DATASET_ID ?? "incentivos";
  const tableId = process.env.BQ_TABLE_FILES_NORMALIZADOS ?? "filesNormalizados";

  try {
    await validateBigQueryTableConnection({ datasetId, tableId });
    return NextResponse.json({
      ok: true,
      message: `Conexion OK con ${datasetId}.${tableId}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `Conexion KO con ${datasetId}.${tableId}: ${error.message}`
            : `Conexion KO con ${datasetId}.${tableId}.`,
      },
      { status: 500 },
    );
  }
}
