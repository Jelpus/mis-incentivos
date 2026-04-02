import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";

type SalesForceOptionRow = {
  linea_principal: string | null;
  team_id: string | null;
  territorio_individual: string | null;
  nombre_completo: string | null;
};

type GuaranteeRow = {
  id: string;
  guarantee_start_month: string;
  guarantee_end_month: string;
  scope_type: "linea" | "team_id" | "representante";
  scope_value: string;
  scope_label: string | null;
  rule_scope: "all_rules" | "single_rule";
  rule_key: string | null;
  target_coverage: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type BigQueryRuleOptionRow = {
  value: string | null;
};

function normalizePeriodCollection(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePeriodMonthInput(String(value ?? "").trim()))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

function toPeriodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

export type GarantiasPageData = {
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  availableStatusPeriods: string[];
  storageReady: boolean;
  storageMessage: string | null;
  rows: GuaranteeRow[];
  options: {
    lineas: string[];
    teamIds: string[];
    representatives: Array<{ value: string; label: string }>;
    rules: string[];
    rulesMessage: string | null;
  };
};

export async function getGarantiasPageData(
  periodMonthInput?: string | null,
): Promise<GarantiasPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const [latestPeriodResult, statusPeriodsResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false })
      .limit(1),
    supabase
      .from("sales_force_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false }),
  ]);

  if (latestPeriodResult.error) {
    throw new Error(`Failed to load latest period: ${latestPeriodResult.error.message}`);
  }

  if (statusPeriodsResult.error) {
    throw new Error(`Failed to load status periods: ${statusPeriodsResult.error.message}`);
  }

  const latestAvailablePeriodMonth = normalizePeriodMonthInput(
    String(latestPeriodResult.data?.[0]?.period_month ?? "").trim(),
  );
  const availableStatusPeriods = normalizePeriodCollection(
    (statusPeriodsResult.data ?? []).map((row) => row.period_month),
  );
  const requestedPeriod = normalizePeriodMonthInput(periodMonthInput);
  const periodMonth =
    requestedPeriod && availableStatusPeriods.includes(requestedPeriod)
      ? requestedPeriod
      : latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const [salesForceOptionsResult, guaranteesResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("linea_principal, team_id, territorio_individual, nombre_completo")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
    supabase
      .from("team_incentive_guarantees")
      .select(
        `
          id,
          guarantee_start_month,
          guarantee_end_month,
          scope_type,
          scope_value,
          scope_label,
          rule_scope,
          rule_key,
          target_coverage,
          is_active,
          note,
          created_at,
          updated_at
        `,
      )
      .order("updated_at", { ascending: false }),
  ]);

  if (salesForceOptionsResult.error) {
    throw new Error(`Failed to load options from status: ${salesForceOptionsResult.error.message}`);
  }

  let storageReady = true;
  let storageMessage: string | null = null;
  let rows: GuaranteeRow[] = [];

  if (guaranteesResult.error) {
    if (isMissingRelationError(guaranteesResult.error)) {
      storageReady = false;
      const tableName = getMissingRelationName(guaranteesResult.error) ?? "team_incentive_guarantees";
      storageMessage =
        `La tabla ${tableName} aun no existe. Crea el esquema docs/team-incentive-guarantees-schema.sql para habilitar este modulo.`;
    } else {
      throw new Error(`Failed to load guarantees: ${guaranteesResult.error.message}`);
    }
  } else {
    rows = (guaranteesResult.data ?? []) as GuaranteeRow[];
  }

  const salesForceRows = (salesForceOptionsResult.data ?? []) as SalesForceOptionRow[];
  const lineas = Array.from(
    new Set(
      salesForceRows
        .map((row) => String(row.linea_principal ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const teamIds = Array.from(
    new Set(
      salesForceRows
        .map((row) => String(row.team_id ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const representativeMap = new Map<string, string>();
  for (const row of salesForceRows) {
    const route = String(row.territorio_individual ?? "").trim();
    if (!route || representativeMap.has(route)) continue;
    const name = String(row.nombre_completo ?? "").trim();
    representativeMap.set(route, name ? `${name} (${route})` : route);
  }

  const representatives = Array.from(representativeMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  let rules: string[] = [];
  let rulesMessage: string | null = null;

  if (isBigQueryConfigured()) {
    try {
      const projectId = process.env.GCP_PROJECT_ID;
      const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
      const tableId =
        process.env.BQ_RESULTS_READ_TABLE?.trim() ||
        process.env.BQ_RESULTS_TABLE?.trim() ||
        "resultados_v2";
      const readStage = process.env.BQ_RESULTS_READ_STAGE?.trim() || null;
      const useStageFilter = Boolean(process.env.BQ_RESULTS_READ_TABLE?.trim() && readStage);

      if (!projectId) {
        rulesMessage = "Falta GCP_PROJECT_ID para cargar reglas desde resultados.";
      } else {
        const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
        const periodCode = toPeriodCode(periodMonth);
        const result = await fetchBigQueryRows<BigQueryRuleOptionRow>({
          query: `
            SELECT DISTINCT product_name AS value
            FROM ${tableRef}
            WHERE periodo = @periodo
              ${useStageFilter ? "AND stage = @stage" : ""}
              AND product_name IS NOT NULL
              AND TRIM(product_name) <> ''
            ORDER BY value ASC
            LIMIT 1000
          `,
          parameters: useStageFilter
            ? [
              { name: "periodo", type: "STRING", value: periodCode },
              { name: "stage", type: "STRING", value: readStage ?? "" },
            ]
            : [{ name: "periodo", type: "STRING", value: periodCode }],
        });

        rules = (result ?? [])
          .map((row) => String(row.value ?? "").trim())
          .filter((value) => value.length > 0);
      }
    } catch {
      rulesMessage = "No fue posible cargar reglas desde BigQuery. Puedes escribir la regla manualmente.";
    }
  } else {
    rulesMessage = "BigQuery no esta configurado. Puedes escribir la regla manualmente.";
  }

  return {
    periodMonth,
    latestAvailablePeriodMonth,
    availableStatusPeriods,
    storageReady,
    storageMessage,
    rows,
    options: {
      lineas,
      teamIds,
      representatives,
      rules,
      rulesMessage,
    },
  };
}
