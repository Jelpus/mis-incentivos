import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";
import { createAdminClient } from "@/lib/supabase/admin";

type QueryParam = {
  name: string;
  type: "STRING" | "INT64" | "FLOAT64" | "BOOL";
  value: string | number | boolean | null;
};

type BigQueryPeriodRow = {
  periodo: string | null;
};

type BigQueryRouteCoverageRow = {
  route_key: string | null;
  total_payout: number | null;
  total_variable: number | null;
  payout_coverage: number | null;
};

type BigQueryOptionRow = {
  value: string | null;
};

type ManagerOption = {
  value: string;
  label: string;
};

export type PerformanceReportFilters = {
  teamId?: string | null;
  linea?: string | null;
  productName?: string | null;
  manager?: string | null;
};

export type PerformanceCoverageBin = {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
  routeCount: number;
  percentOfForce: number;
};

export type PerformanceSummary = {
  routeCount: number;
  totalPayout: number;
  totalVariable: number;
  overallCoverage: number;
  averageCoverage: number;
  medianCoverage: number;
  payBottom10Share: number;
  payBottom25Share: number;
  noPayoutCount: number;
  noPayoutPercent: number;
  belowTargetCount: number;
  belowTargetPercent: number;
  aboveTargetCount: number;
  aboveTargetPercent: number;
  above200Count: number;
  above200Percent: number;
  hittingCapCount: number;
  hittingCapPercent: number;
  bottom10Count: number;
  bottom20Count: number;
  bottom30Count: number;
  atOrAbove100Count: number;
  atOrAbove200Count: number;
};

export type PerformanceFilterOptions = {
  teamIds: string[];
  lineas: string[];
  productNames: string[];
  managers: ManagerOption[];
};

export type PerformanceReportData = {
  ok: boolean;
  availablePeriods: string[];
  selectedPeriods: string[];
  filters: {
    teamId: string;
    linea: string;
    productName: string;
    manager: string;
  };
  filterOptions: PerformanceFilterOptions;
  summary: PerformanceSummary;
  bins: PerformanceCoverageBin[];
  message: string | null;
};

function normalizePeriodCodes(periodCodes: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      periodCodes
        .map((value) => String(value ?? "").trim())
        .filter((value) => /^\d{6}$/.test(value)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

function toPeriodMonthDates(periodCodes: string[]): string[] {
  return periodCodes
    .filter((value) => /^\d{6}$/.test(value))
    .map((value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-01`);
}

function buildPeriodInClause(periodCodes: string[]) {
  const valid = normalizePeriodCodes(periodCodes);
  if (!valid.length) return "'000000'";
  return valid.map((value) => `'${value}'`).join(", ");
}

function buildWhereSql(params: {
  periodCodes: string[];
  filters: PerformanceReportFilters;
  exclude?: keyof PerformanceReportFilters;
}) {
  const clauses = [`periodo IN (${buildPeriodInClause(params.periodCodes)})`];
  const parameters: QueryParam[] = [];

  const teamId = String(params.filters.teamId ?? "").trim();
  const linea = String(params.filters.linea ?? "").trim();
  const productName = String(params.filters.productName ?? "").trim();
  const manager = String(params.filters.manager ?? "").trim();

  if (params.exclude !== "teamId" && teamId) {
    clauses.push("team_id = @teamId");
    parameters.push({ name: "teamId", type: "STRING", value: teamId });
  }
  if (params.exclude !== "linea" && linea) {
    clauses.push("linea = @linea");
    parameters.push({ name: "linea", type: "STRING", value: linea });
  }
  if (params.exclude !== "productName" && productName) {
    clauses.push("product_name = @productName");
    parameters.push({ name: "productName", type: "STRING", value: productName });
  }
  if (params.exclude !== "manager" && manager) {
    clauses.push("manager = @manager");
    parameters.push({ name: "manager", type: "STRING", value: manager });
  }

  return {
    whereSql: clauses.join(" AND "),
    parameters,
  };
}

function createEmptySummary(): PerformanceSummary {
  return {
    routeCount: 0,
    totalPayout: 0,
    totalVariable: 0,
    overallCoverage: 0,
    averageCoverage: 0,
    medianCoverage: 0,
    payBottom10Share: 0,
    payBottom25Share: 0,
    noPayoutCount: 0,
    noPayoutPercent: 0,
    belowTargetCount: 0,
    belowTargetPercent: 0,
    aboveTargetCount: 0,
    aboveTargetPercent: 0,
    above200Count: 0,
    above200Percent: 0,
    hittingCapCount: 0,
    hittingCapPercent: 0,
    bottom10Count: 0,
    bottom20Count: 0,
    bottom30Count: 0,
    atOrAbove100Count: 0,
    atOrAbove200Count: 0,
  };
}

function createCoverageBins(): PerformanceCoverageBin[] {
  const bins: PerformanceCoverageBin[] = [
    {
      key: "eq0",
      label: "0",
      min: null,
      max: 0,
      routeCount: 0,
      percentOfForce: 0,
    },
  ];

  for (let index = 1; index <= 25; index += 1) {
    const min = (index - 1) * 10;
    const max = index * 10;
    bins.push({
      key: `gt${min}lte${max}`,
      label: `${min + 1}-${max}`,
      min,
      max,
      routeCount: 0,
      percentOfForce: 0,
    });
  }

  bins.push({
    key: "gt250",
    label: ">250",
    min: 250,
    max: null,
    routeCount: 0,
    percentOfForce: 0,
  });

  return bins;
}

function computeBins(rows: BigQueryRouteCoverageRow[]): PerformanceCoverageBin[] {
  const bins = createCoverageBins();
  const totalRoutes = rows.length;

  for (const row of rows) {
    const coverage = Number(row.payout_coverage ?? 0);
    let index = 0;

    if (coverage <= 0) {
      index = 0;
    } else if (coverage > 250) {
      index = bins.length - 1;
    } else {
      index = Math.ceil(coverage / 10);
    }

    bins[index].routeCount += 1;
  }

  for (const bin of bins) {
    bin.percentOfForce = totalRoutes > 0 ? (bin.routeCount / totalRoutes) * 100 : 0;
  }

  return bins;
}

function computeSummary(rows: BigQueryRouteCoverageRow[]): PerformanceSummary {
  if (!rows.length) return createEmptySummary();

  const routeCount = rows.length;
  const totalPayout = rows.reduce((acc, row) => acc + Number(row.total_payout ?? 0), 0);
  const totalVariable = rows.reduce((acc, row) => acc + Number(row.total_variable ?? 0), 0);
  const overallCoverage = totalVariable > 0 ? (totalPayout / totalVariable) * 100 : 0;
  const averageCoverage =
    rows.reduce((acc, row) => acc + Number(row.payout_coverage ?? 0), 0) / routeCount;

  const sortedByCoverage = [...rows].sort(
    (a, b) => Number(a.payout_coverage ?? 0) - Number(b.payout_coverage ?? 0),
  );

  const middleIndex = Math.floor(routeCount / 2);
  const medianCoverage =
    routeCount % 2 === 0
      ? (Number(sortedByCoverage[middleIndex - 1].payout_coverage ?? 0) +
          Number(sortedByCoverage[middleIndex].payout_coverage ?? 0)) /
        2
      : Number(sortedByCoverage[middleIndex].payout_coverage ?? 0);

  const bottom10Count = Math.max(1, Math.ceil(routeCount * 0.1));
  const bottom20Count = Math.max(1, Math.ceil(routeCount * 0.2));
  const bottom30Count = Math.max(1, Math.ceil(routeCount * 0.3));
  const bottom25Count = Math.max(1, Math.ceil(routeCount * 0.25));
  const payoutBottom10 = sortedByCoverage
    .slice(0, bottom10Count)
    .reduce((acc, row) => acc + Number(row.total_payout ?? 0), 0);
  const payoutBottom25 = sortedByCoverage
    .slice(0, bottom25Count)
    .reduce((acc, row) => acc + Number(row.total_payout ?? 0), 0);

  const coverages = rows.map((row) => Number(row.payout_coverage ?? 0));
  const noPayoutCount = coverages.filter((value) => value <= 0).length;
  const belowTargetCount = coverages.filter((value) => value > 0 && value < 100).length;
  const aboveTargetCount = coverages.filter((value) => value >= 100).length;
  const above200Count = coverages.filter((value) => value >= 200).length;
  const hittingCapCount = coverages.filter((value) => value >= 250).length;

  return {
    routeCount,
    totalPayout,
    totalVariable,
    overallCoverage,
    averageCoverage,
    medianCoverage,
    payBottom10Share: totalPayout > 0 ? (payoutBottom10 / totalPayout) * 100 : 0,
    payBottom25Share: totalPayout > 0 ? (payoutBottom25 / totalPayout) * 100 : 0,
    noPayoutCount,
    noPayoutPercent: (noPayoutCount / routeCount) * 100,
    belowTargetCount,
    belowTargetPercent: (belowTargetCount / routeCount) * 100,
    aboveTargetCount,
    aboveTargetPercent: (aboveTargetCount / routeCount) * 100,
    above200Count,
    above200Percent: (above200Count / routeCount) * 100,
    hittingCapCount,
    hittingCapPercent: (hittingCapCount / routeCount) * 100,
    bottom10Count,
    bottom20Count,
    bottom30Count,
    atOrAbove100Count: aboveTargetCount,
    atOrAbove200Count: above200Count,
  };
}

async function getManagerNameMap(params: {
  managerKeys: string[];
  periodCodes: string[];
}): Promise<Record<string, string>> {
  const adminClient = createAdminClient();
  const managerKeys = Array.from(
    new Set(
      params.managerKeys
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );
  const periodMonths = toPeriodMonthDates(params.periodCodes);

  if (!adminClient || !managerKeys.length || !periodMonths.length) {
    return {};
  }

  const result = await adminClient
    .from("manager_status")
    .select("territorio_manager, nombre_manager, is_active, updated_at")
    .in("territorio_manager", managerKeys)
    .in("period_month", periodMonths)
    .eq("is_deleted", false)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });

  if (result.error || !result.data) return {};

  const map: Record<string, string> = {};
  for (const row of result.data) {
    const key = String(row.territorio_manager ?? "").trim();
    const name = String(row.nombre_manager ?? "").trim();
    if (!key || !name || map[key]) continue;
    map[key] = name;
  }
  return map;
}

async function fetchDistinctOptions(params: {
  tableRef: string;
  field: "team_id" | "linea" | "product_name" | "manager";
  periodCodes: string[];
  filters: PerformanceReportFilters;
  exclude: keyof PerformanceReportFilters;
}) {
  const whereContext = buildWhereSql({
    periodCodes: params.periodCodes,
    filters: params.filters,
    exclude: params.exclude,
  });

  const rows = await fetchBigQueryRows<BigQueryOptionRow>({
    query: `
      SELECT DISTINCT ${params.field} AS value
      FROM ${params.tableRef}
      WHERE ${whereContext.whereSql}
        AND ${params.field} IS NOT NULL
        AND TRIM(${params.field}) <> ''
      ORDER BY value ASC
      LIMIT 500
    `,
    parameters: whereContext.parameters,
  });

  return (rows ?? [])
    .map((row) => String(row.value ?? "").trim())
    .filter((value) => value.length > 0);
}

export async function getPerformanceReportData(params: {
  periodCodes?: string[];
  filters?: PerformanceReportFilters;
}): Promise<PerformanceReportData> {
  const projectId = process.env.GCP_PROJECT_ID;
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";

  const emptyData: PerformanceReportData = {
    ok: false,
    availablePeriods: [],
    selectedPeriods: [],
    filters: {
      teamId: "",
      linea: "",
      productName: "",
      manager: "",
    },
    filterOptions: {
      teamIds: [],
      lineas: [],
      productNames: [],
      managers: [],
    },
    summary: createEmptySummary(),
    bins: createCoverageBins(),
    message: "No fue posible cargar performance report.",
  };

  if (!projectId) {
    return { ...emptyData, message: "Falta GCP_PROJECT_ID para consultar performance report." };
  }

  if (!isBigQueryConfigured()) {
    return { ...emptyData, message: "BigQuery no esta configurado en el entorno." };
  }

  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  const periodRows = await fetchBigQueryRows<BigQueryPeriodRow>({
    query: `
      SELECT DISTINCT periodo
      FROM ${tableRef}
      WHERE periodo IS NOT NULL
      ORDER BY periodo DESC
      LIMIT 48
    `,
  });

  const availablePeriods = normalizePeriodCodes((periodRows ?? []).map((row) => row.periodo));
  if (!availablePeriods.length) {
    return { ...emptyData, ok: true, message: "No hay periodos disponibles en resultados_v2." };
  }

  const selectedPeriodsInput = normalizePeriodCodes(params.periodCodes ?? []);
  const selectedPeriods = selectedPeriodsInput.length
    ? selectedPeriodsInput.filter((period) => availablePeriods.includes(period))
    : [availablePeriods[0]];
  const finalSelectedPeriods = selectedPeriods.length ? selectedPeriods : [availablePeriods[0]];

  const filters = {
    teamId: String(params.filters?.teamId ?? "").trim(),
    linea: String(params.filters?.linea ?? "").trim(),
    productName: String(params.filters?.productName ?? "").trim(),
    manager: String(params.filters?.manager ?? "").trim(),
  };

  const whereContext = buildWhereSql({
    periodCodes: finalSelectedPeriods,
    filters,
  });

  const routeRows = await fetchBigQueryRows<BigQueryRouteCoverageRow>({
    query: `
      WITH route_base AS (
        SELECT
          COALESCE(NULLIF(TRIM(representante), ''), NULLIF(TRIM(ruta), '')) AS route_key,
          SUM(IFNULL(pagoresultado, 0)) AS total_payout,
          SUM(IFNULL(pagovariable, 0)) AS total_variable
        FROM ${tableRef}
        WHERE ${whereContext.whereSql}
        GROUP BY route_key
      )
      SELECT
        route_key,
        total_payout,
        total_variable,
        IF(total_variable = 0, 0, SAFE_MULTIPLY(SAFE_DIVIDE(total_payout, total_variable), 100)) AS payout_coverage
      FROM route_base
      WHERE route_key IS NOT NULL
    `,
    parameters: whereContext.parameters,
  });

  const [teamIds, lineas, productNames, managerKeys] = await Promise.all([
    fetchDistinctOptions({
      tableRef,
      field: "team_id",
      periodCodes: finalSelectedPeriods,
      filters,
      exclude: "teamId",
    }),
    fetchDistinctOptions({
      tableRef,
      field: "linea",
      periodCodes: finalSelectedPeriods,
      filters,
      exclude: "linea",
    }),
    fetchDistinctOptions({
      tableRef,
      field: "product_name",
      periodCodes: finalSelectedPeriods,
      filters,
      exclude: "productName",
    }),
    fetchDistinctOptions({
      tableRef,
      field: "manager",
      periodCodes: finalSelectedPeriods,
      filters,
      exclude: "manager",
    }),
  ]);

  const managerNameMap = await getManagerNameMap({
    managerKeys,
    periodCodes: finalSelectedPeriods,
  });

  const managers: ManagerOption[] = managerKeys.map((value) => {
    const managerName = managerNameMap[value];
    return {
      value,
      label: managerName ? `${managerName} (${value})` : value,
    };
  });

  managers.sort((a, b) => a.label.localeCompare(b.label));

  const summary = computeSummary(routeRows ?? []);
  const bins = computeBins(routeRows ?? []);

  return {
    ok: true,
    availablePeriods,
    selectedPeriods: finalSelectedPeriods,
    filters,
    filterOptions: {
      teamIds,
      lineas,
      productNames,
      managers,
    },
    summary,
    bins,
    message: null,
  };
}
