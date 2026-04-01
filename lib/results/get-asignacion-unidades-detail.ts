import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";
import type { ProfileRole } from "@/lib/auth/current-user";

type AccessAnchor = {
  teamId: string | null;
  territorioIndividual: string | null;
};

type BigQueryAsignacionRow = {
  asignacion: string | null;
  ruta: string | null;
  teamid: string | null;
  brick: string | null;
  molecula_producto: string | null;
  valor: number | null;
  periodo: string | null;
  referencia: string | null;
};

export type AsignacionUnidadDetailRow = {
  asignacion: string | null;
  ruta: string | null;
  teamId: string | null;
  brick: string | null;
  moleculaProducto: string | null;
  valor: number | null;
  periodo: string | null;
  referencia: string | null;
};

export type AsignacionUnidadesDetailResult = {
  ok: boolean;
  rows: AsignacionUnidadDetailRow[];
  message: string | null;
};

async function getAnchorForUser(userId: string, role: ProfileRole | null): Promise<AccessAnchor | null> {
  const adminClient = createAdminClient();
  if (!adminClient) return null;

  if (role === "user") {
    const relation = await adminClient
      .from("profile_relations")
      .select("sales_force_status_id")
      .eq("user_id", userId)
      .eq("relation_type", "sales_force")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ sales_force_status_id: string | null }>();

    if (relation.error || !relation.data?.sales_force_status_id) return null;

    const status = await adminClient
      .from("sales_force_status")
      .select("team_id, territorio_individual")
      .eq("id", relation.data.sales_force_status_id)
      .eq("is_deleted", false)
      .maybeSingle<{ team_id: string | null; territorio_individual: string | null }>();

    if (status.error || !status.data) return null;

    return {
      teamId: status.data.team_id ?? null,
      territorioIndividual: status.data.territorio_individual ?? null,
    };
  }

  if (role === "manager") {
    const relation = await adminClient
      .from("profile_relations")
      .select("manager_status_id")
      .eq("user_id", userId)
      .eq("relation_type", "manager")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ manager_status_id: string | null }>();

    if (relation.error || !relation.data?.manager_status_id) return null;

    const status = await adminClient
      .from("manager_status")
      .select("team_id")
      .eq("id", relation.data.manager_status_id)
      .eq("is_deleted", false)
      .maybeSingle<{ team_id: string | null }>();

    if (status.error || !status.data) return null;

    return {
      teamId: status.data.team_id ?? null,
      territorioIndividual: null,
    };
  }

  return {
    teamId: null,
    territorioIndividual: null,
  };
}

function mapRow(row: BigQueryAsignacionRow): AsignacionUnidadDetailRow {
  return {
    asignacion: row.asignacion ?? null,
    ruta: row.ruta ?? null,
    teamId: row.teamid ?? null,
    brick: row.brick ?? null,
    moleculaProducto: row.molecula_producto ?? null,
    valor: row.valor ?? null,
    periodo: row.periodo ?? null,
    referencia: row.referencia ?? null,
  };
}

export async function getAsignacionUnidadesDetail(params: {
  role: ProfileRole | null;
  profileUserId: string;
  periodo: string;
  ruta: string;
  plan: string;
  teamId?: string | null;
}): Promise<AsignacionUnidadesDetailResult> {
  const projectId = process.env.GCP_PROJECT_ID;
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_ASIGNACION_UNIDADES_TABLE?.trim() || "asignacionUnidades";

  if (!projectId) {
    return { ok: false, rows: [], message: "Falta GCP_PROJECT_ID para consultar detalle." };
  }

  if (!isBigQueryConfigured()) {
    return { ok: false, rows: [], message: "BigQuery no esta configurado." };
  }

  const anchor = await getAnchorForUser(params.profileUserId, params.role);

  if ((params.role === "user" || params.role === "manager") && !anchor) {
    return { ok: false, rows: [], message: "No hay ancla de relacion para validar detalle." };
  }

  if (params.role === "user") {
    if (!anchor?.territorioIndividual || params.ruta !== anchor.territorioIndividual) {
      return { ok: false, rows: [], message: "No tienes permisos para consultar este detalle." };
    }
  }

  if (params.role === "manager") {
    const requestTeam = (params.teamId ?? "").trim();
    const anchorTeam = (anchor?.teamId ?? "").trim();

    // Manager can inspect detail rows in team view.
    // Only block when both teams are present and explicitly mismatch.
    if (requestTeam && anchorTeam && requestTeam !== anchorTeam) {
      return { ok: false, rows: [], message: "No tienes permisos para consultar este detalle." };
    }
  }

  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const where: string[] = [
    "periodo = @periodo",
    "ruta = @ruta",
    "plan = @plan",
  ];
  const parameters: Array<{
    name: string;
    type: "STRING" | "INT64" | "FLOAT64" | "BOOL";
    value: string | number | boolean | null;
  }> = [
    { name: "periodo", type: "STRING", value: params.periodo },
    { name: "ruta", type: "STRING", value: params.ruta },
    { name: "plan", type: "STRING", value: params.plan },
  ];

  if (params.role === "manager" && params.teamId) {
    where.push("teamid = @teamid");
    parameters.push({ name: "teamid", type: "STRING", value: params.teamId });
  }

  const rows = await fetchBigQueryRows<BigQueryAsignacionRow>({
    query: `
      SELECT
        CASE WHEN cuenta IS NOT NULL THEN cuenta ELSE brick END AS asignacion,
        ruta,
        teamid,
        brick,
        molecula_producto,
        valor,
        periodo,
        encontrar AS referencia
      FROM ${tableRef}
      WHERE ${where.join(" AND ")}
      ORDER BY valor DESC
      LIMIT 200
    `,
    parameters,
  });

  return {
    ok: true,
    rows: (rows ?? []).map(mapRow),
    message: null,
  };
}
