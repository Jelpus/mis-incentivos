import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBigQueryRows, insertBigQueryRows, isBigQueryConfigured, runBigQueryQuery } from "@/lib/integrations/bigquery";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 220;
const BQ_DELETE_RETRY_ATTEMPTS = 4;
const BQ_DELETE_RETRY_DELAY_MS = 8000;

type StatusRow = {
  territorio_individual: string | null;
  team_id: string | null;
  is_active: boolean | null;
  is_vacant: boolean | null;
};

type RuleVersionRow = {
  team_id: string | null;
  version_no: number | null;
  created_at: string | null;
  rule_definition_id: string | null;
};

type RuleItemRow = {
  id: number | null;
  definition_id: string | null;
  product_name: string | null;
  plan_type_name: string | null;
  prod_weight: number | string | null;
};

type RuleItemSourceRow = {
  item_id: number | null;
  source_order: number | null;
  file_code: string | null;
  file_display: string | null;
  fuente: string | null;
  metric: string | null;
  molecula_producto: string | null;
};

type ObjectiveVersionRow = {
  id: string | null;
  version_no: number | null;
};

type ObjectiveTargetRow = {
  territorio_individual: string | null;
  team_id: string | null;
  product_name: string | null;
  metodo?: string | null;
  plan_type_name: string | null;
  target: number | string | null;
  brick: string | null;
  cuenta: string | null;
  sales_credity?: number | string | null;
};

type BigQueryFilesRow = {
  archivo: string | null;
  institucion: string | null;
  brick: string | null;
  estado: string | null;
  codigo_estado: string | null;
  molecula_producto: string | null;
  metric: string | null;
  fuente: string | null;
  ytd: string | null;
  valor: number | null;
  periodo: string | null;
};

type AssignmentRow = {
  periodo: string;
  ruta: string;
  teamid: string;
  plan: string;
  plan_type_name: string | null;
  archivo: string | null;
  file_code: string | null;
  source_order: number | null;
  fuente: string | null;
  metric: string | null;
  molecula_producto: string | null;
  brick: string | null;
  cuenta: string | null;
  encontrar: "brick" | "estado" | "global";
  peso: number;
  objetivo: number;
  valor: number;
  resultado: number;
  cobertura: number;
  objetivo_total_plan: number;
  valor_total_plan: number;
  resultado_total_plan: number;
  match_mode: "exact" | "fuzzy" | "none";
  none_reason: string | null;
  objective_block: "private" | "drilldown_cuentas" | "drilldown_estados" | "otros";
  matched_rows_count: number;
  valor_imss: number;
  valor_issste: number;
};

export type CalculoProcessRunResult = {
  periodMonth: string;
  objectiveVersionNo: number | null;
  sourceRowsInPeriod: number;
  assignmentsCount: number;
  productsEvaluated: number;
  exactMatches: number;
  fuzzyMatches: number;
  totalObjetivo: number;
  totalValor: number;
  totalResultado: number;
  previewRows: Array<{
    ruta: string;
    teamid: string;
    plan: string;
    plan_type_name: string | null;
    archivo: string | null;
    fuente: string | null;
    metric: string | null;
    molecula_producto: string | null;
    brick: string | null;
    cuenta: string | null;
    encontrar: "brick" | "estado" | "global";
    peso: number;
    objetivo: number;
    valor: number;
    resultado: number;
    cobertura: number;
    match_mode: "exact" | "fuzzy" | "none";
    none_reason: string | null;
    objective_block: "private" | "drilldown_cuentas" | "drilldown_estados" | "otros";
    matched_rows_count: number;
    valor_imss: number;
    valor_issste: number;
  }>;
};

function toUpperTrim(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeTextForCompare(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normalizeTokenForContains(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCodeToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function isLikelyEstadoCode(value: string): boolean {
  return /^\d{1,3}$/.test(value);
}

function isFlexibleBrickMatch(expectedBrick: string, rowBrick: string): boolean {
  const expected = normalizeTokenForContains(expectedBrick);
  const actual = normalizeTokenForContains(rowBrick);
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  return actual.includes(expected) || expected.includes(actual);
}

function splitMoleculeCandidates(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const tokens = raw
    .split(/[;,/|]+/g)
    .map((token) => normalizeTextForCompare(token))
    .filter((token) => token.length > 0);
  const unique = new Set<string>();
  const normalizedFull = normalizeTextForCompare(raw);
  if (normalizedFull) unique.add(normalizedFull);
  for (const token of tokens) unique.add(token);
  return Array.from(unique);
}

function canonicalFuenteToken(value: unknown): string {
  const normalized = normalizeTextForCompare(value);
  if (!normalized) return "";
  // Permite tratar DESPLAZAMIENTO y DESPLAZAMIENTOS como equivalentes.
  return normalized.endsWith("S") && normalized.length > 1
    ? normalized.slice(0, -1)
    : normalized;
}

function splitFuenteCandidates(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const tokens: string[] = [];
  const topLevelParts = raw.split(/[;,/|]+/g);
  for (const part of topLevelParts) {
    const subParts = part
      .split(/\b(?:Y|E|AND)\b/gi)
      .map((token) => canonicalFuenteToken(token))
      .filter((token) => token.length > 0);
    tokens.push(...subParts);
  }
  const normalizedFull = canonicalFuenteToken(raw);
  const unique = new Set<string>();
  if (normalizedFull) unique.add(normalizedFull);
  for (const token of tokens) unique.add(token);
  return Array.from(unique);
}

function splitMetricCandidates(value: unknown): string[] {
  const raw = normalizeTextForCompare(value);
  if (!raw) return [];
  const tokens = raw
    .split(/[;,/|]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return Array.from(new Set(tokens));
}

function inferInstitutionByProductName(productName: string): "IMSS" | "ISSSTE" | null {
  const normalized = normalizeTextForCompare(productName);
  if (!normalized) return null;
  if (normalized.includes("ISSSTE")) return "ISSSTE";
  if (normalized.includes("IMSS")) return "IMSS";
  return null;
}

function isGobProductName(productName: string): boolean {
  const normalized = normalizeTextForCompare(productName);
  if (!normalized) return false;
  return normalized.endsWith(" GOB") || normalized.includes(" GOB ");
}

function dedupeSources(rows: RuleItemSourceRow[]): RuleItemSourceRow[] {
  const byKey = new Map<string, RuleItemSourceRow>();
  for (const row of rows) {
    const key = [
      normalizeFileCode(row.file_code),
      normalizeTextForCompare(row.file_display),
      canonicalFuenteToken(row.fuente),
      normalizeTextForCompare(row.metric),
      normalizeTextForCompare(row.molecula_producto),
    ].join("||");

    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, row);
      continue;
    }

    const currentOrder = Number(current.source_order ?? Number.POSITIVE_INFINITY);
    const nextOrder = Number(row.source_order ?? Number.POSITIVE_INFINITY);
    if (nextOrder < currentOrder) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function normalizeFileCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntOrNull(value: unknown): number | null {
  const num = toOptionalNumber(value);
  if (num === null) return null;
  return Number.isFinite(num) ? Math.round(num) : null;
}

function isRetryableMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("authretryablefetcherror") ||
    normalized.includes("timeout")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry<T extends { error: { message?: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  let lastResult = await run();
  if (!lastResult.error) return lastResult;

  for (let attempt = 1; attempt < RETRY_ATTEMPTS; attempt += 1) {
    const message = String(lastResult.error?.message ?? "");
    if (!isRetryableMessage(message)) break;
    await wait(RETRY_DELAY_MS * attempt);
    lastResult = await run();
    if (!lastResult.error) return lastResult;
  }
  return lastResult;
}

function isBigQueryStreamingBufferMutationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("streaming buffer") &&
    (normalized.includes("update or delete") || normalized.includes("would affect rows"))
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function pickLatestRuleByTeam(rows: RuleVersionRow[]): Map<string, RuleVersionRow> {
  const output = new Map<string, RuleVersionRow>();
  for (const row of rows) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;
    const current = output.get(teamId);
    if (!current) {
      output.set(teamId, row);
      continue;
    }
    const nextVersion = Number(row.version_no ?? 0);
    const currentVersion = Number(current.version_no ?? 0);
    if (nextVersion > currentVersion) {
      output.set(teamId, row);
      continue;
    }
    if (nextVersion === currentVersion && String(row.created_at ?? "") > String(current.created_at ?? "")) {
      output.set(teamId, row);
    }
  }
  return output;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function computeCobertura(objetivo: number, resultado: number): number {
  if (objetivo === 0 && resultado === 0) return 0;
  if (objetivo === 0 && resultado > 1) return 1;
  if (resultado > 0 && objetivo > 0) return round6(resultado / objetivo);
  return 0;
}

function chunkArray<T>(rows: T[], chunkSize: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    output.push(rows.slice(index, index + chunkSize));
  }
  return output;
}

export async function runCalculoProcess(
  periodMonth: string,
  options?: { persist?: boolean; previewLimit?: number },
): Promise<CalculoProcessRunResult> {
  const shouldPersist = options?.persist !== false;
  const previewLimitRaw = Number(options?.previewLimit ?? 0);
  const previewLimit = Number.isFinite(previewLimitRaw) && previewLimitRaw > 0
    ? Math.floor(previewLimitRaw)
    : Number.POSITIVE_INFINITY;

  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client no disponible.");

  if (!isBigQueryConfigured()) {
    throw new Error("BigQuery no esta configurado.");
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error("Falta GCP_PROJECT_ID.");
  }

  const filesDataset = process.env.BQ_DATASET_ID?.trim() || "incentivos";
  const filesTable = process.env.BQ_TABLE_FILES_NORMALIZADOS?.trim() || "filesNormalizados";
  const asignacionDataset = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const asignacionTable = process.env.BQ_ASIGNACION_UNIDADES_TABLE?.trim() || "asignacionUnidades";
  const filesTableRef = `\`${projectId}.${filesDataset}.${filesTable}\``;

  const filesDataPeriodo = await fetchBigQueryRows<BigQueryFilesRow>({
    query: `
      SELECT
        archivo,
        institucion,
        brick,
        estado,
        codigo_estado,
        molecula_producto,
        metric,
        fuente,
        ytd,
        valor,
        periodo
      FROM ${filesTableRef}
      WHERE periodo = @periodo
    `,
    parameters: [{ name: "periodo", type: "STRING", value: periodMonth.slice(0, 7) }],
  });

  const statusResult = await queryWithRetry(() =>
    supabase
      .from("sales_force_status")
      .select("territorio_individual, team_id, is_active, is_vacant")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true),
  );

  if (statusResult.error) {
    throw new Error(`No se pudo leer sales_force_status: ${statusResult.error.message}`);
  }

  const statusRows = ((statusResult.data ?? []) as StatusRow[]).filter((row) => {
    return String(row.territorio_individual ?? "").trim() && String(row.team_id ?? "").trim();
  });

  const uniqueTeamIds = Array.from(new Set(statusRows.map((row) => String(row.team_id ?? "").trim())));

  const ruleVersionsResult = await queryWithRetry(() =>
    supabase
      .from("team_incentive_rule_versions")
      .select("team_id, version_no, created_at, rule_definition_id")
      .eq("period_month", periodMonth)
      .in("team_id", uniqueTeamIds),
  );

  if (ruleVersionsResult.error) {
    if (isMissingRelationError(ruleVersionsResult.error)) {
      const tableName = getMissingRelationName(ruleVersionsResult.error) ?? "team_incentive_rule_versions";
      throw new Error(`No existe ${tableName}.`);
    }
    throw new Error(`No se pudieron leer versiones de reglas: ${ruleVersionsResult.error.message}`);
  }

  const latestRuleByTeam = pickLatestRuleByTeam((ruleVersionsResult.data ?? []) as RuleVersionRow[]);
  const definitionIds = Array.from(
    new Set(
      Array.from(latestRuleByTeam.values())
        .map((row) => String(row.rule_definition_id ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  const itemsByDefinition = new Map<string, RuleItemRow[]>();
  const sourcesByItemId = new Map<number, RuleItemSourceRow[]>();

  if (definitionIds.length > 0) {
    const itemRowsResult = await queryWithRetry(() =>
      supabase
        .from("team_rule_definition_items")
        .select("id, definition_id, product_name, plan_type_name, prod_weight")
        .in("definition_id", definitionIds),
    );

    if (itemRowsResult.error) {
      if (isMissingRelationError(itemRowsResult.error)) {
        const tableName = getMissingRelationName(itemRowsResult.error) ?? "team_rule_definition_items";
        throw new Error(`No existe ${tableName}.`);
      }
      throw new Error(`No se pudieron leer items de reglas: ${itemRowsResult.error.message}`);
    }

    const itemRows = (itemRowsResult.data ?? []) as RuleItemRow[];
    for (const row of itemRows) {
      const definitionId = String(row.definition_id ?? "").trim();
      if (!definitionId) continue;
      const current = itemsByDefinition.get(definitionId) ?? [];
      current.push(row);
      itemsByDefinition.set(definitionId, current);
    }

    const itemIds = itemRows
      .map((row) => Number(row.id ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (itemIds.length > 0) {
      const itemSourcesResult = await queryWithRetry(() =>
        supabase
          .from("team_rule_definition_item_sources")
          .select("item_id, source_order, file_code, file_display, fuente, metric, molecula_producto")
          .in("item_id", itemIds),
      );

      if (itemSourcesResult.error) {
        if (isMissingRelationError(itemSourcesResult.error)) {
          const tableName = getMissingRelationName(itemSourcesResult.error) ?? "team_rule_definition_item_sources";
          throw new Error(`No existe ${tableName}.`);
        }
        throw new Error(`No se pudieron leer fuentes de reglas: ${itemSourcesResult.error.message}`);
      }

      for (const sourceRow of (itemSourcesResult.data ?? []) as RuleItemSourceRow[]) {
        const itemId = Number(sourceRow.item_id ?? 0);
        if (!Number.isFinite(itemId) || itemId <= 0) continue;
        const current = sourcesByItemId.get(itemId) ?? [];
        current.push(sourceRow);
        sourcesByItemId.set(itemId, current);
      }
    }
  }

  const objectiveVersionResult = await queryWithRetry(() =>
    supabase
      .from("team_objective_target_versions")
      .select("id, version_no")
      .eq("period_month", periodMonth)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle<ObjectiveVersionRow>(),
  );

  if (objectiveVersionResult.error) {
    if (isMissingRelationError(objectiveVersionResult.error)) {
      const tableName = getMissingRelationName(objectiveVersionResult.error) ?? "team_objective_target_versions";
      throw new Error(`No existe ${tableName}.`);
    }
    throw new Error(`No se pudo leer version de objetivos: ${objectiveVersionResult.error.message}`);
  }

  const objectiveVersionId = String(objectiveVersionResult.data?.id ?? "").trim();
  if (!objectiveVersionId) {
    throw new Error("No hay version de objetivos para el periodo.");
  }

  const objectiveRowsWithOptionalFieldsResult = await queryWithRetry(() =>
    supabase
      .from("team_objective_targets")
      .select("territorio_individual, team_id, product_name, metodo, plan_type_name, target, brick, cuenta, sales_credity")
      .eq("version_id", objectiveVersionId),
  );

  let objectiveRowsError = objectiveRowsWithOptionalFieldsResult.error;
  let objectiveRowsData = (objectiveRowsWithOptionalFieldsResult.data ?? []) as ObjectiveTargetRow[];

  if (
    objectiveRowsError &&
    (
      String(objectiveRowsError.message ?? "").toLowerCase().includes("sales_credity") ||
      String(objectiveRowsError.message ?? "").toLowerCase().includes("metodo")
    )
  ) {
    const objectiveRowsWithoutOptionalResult = await queryWithRetry(() =>
      supabase
        .from("team_objective_targets")
        .select("territorio_individual, team_id, product_name, plan_type_name, target, brick, cuenta")
        .eq("version_id", objectiveVersionId),
    );
    objectiveRowsError = objectiveRowsWithoutOptionalResult.error;
    objectiveRowsData = (objectiveRowsWithoutOptionalResult.data ?? []) as ObjectiveTargetRow[];
  }

  if (objectiveRowsError) {
    if (isMissingRelationError(objectiveRowsError)) {
      const tableName = getMissingRelationName(objectiveRowsError) ?? "team_objective_targets";
      throw new Error(`No existe ${tableName}.`);
    }
    throw new Error(`No se pudieron leer objetivos: ${objectiveRowsError.message}`);
  }

  const targetsByRouteProduct = new Map<string, ObjectiveTargetRow[]>();
  for (const row of objectiveRowsData) {
    const route = toUpperTrim(row.territorio_individual);
    const product = toUpperTrim(row.product_name);
    if (!route || !product) continue;
    const key = `${route}::${product}`;
    const current = targetsByRouteProduct.get(key) ?? [];
    current.push(row);
    targetsByRouteProduct.set(key, current);
  }

  const filesByCode = new Map<string, BigQueryFilesRow[]>();
  const filesByDisplay = new Map<string, BigQueryFilesRow[]>();
  for (const row of filesDataPeriodo) {
    const code = normalizeFileCode(row.archivo);
    const display = normalizeTextForCompare(row.archivo);
    if (code) {
      const current = filesByCode.get(code) ?? [];
      current.push(row);
      filesByCode.set(code, current);
    }
    if (display) {
      const current = filesByDisplay.get(display) ?? [];
      current.push(row);
      filesByDisplay.set(display, current);
    }
  }

  const assignments: AssignmentRow[] = [];
  let productsEvaluated = 0;
  let exactMatches = 0;
  let fuzzyMatches = 0;
  let totalObjetivo = 0;
  let totalValor = 0;
  let totalResultado = 0;

  for (const member of statusRows) {
    const route = toUpperTrim(member.territorio_individual);
    const teamId = String(member.team_id ?? "").trim();
    const latestRule = latestRuleByTeam.get(teamId);
    if (!latestRule) continue;
    const definitionId = String(latestRule.rule_definition_id ?? "").trim();
    if (!definitionId) continue;
    const items = itemsByDefinition.get(definitionId) ?? [];

    for (const item of items) {
      const productName = toUpperTrim(item.product_name);
      if (!productName) continue;
      const routeProductKey = `${route}::${productName}`;
      const targetRows = targetsByRouteProduct.get(routeProductKey) ?? [];
      if (targetRows.length === 0) continue;

      const itemId = Number(item.id ?? 0);
      const rawSources = Number.isFinite(itemId) && itemId > 0 ? (sourcesByItemId.get(itemId) ?? []) : [];
      const sources = dedupeSources(rawSources);
      if (sources.length === 0) continue;
      productsEvaluated += 1;

      const planTypeName = String(item.plan_type_name ?? targetRows[0]?.plan_type_name ?? "").trim() || null;

      const privateTargets = targetRows.filter((row) => toUpperTrim(row.brick) === "PRIVATE" || !String(row.brick ?? "").trim());
      const nonPrivateTargets = targetRows.filter((row) => !privateTargets.includes(row));
      const evaluatedTargets = nonPrivateTargets.length > 0 ? nonPrivateTargets : privateTargets;
      const objetivoTotalPlan = round6(targetRows.reduce((sum, row) => sum + toNumber(row.target), 0));
      const groupedTargets = new Map<
        string,
        {
          brickValue: string;
          estadoValue: string;
          estadoCodeValue: string;
          objectiveBlock: AssignmentRow["objective_block"];
          findingMode: "brick" | "estado" | "global";
          objetivo: number;
          peso: number;
          brickRaw: string | null;
          cuentaRaw: string | null;
        }
      >();

      for (const targetRow of evaluatedTargets) {
        const brickValue = toUpperTrim(targetRow.brick);
        const estadoValue = toUpperTrim(targetRow.cuenta);
        const estadoCodeValue = normalizeCodeToken(targetRow.brick);
        const metodoRaw = toUpperTrim(targetRow.metodo);
        const normalizedMetodo =
          metodoRaw.includes("ESTADO")
            ? "ESTADOS"
            : metodoRaw.includes("CUENTA")
              ? "CUENTAS"
              : metodoRaw.includes("PRIVATE")
                ? "PRIVATE"
                : "";
        const targetPlanType = toUpperTrim(
          normalizedMetodo || targetRow.plan_type_name || planTypeName,
        );
        const targetIsCuentas = targetPlanType.includes("CUENTA");
        const targetIsEstado = targetPlanType.includes("ESTADO");
        const isPrivateTarget =
          (toUpperTrim(targetRow.brick) === "PRIVATE" || !String(targetRow.brick ?? "").trim()) &&
          (toUpperTrim(targetRow.cuenta) === "PRIVATE" || !String(targetRow.cuenta ?? "").trim());
        const objectiveBlock: AssignmentRow["objective_block"] = isPrivateTarget
          ? "private"
          : targetIsCuentas
            ? "drilldown_cuentas"
            : targetIsEstado
              ? "drilldown_estados"
              : "otros";
        const inferredIsEstado =
          !targetIsCuentas &&
          (targetIsEstado || isLikelyEstadoCode(estadoCodeValue));
        const findingMode: "brick" | "estado" | "global" = targetIsCuentas
          ? "brick"
          : inferredIsEstado
            ? "estado"
            : nonPrivateTargets.length > 0
              ? "brick"
              : "global";
        const objetivo = round6(toNumber(targetRow.target));
        const pesoRaw = toOptionalNumber((targetRow as { sales_credity?: number | string | null }).sales_credity);
        const peso = pesoRaw === null ? 1 : pesoRaw;

        const groupKey =
          findingMode === "estado"
            ? (estadoCodeValue ? `estado_code:${estadoCodeValue}` : `estado_text:${estadoValue}`)
            : findingMode === "brick"
              ? `brick:${normalizeTokenForContains(targetRow.brick)}`
              : "global";

        const existing = groupedTargets.get(groupKey);
        if (!existing) {
          groupedTargets.set(groupKey, {
            brickValue,
            estadoValue,
            estadoCodeValue,
            objectiveBlock,
            findingMode,
            objetivo,
            peso,
            brickRaw: targetRow.brick ?? null,
            cuentaRaw: targetRow.cuenta ?? null,
          });
          continue;
        }

        const objetivoPrevio = existing.objetivo;
        const objetivoNuevo = round6(existing.objetivo + objetivo);
        if (objetivoNuevo > 0) {
          const pesoPonderado =
            ((existing.peso * objetivoPrevio) + (peso * objetivo)) / objetivoNuevo;
          existing.peso = round6(pesoPonderado);
        }
        existing.objetivo = objetivoNuevo;
      }

      let valorTotalPlan = 0;
      let resultadoTotalPlan = 0;
      const perProductAssignments: AssignmentRow[] = [];
      const expectedInstitution = inferInstitutionByProductName(productName);
      const isGobProduct = isGobProductName(productName);
      const desplazamientoFuenteToken = canonicalFuenteToken("DESPLAZAMIENTO");
      const ordenesFuenteToken = canonicalFuenteToken("ORDENES");

      for (const source of sources.sort((a, b) => Number(a.source_order ?? 0) - Number(b.source_order ?? 0))) {
        const fileCode = normalizeFileCode(source.file_code);
        const fileDisplayNormalized = normalizeTextForCompare(source.file_display);
        const expectedFuenteCandidates = splitFuenteCandidates(source.fuente);
        const expectedMetricCandidates = splitMetricCandidates(source.metric);
        const expectedMolecule = normalizeTextForCompare(source.molecula_producto);
        const expectedMoleculeCandidates = splitMoleculeCandidates(source.molecula_producto);
        const sourceRows = [
          ...(fileCode ? (filesByCode.get(fileCode) ?? []) : []),
          ...(fileDisplayNormalized ? (filesByDisplay.get(fileDisplayNormalized) ?? []) : []),
        ];

        const dedupedSourceRows = Array.from(new Set(sourceRows));

        for (const groupedTarget of groupedTargets.values()) {
          const brickValue = groupedTarget.brickValue;
          const estadoValue = groupedTarget.estadoValue;
          const estadoCodeValue = groupedTarget.estadoCodeValue;
          const objectiveBlock = groupedTarget.objectiveBlock;
          const peso = groupedTarget.peso;
          const objetivo = groupedTarget.objetivo;
          const findingMode = groupedTarget.findingMode;
          const preferRouteInGlobal =
            findingMode === "global" &&
            dedupedSourceRows.some((row) => toUpperTrim(row.brick) === route);

          const afterFuenteRows: BigQueryFilesRow[] = [];
          const afterMetricRows: BigQueryFilesRow[] = [];
          const afterInstitutionRows: BigQueryFilesRow[] = [];
          const afterFindRows: BigQueryFilesRow[] = [];
          const exactBucket: BigQueryFilesRow[] = [];
          const fuzzyBucket: BigQueryFilesRow[] = [];

          for (const row of dedupedSourceRows) {
            const rowFuenteCanonical = canonicalFuenteToken(row.fuente);
            const fuenteMatch =
              expectedFuenteCandidates.length === 0 ||
              expectedFuenteCandidates.includes(rowFuenteCanonical);
            if (!fuenteMatch) continue;
            afterFuenteRows.push(row);

            const rowMetric = normalizeTextForCompare(row.metric);
            const metricMatch =
              expectedMetricCandidates.length === 0 ||
              expectedMetricCandidates.includes(rowMetric);
            if (!metricMatch) continue;
            afterMetricRows.push(row);

            if (expectedInstitution) {
              const rowInstitution = normalizeTextForCompare(row.institucion);
              const institutionMatch = rowInstitution.includes(expectedInstitution);
              if (!institutionMatch) continue;
            } else if (isGobProduct) {
              let expectedGobInstitution: "IMSS" | "ISSSTE" | null = null;
              if (rowFuenteCanonical === desplazamientoFuenteToken) expectedGobInstitution = "IMSS";
              if (rowFuenteCanonical === ordenesFuenteToken) expectedGobInstitution = "ISSSTE";
              if (expectedGobInstitution) {
                const rowInstitution = normalizeTextForCompare(row.institucion);
                const institutionMatch = rowInstitution.includes(expectedGobInstitution);
                if (!institutionMatch) continue;
              }
            }
            afterInstitutionRows.push(row);

            if (findingMode === "brick") {
              if (!brickValue) continue;
              if (!isFlexibleBrickMatch(brickValue, String(row.brick ?? ""))) continue;
            }

            if (findingMode === "estado") {
              const rowCodigoEstado = normalizeCodeToken(row.codigo_estado);
              const rowEstadoTexto = toUpperTrim(row.estado);
              const hasTargetCodigoEstado = Boolean(estadoCodeValue);
              const hasTargetEstadoTexto = Boolean(estadoValue);

              if (hasTargetCodigoEstado) {
                const matchesCodigoEstado = Boolean(rowCodigoEstado) && rowCodigoEstado === estadoCodeValue;
                if (!matchesCodigoEstado) continue;
              } else {
                if (!hasTargetEstadoTexto) continue;
                const matchesEstadoTexto = Boolean(rowEstadoTexto) && rowEstadoTexto === estadoValue;
                if (!matchesEstadoTexto) continue;
              }
            }
            if (findingMode === "global" && preferRouteInGlobal) {
              if (toUpperTrim(row.brick) !== route) continue;
            }
            afterFindRows.push(row);

            const rowMoleculeNorm = normalizeTextForCompare(row.molecula_producto);
            const rowMoleculeCandidates = splitMoleculeCandidates(row.molecula_producto);
            if (!expectedMolecule) {
              exactBucket.push(row);
              continue;
            }
            if (!rowMoleculeNorm) continue;

            const hasExactMolecule = expectedMoleculeCandidates.some((candidate) =>
              rowMoleculeCandidates.includes(candidate),
            );
            if (hasExactMolecule) {
              exactBucket.push(row);
              continue;
            }

            let maxRatio = 0;
            for (const rowCandidate of rowMoleculeCandidates) {
              for (const expectedCandidate of expectedMoleculeCandidates) {
                const ratio = similarityRatio(rowCandidate, expectedCandidate);
                if (ratio > maxRatio) maxRatio = ratio;
              }
            }
            if (maxRatio >= 0.92) {
              fuzzyBucket.push(row);
            }
          }

          const matchedRows = exactBucket.length > 0 ? exactBucket : fuzzyBucket;
          const matchMode: "exact" | "fuzzy" | "none" = exactBucket.length > 0 ? "exact" : fuzzyBucket.length > 0 ? "fuzzy" : "none";
          if (matchMode === "exact") exactMatches += 1;
          if (matchMode === "fuzzy") fuzzyMatches += 1;
          let noneReason: string | null = null;
          if (matchMode === "none") {
            if (dedupedSourceRows.length === 0) {
              noneReason = "archivo";
            } else if (afterFuenteRows.length === 0) {
              noneReason = "fuente";
            } else if (afterMetricRows.length === 0) {
              noneReason = "metric";
            } else if ((expectedInstitution || isGobProduct) && afterInstitutionRows.length === 0) {
              noneReason = "institucion";
            } else if (afterFindRows.length === 0) {
              noneReason = findingMode === "estado"
                ? "estado"
                : findingMode === "brick"
                  ? "brick"
                  : preferRouteInGlobal
                    ? "ruta"
                    : "filtro";
            } else {
              noneReason = "molecula";
            }
          }

          const valor = round6(
            matchedRows.reduce((sum, row) => {
              const ytd = toNumber(row.ytd);
              if (ytd !== 0) return sum + ytd;
              return sum + toNumber(row.valor);
            }, 0),
          );
          const valorImss = round6(
            matchedRows.reduce((sum, row) => {
              const inst = normalizeTextForCompare(row.institucion);
              if (!inst.includes("IMSS")) return sum;
              const ytd = toNumber(row.ytd);
              return sum + (ytd !== 0 ? ytd : toNumber(row.valor));
            }, 0),
          );
          const valorIssste = round6(
            matchedRows.reduce((sum, row) => {
              const inst = normalizeTextForCompare(row.institucion);
              if (!inst.includes("ISSSTE")) return sum;
              const ytd = toNumber(row.ytd);
              return sum + (ytd !== 0 ? ytd : toNumber(row.valor));
            }, 0),
          );
          const resultado = round6(valor * peso);
          const cobertura = computeCobertura(objetivo, resultado);
          valorTotalPlan = round6(valorTotalPlan + valor);
          resultadoTotalPlan = round6(resultadoTotalPlan + resultado);

          perProductAssignments.push({
            periodo: periodMonth.slice(0, 7),
            ruta: route,
            teamid: teamId,
            plan: productName,
            plan_type_name: planTypeName,
            archivo: source.file_display ?? null,
            file_code: source.file_code ?? null,
            source_order: source.source_order ?? null,
            fuente: source.fuente ?? null,
            metric: source.metric ?? null,
            molecula_producto: source.molecula_producto ?? null,
            brick: groupedTarget.brickRaw,
            cuenta: groupedTarget.cuentaRaw,
            encontrar: findingMode,
            peso,
            objetivo,
            valor,
            resultado,
            cobertura,
            objetivo_total_plan: objetivoTotalPlan,
            valor_total_plan: 0,
            resultado_total_plan: 0,
            match_mode: matchMode,
            none_reason: noneReason,
            objective_block: objectiveBlock,
            matched_rows_count: matchedRows.length,
            valor_imss: valorImss,
            valor_issste: valorIssste,
          });
        }
      }

      for (const row of perProductAssignments) {
        row.valor_total_plan = valorTotalPlan;
        row.resultado_total_plan = resultadoTotalPlan;
      }

      totalObjetivo = round6(totalObjetivo + objetivoTotalPlan);
      totalValor = round6(totalValor + valorTotalPlan);
      totalResultado = round6(totalResultado + resultadoTotalPlan);
      assignments.push(...perProductAssignments);
    }
  }

  if (shouldPersist) {
    const asignacionTableRef = `\`${projectId}.${asignacionDataset}.${asignacionTable}\``;
    let deleteOk = false;
    let lastDeleteError: unknown = null;
    for (let attempt = 1; attempt <= BQ_DELETE_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await runBigQueryQuery({
          query: `DELETE FROM ${asignacionTableRef} WHERE periodo = @periodo`,
          parameters: [{ name: "periodo", type: "STRING", value: periodMonth.slice(0, 7) }],
        });
        deleteOk = true;
        break;
      } catch (error) {
        lastDeleteError = error;
        if (!isBigQueryStreamingBufferMutationError(error)) {
          throw error;
        }
        if (attempt < BQ_DELETE_RETRY_ATTEMPTS) {
          await wait(BQ_DELETE_RETRY_DELAY_MS * attempt);
        }
      }
    }
    if (!deleteOk) {
      const baseMessage =
        lastDeleteError instanceof Error ? lastDeleteError.message : String(lastDeleteError ?? "");
      throw new Error(
        `BigQuery aun tiene filas en streaming buffer para asignacionUnidades (${periodMonth.slice(0, 7)}). Reintenta en unos minutos. Detalle: ${baseMessage}`,
      );
    }

    const chunks = chunkArray(assignments, 5_000);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      await insertBigQueryRows({
        datasetId: asignacionDataset,
        tableId: asignacionTable,
        rows: chunk.map((row, index) => ({
          rowId: `${row.periodo}-${row.teamid}-${row.ruta}-${row.plan}-${chunkIndex}-${index}`,
          json: {
            brick: row.brick ?? null,
            molecula_producto: row.molecula_producto ?? null,
            valor: toOptionalNumber(row.valor),
            trimestre: null,
            semestre: null,
            metric: row.metric ?? null,
            fuente: row.fuente ?? null,
            periodo: row.periodo ?? null,
            index: chunkIndex * 5_000 + index + 1,
            encontrar: row.encontrar ?? null,
            peso: toIntOrNull(row.peso),
            resultadomes: toIntOrNull(row.resultado),
            resultadosemestre: toIntOrNull(row.resultado_total_plan),
            ruta: row.ruta ?? null,
            plan: row.plan ?? null,
            teamid: row.teamid ?? null,
            cuenta: row.cuenta ?? null,
            estado: row.encontrar === "estado" ? (row.brick ?? null) : null,
            medico: null,
            cedula: null,
            cp: null,
            objetivo: toIntOrNull(row.objetivo),
          } as Record<string, unknown>,
        })),
      });
    }
  }

  const previewRows = assignments.slice(0, previewLimit).map((row) => ({
    ruta: row.ruta,
    teamid: row.teamid,
    plan: row.plan,
    plan_type_name: row.plan_type_name,
    archivo: row.archivo,
    fuente: row.fuente,
    metric: row.metric,
    molecula_producto: row.molecula_producto,
    brick: row.brick,
    cuenta: row.cuenta,
    encontrar: row.encontrar,
    peso: row.peso,
    objetivo: row.objetivo,
    valor: row.valor,
    resultado: row.resultado,
    cobertura: row.cobertura,
    match_mode: row.match_mode,
    none_reason: row.none_reason,
    objective_block: row.objective_block,
    matched_rows_count: row.matched_rows_count,
    valor_imss: row.valor_imss,
    valor_issste: row.valor_issste,
  }));

  return {
    periodMonth,
    objectiveVersionNo: Number(objectiveVersionResult.data?.version_no ?? 0) || null,
    sourceRowsInPeriod: filesDataPeriodo.length,
    assignmentsCount: assignments.length,
    productsEvaluated,
    exactMatches,
    fuzzyMatches,
    totalObjetivo,
    totalValor,
    totalResultado,
    previewRows,
  };
}
