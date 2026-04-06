import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";
import type { ProfileRole } from "@/lib/auth/current-user";

type AccessAnchor = {
  periodMonth: string;
  teamId: string | null;
  territorioIndividual: string | null;
  territorioManager: string | null;
  noEmpleado: number | null;
};

type BigQueryResultRow = {
  team_id: string | null;
  plan_type_name: string | null;
  product_name: string | null;
  prod_weight: number | null;
  agrupador: string | null;
  garantia: boolean | null;
  elemento: string | null;
  ruta: string | null;
  representante: string | null;
  actual: number | null;
  resultado: number | null;
  objetivo: number | null;
  cobertura: number | null;
  pagovariable: number | null;
  coberturapago: number | null;
  nombre: string | null;
  linea: string | null;
  manager: string | null;
  empleado: number | null;
  pagoresultado: number | null;
  periodo: string | null;
};

type BigQuerySummaryRow = {
  row_count: number | null;
  total_pagoresultado: number | null;
  total_pagovariable: number | null;
  avg_cobertura: number | null;
};

export type ResultadoScope = "all" | "manager_team" | "self";

export type ResultadoSummary = {
  rowCount: number;
  totalPagoResultado: number;
  totalPagoVariable: number;
  avgCobertura: number;
};

export type ResultadoRecord = {
  teamId: string | null;
  planTypeName: string | null;
  productName: string | null;
  prodWeight: number | null;
  agrupador: string | null;
  garantia: boolean | null;
  elemento: string | null;
  ruta: string | null;
  representante: string | null;
  actual: number | null;
  resultado: number | null;
  objetivo: number | null;
  cobertura: number | null;
  pagoVariable: number | null;
  coberturaPago: number | null;
  nombre: string | null;
  linea: string | null;
  manager: string | null;
  managerName: string | null;
  empleado: number | null;
  pagoResultado: number | null;
  periodo: string | null;
};

export type ResultadosV2Data = {
  ok: boolean;
  scope: ResultadoScope;
  periodCode: string | null;
  availablePeriods: string[];
  summary: ResultadoSummary;
  rows: ResultadoRecord[];
  message: string | null;
};

export type ResultadoPeriodSummary = {
  periodCode: string;
  rowCount: number;
  totalPagoResultado: number;
  totalPagoVariable: number;
  avgCobertura: number;
};

type QueryParam = {
  name: string;
  type: "STRING" | "INT64" | "FLOAT64" | "BOOL";
  value: string | number | boolean | null;
};

function getResultsReadConfig(overrideTableId?: string | null) {
  const forcedTableId = String(overrideTableId ?? "").trim();
  const tableId =
    forcedTableId ||
    process.env.BQ_RESULTS_READ_TABLE?.trim() ||
    process.env.BQ_RESULTS_TABLE?.trim() ||
    "resultados_v2";
  const readStage = process.env.BQ_RESULTS_READ_STAGE?.trim() || null;
  const useStageFilter = Boolean(!forcedTableId && process.env.BQ_RESULTS_READ_TABLE?.trim() && readStage);
  return { tableId, readStage, useStageFilter };
}

type BigQueryPeriodSummaryRow = {
  periodo: string | null;
  row_count: number | null;
  total_pagoresultado: number | null;
  total_pagovariable: number | null;
  avg_cobertura: number | null;
};

function toPeriodCode(periodMonth: string | null | undefined): string | null {
  const raw = String(periodMonth ?? "").trim();
  if (!raw) return null;
  if (/^\d{6}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw.slice(0, 4)}${raw.slice(5, 7)}`;
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw.slice(0, 4)}${raw.slice(5, 7)}`;
  }
  return null;
}

function mapRow(row: BigQueryResultRow): ResultadoRecord {
  return {
    teamId: row.team_id ?? null,
    planTypeName: row.plan_type_name ?? null,
    productName: row.product_name ?? null,
    prodWeight: row.prod_weight ?? null,
    agrupador: row.agrupador ?? null,
    garantia: row.garantia ?? null,
    elemento: row.elemento ?? null,
    ruta: row.ruta ?? null,
    representante: row.representante ?? null,
    actual: row.actual ?? null,
    resultado: row.resultado ?? null,
    objetivo: row.objetivo ?? null,
    cobertura: row.cobertura ?? null,
    pagoVariable: row.pagovariable ?? null,
    coberturaPago: row.coberturapago ?? null,
    nombre: row.nombre ?? null,
    linea: row.linea ?? null,
    manager: row.manager ?? null,
    managerName: null,
    empleado: row.empleado ?? null,
    pagoResultado: row.pagoresultado ?? null,
    periodo: row.periodo ?? null,
  };
}

function toPeriodMonthDate(periodCode: string | null | undefined): string | null {
  const value = String(periodCode ?? "").trim();
  if (!/^\d{6}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
}

async function buildManagerNameMap(params: {
  periodCode: string;
  managerTerritories: string[];
}): Promise<Record<string, string>> {
  const adminClient = createAdminClient();
  const periodMonth = toPeriodMonthDate(params.periodCode);
  const territories = Array.from(
    new Set(
      params.managerTerritories
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (!adminClient || !periodMonth || territories.length === 0) {
    return {};
  }

  const result = await adminClient
    .from("manager_status")
    .select("territorio_manager, nombre_manager, is_active, updated_at")
    .eq("period_month", periodMonth)
    .eq("is_deleted", false)
    .in("territorio_manager", territories)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });

  if (result.error || !result.data) {
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of result.data) {
    const territory = String(row.territorio_manager ?? "").trim();
    const name = String(row.nombre_manager ?? "").trim();
    if (!territory || !name || map[territory]) continue;
    map[territory] = name;
  }

  return map;
}

async function getAnchorForUser(userId: string, role: ProfileRole | null): Promise<AccessAnchor | null> {
  const adminClient = createAdminClient();
  if (!adminClient) return null;

  if (role === "user") {
    const relation = await adminClient
      .from("profile_relations")
      .select("period_month, sales_force_status_id")
      .eq("user_id", userId)
      .eq("relation_type", "sales_force")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ period_month: string; sales_force_status_id: string | null }>();

    if (relation.error || !relation.data?.sales_force_status_id) return null;

    const status = await adminClient
      .from("sales_force_status")
      .select("period_month, team_id, territorio_individual, no_empleado")
      .eq("id", relation.data.sales_force_status_id)
      .eq("is_deleted", false)
      .maybeSingle<{
        period_month: string;
        team_id: string | null;
        territorio_individual: string | null;
        no_empleado: number | null;
      }>();

    if (status.error || !status.data) return null;

    return {
      periodMonth: status.data.period_month,
      teamId: status.data.team_id ?? null,
      territorioIndividual: status.data.territorio_individual ?? null,
      territorioManager: null,
      noEmpleado: status.data.no_empleado ?? null,
    };
  }

  if (role === "manager") {
    const relation = await adminClient
      .from("profile_relations")
      .select("period_month, manager_status_id")
      .eq("user_id", userId)
      .eq("relation_type", "manager")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ period_month: string; manager_status_id: string | null }>();

    if (relation.error || !relation.data?.manager_status_id) return null;

    const status = await adminClient
      .from("manager_status")
      .select("period_month, team_id, territorio_manager")
      .eq("id", relation.data.manager_status_id)
      .eq("is_deleted", false)
      .maybeSingle<{
        period_month: string;
        team_id: string | null;
        territorio_manager: string | null;
      }>();

    if (status.error || !status.data) return null;

    return {
      periodMonth: status.data.period_month,
      teamId: status.data.team_id ?? null,
      territorioIndividual: null,
      territorioManager: status.data.territorio_manager ?? null,
      noEmpleado: null,
    };
  }

  return null;
}

function resolveScope(role: ProfileRole | null): ResultadoScope {
  if (role === "admin" || role === "super_admin" || role === "viewer") return "all";
  if (role === "manager") return "manager_team";
  return "self";
}

async function buildScopeContext(params: {
  role: ProfileRole | null;
  profileUserId: string;
  projectId: string;
  datasetId: string;
  tableId: string;
  readStage?: string | null;
  useStageFilter?: boolean;
}) {
  const scope = resolveScope(params.role);
  const anchor = await getAnchorForUser(params.profileUserId, params.role);

  const scopeClauses: string[] = [];
  const scopeParams: QueryParam[] = [];

  if (scope === "self") {
    if (anchor?.noEmpleado) {
      scopeClauses.push("empleado = @empleado");
      scopeParams.push({ name: "empleado", type: "INT64", value: anchor.noEmpleado });
    } else if (anchor?.territorioIndividual) {
      scopeClauses.push("representante = @representante");
      scopeParams.push({
        name: "representante",
        type: "STRING",
        value: anchor.territorioIndividual,
      });
    } else {
      return {
        ok: false as const,
        scope,
        anchor,
        scopeWhereSql: "",
        scopeParams,
        availablePeriods: [] as string[],
        message: "No hay ancla de relacion para filtrar resultados del usuario.",
      };
    }
  } else if (scope === "manager_team") {
    if (anchor?.territorioManager) {
      scopeClauses.push("manager = @manager");
      scopeParams.push({ name: "manager", type: "STRING", value: anchor.territorioManager });
    } else {
      return {
        ok: false as const,
        scope,
        anchor,
        scopeWhereSql: "",
        scopeParams,
        availablePeriods: [] as string[],
        message: "No hay ancla de relacion para filtrar resultados del manager.",
      };
    }
  }

  const scopeWhereSql = scopeClauses.length ? scopeClauses.join(" AND ") : "1=1";
  const tableRef = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const periodWhereSql = params.useStageFilter
    ? `${scopeWhereSql} AND stage = @stage`
    : scopeWhereSql;
  const periodParams = params.useStageFilter
    ? [...scopeParams, { name: "stage", type: "STRING" as const, value: params.readStage ?? "" }]
    : scopeParams;

  const periodRows = await fetchBigQueryRows<{ periodo: string | null }>({
    query: `
      SELECT DISTINCT periodo
      FROM ${tableRef}
      WHERE ${periodWhereSql}
        AND periodo IS NOT NULL
      ORDER BY periodo DESC
      LIMIT 24
    `,
    parameters: periodParams,
  });

  const availablePeriods = (periodRows ?? [])
    .map((row) => row.periodo)
    .filter((value): value is string => Boolean(value && /^\d{6}$/.test(value)));

  return {
    ok: true as const,
    scope,
    anchor,
    scopeWhereSql,
    scopeParams,
    availablePeriods,
    message: null as string | null,
  };
}

export async function getResultadosV2PeriodSummary(params: {
  role: ProfileRole | null;
  profileUserId: string;
  maxPeriods?: number;
  readTableId?: string | null;
}): Promise<{
  ok: boolean;
  scope: ResultadoScope;
  periods: ResultadoPeriodSummary[];
  message: string | null;
}> {
  const projectId = process.env.GCP_PROJECT_ID;
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const { tableId, readStage, useStageFilter } = getResultsReadConfig(params.readTableId);
  const maxPeriods = Math.max(3, Math.min(24, params.maxPeriods ?? 12));

  const fallbackScope = resolveScope(params.role);

  if (!projectId) {
    return {
      ok: false,
      scope: fallbackScope,
      periods: [],
      message: "Falta GCP_PROJECT_ID para consultar resultados.",
    };
  }

  if (!isBigQueryConfigured()) {
    return {
      ok: false,
      scope: fallbackScope,
      periods: [],
      message: "BigQuery no esta configurado en el entorno.",
    };
  }

  const context = await buildScopeContext({
    role: params.role,
    profileUserId: params.profileUserId,
    projectId,
    datasetId,
    tableId,
    readStage,
    useStageFilter,
  });

  if (!context.ok) {
    return {
      ok: true,
      scope: context.scope,
      periods: [],
      message: context.message,
    };
  }

  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const summaryWhereSql = useStageFilter
    ? `${context.scopeWhereSql} AND stage = @stage`
    : context.scopeWhereSql;
  const summaryParams = useStageFilter
    ? [...context.scopeParams, { name: "stage", type: "STRING" as const, value: readStage ?? "" }]
    : context.scopeParams;

  const summaryRows = await fetchBigQueryRows<BigQueryPeriodSummaryRow>({
    query: `
      SELECT
        periodo,
        COUNT(1) AS row_count,
        SUM(IFNULL(pagoresultado, 0)) AS total_pagoresultado,
        SUM(IFNULL(pagovariable, 0)) AS total_pagovariable,
      AVG(IFNULL(cobertura, 0)) AS avg_cobertura
      FROM ${tableRef}
      WHERE ${summaryWhereSql}
      GROUP BY periodo
      ORDER BY periodo DESC
      LIMIT ${maxPeriods}
    `,
    parameters: summaryParams,
  });

  const periods = (summaryRows ?? [])
    .filter((row) => Boolean(row.periodo && /^\d{6}$/.test(row.periodo ?? "")))
    .map((row) => ({
      periodCode: String(row.periodo),
      rowCount: Number(row.row_count ?? 0),
      totalPagoResultado: Number(row.total_pagoresultado ?? 0),
      totalPagoVariable: Number(row.total_pagovariable ?? 0),
      avgCobertura: Number(row.avg_cobertura ?? 0),
    }));

  return {
    ok: true,
    scope: context.scope,
    periods,
    message: null,
  };
}

export async function getResultadosV2Data(params: {
  role: ProfileRole | null;
  profileUserId: string;
  periodCode?: string | null;
  maxRows?: number;
  readTableId?: string | null;
}): Promise<ResultadosV2Data> {
  const maxRows = Math.max(20, Math.min(500, params.maxRows ?? 120));
  const projectId = process.env.GCP_PROJECT_ID;
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const { tableId, readStage, useStageFilter } = getResultsReadConfig(params.readTableId);

  const emptySummary: ResultadoSummary = {
    rowCount: 0,
    totalPagoResultado: 0,
    totalPagoVariable: 0,
    avgCobertura: 0,
  };

  if (!projectId) {
    return {
      ok: false,
      scope: "self",
      periodCode: null,
      availablePeriods: [],
      summary: emptySummary,
      rows: [],
      message: "Falta GCP_PROJECT_ID para consultar resultados.",
    };
  }

  if (!isBigQueryConfigured()) {
    return {
      ok: false,
      scope: "self",
      periodCode: null,
      availablePeriods: [],
      summary: emptySummary,
      rows: [],
      message: "BigQuery no esta configurado en el entorno.",
    };
  }

  const context = await buildScopeContext({
    role: params.role,
    profileUserId: params.profileUserId,
    projectId,
    datasetId,
    tableId,
    readStage,
    useStageFilter,
  });

  if (!context.ok) {
    return {
      ok: true,
      scope: context.scope,
      periodCode: null,
      availablePeriods: [],
      summary: emptySummary,
      rows: [],
      message: context.message,
    };
  }

  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const { scope, anchor, scopeWhereSql, scopeParams, availablePeriods } = context;

  const requestedPeriod = toPeriodCode(params.periodCode ?? null);
  const anchorPeriod = toPeriodCode(anchor?.periodMonth);
  let infoMessage: string | null = null;

  let selectedPeriod: string | null = null;
  if (requestedPeriod && availablePeriods.includes(requestedPeriod)) {
    selectedPeriod = requestedPeriod;
  } else if (anchorPeriod && availablePeriods.includes(anchorPeriod)) {
    selectedPeriod = anchorPeriod;
  } else {
    selectedPeriod = availablePeriods[0] ?? null;
    if (requestedPeriod || anchorPeriod) {
      infoMessage =
        "Se mostro el ultimo periodo disponible con datos para este alcance.";
    }
  }

  if (!selectedPeriod) {
    return {
      ok: true,
      scope,
      periodCode: null,
      availablePeriods,
      summary: emptySummary,
      rows: [],
      message: "No hay periodos disponibles en resultados_v2 para este alcance.",
    };
  }

  const whereSql = useStageFilter
    ? `${scopeWhereSql} AND periodo = @periodo AND stage = @stage`
    : `${scopeWhereSql} AND periodo = @periodo`;
  const parameters = useStageFilter
    ? [
      ...scopeParams,
      { name: "periodo", type: "STRING" as const, value: selectedPeriod },
      { name: "stage", type: "STRING" as const, value: readStage ?? "" },
    ]
    : [...scopeParams, { name: "periodo", type: "STRING" as const, value: selectedPeriod }];

  const summaryQuery = `
    SELECT
      COUNT(1) AS row_count,
      SUM(IFNULL(pagoresultado, 0)) AS total_pagoresultado,
      SUM(IFNULL(pagovariable, 0)) AS total_pagovariable,
      AVG(IFNULL(cobertura, 0)) AS avg_cobertura
    FROM ${tableRef}
    WHERE ${whereSql}
  `;

  const rowsQuery = `
    SELECT
      team_id,
      plan_type_name,
      product_name,
      prod_weight,
      agrupador,
      garantia,
      elemento,
      ruta,
      representante,
      actual,
      resultado,
      objetivo,
      cobertura,
      pagovariable,
      coberturapago,
      nombre,
      linea,
      manager,
      empleado,
      pagoresultado,
      periodo
    FROM ${tableRef}
    WHERE ${whereSql}
    ORDER BY pagoresultado DESC, plan_type_name ASC, product_name ASC
    LIMIT ${maxRows}
  `;

  const [summaryRows, resultRows] = await Promise.all([
    fetchBigQueryRows<BigQuerySummaryRow>({ query: summaryQuery, parameters }),
    fetchBigQueryRows<BigQueryResultRow>({ query: rowsQuery, parameters }),
  ]);

  const summary = summaryRows[0] ?? null;

  const mappedRows = (resultRows ?? []).map(mapRow);
  const managerNameByTerritory = await buildManagerNameMap({
    periodCode: selectedPeriod,
    managerTerritories: mappedRows.map((row) => String(row.manager ?? "").trim()),
  });
  const enrichedRows = mappedRows.map((row) => {
    const managerKey = String(row.manager ?? "").trim();
    return {
      ...row,
      managerName: managerKey ? (managerNameByTerritory[managerKey] ?? null) : null,
    };
  });

  return {
    ok: true,
    scope,
    periodCode: selectedPeriod,
    availablePeriods,
    summary: {
      rowCount: Number(summary?.row_count ?? 0),
      totalPagoResultado: Number(summary?.total_pagoresultado ?? 0),
      totalPagoVariable: Number(summary?.total_pagovariable ?? 0),
      avgCobertura: Number(summary?.avg_cobertura ?? 0),
    },
    rows: enrichedRows,
    message: infoMessage,
  };
}
