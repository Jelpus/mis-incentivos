import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRelationError } from "@/lib/admin/incentive-rules/shared";
import { runCalculoProcess } from "@/lib/admin/calculo/run-calculo-process";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 220;
const IN_CHUNK_SIZE = 250;
const CHUNK_PARALLELISM = 4;

type RuleVersionRow = {
  team_id: string | null;
  version_no: number | null;
  created_at: string | null;
  rule_definition_id: string | null;
};

type RuleItemRow = {
  definition_id: string | null;
  product_name: string | null;
  plan_type_name: string | null;
  prod_weight: number | string | null;
  agrupador: string | null;
  elemento: string | null;
  calcular_en_valores: boolean | null;
  precio_promedio: number | string | null;
  curva_pago: string | null;
};

type PayCurvePointRow = {
  curve_id: string | null;
  cobertura: number | string | null;
  pago: number | string | null;
};

type PayCurveRow = {
  id: string | null;
  curve_name: string | null;
};

type GuaranteeRow = {
  scope_type: "linea" | "team_id" | "representante";
  scope_value: string | null;
  rule_scope: "all_rules" | "single_rule";
  rule_key: string | null;
  is_active: boolean | null;
};

type StatusRow = {
  territorio_individual: string | null;
  team_id: string | null;
  linea_principal: string | null;
  nombre_completo: string | null;
  no_empleado: number | null;
  base_incentivos: number | null;
  territorio_padre: string | null;
};

type AssignmentLike = {
  ruta: string;
  teamid: string;
  plan: string;
  plan_type_name: string | null;
  brick: string | null;
  molecula_producto: string | null;
  objetivo: number;
  valor: number;
  resultado: number;
};

type RuleMeta = {
  prodWeight: number;
  planTypeName: string | null;
  agrupador: string | null;
  elemento: string | null;
  calcularEnValores: boolean;
  precioPromedio: number;
  curvaPagoId: string | null;
};

type WorkingRow = {
  teamId: string;
  planTypeName: string | null;
  productName: string;
  sourceProductKey: string;
  prodWeight: number;
  agrupador: string | null;
  elemento: string | null;
  ruta: string;
  brick: string | null;
  molecula: string | null;
  actual: number;
  resultado: number;
  objetivo: number;
  coverage: number;
  curvaPagoId: string | null;
  calcularEnValores: boolean;
  precioPromedio: number;
};

type GroupAccumulator = WorkingRow & {
  weightByProduct: Map<string, number>;
};

export type ResultadoV2PreviewRow = {
  team_id: string;
  plan_type_name: string | null;
  product_name: string;
  prod_weight: number;
  agrupador: string | null;
  garantia: boolean;
  elemento: string | null;
  ruta: string;
  representante: string;
  actual: number;
  resultado: number;
  objetivo: number;
  cobertura: number;
  pagovariable: number;
  coberturapago: number;
  nombre: string | null;
  linea: string | null;
  manager: string | null;
  empleado: number | null;
  pagoresultado: number;
  periodo: string;
  curva_pago: string | null;
  brick: string | null;
  molecula: string | null;
  calcular_en_valores: boolean;
};

export type ResultadoV2GroupingDetailRow = {
  ruta: string;
  team_id: string;
  plan_type_name: string | null;
  agrupador: string | null;
  product_name_origen: string;
  product_name_final: string;
  calcular_en_valores: boolean;
  fue_agrupado: boolean;
  brick: string | null;
  molecula: string | null;
  precio_promedio: number;
  prod_weight: number;
  objetivo_unidades: number;
  resultado_unidades: number;
  objetivo_dinero: number;
  resultado_dinero: number;
  actual_dinero: number;
  cobertura: number;
};

export type ResultadosV2PreviewResult = {
  periodMonth: string;
  rows: ResultadoV2PreviewRow[];
  groupingDetails: ResultadoV2GroupingDetailRow[];
  summary: {
    assignmentsCount: number;
    rowsCount: number;
    totalObjetivo: number;
    totalResultado: number;
    totalPagoVariable: number;
    totalPagoResultado: number;
    garantiasAplicadas: number;
  };
};

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

async function mapChunksWithConcurrency<TChunk, TResult>(
  chunks: TChunk[],
  mapper: (chunk: TChunk) => Promise<TResult>,
  concurrency = CHUNK_PARALLELISM,
): Promise<TResult[]> {
  const output: TResult[] = [];
  for (let index = 0; index < chunks.length; index += concurrency) {
    const batch = chunks.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map((chunk) => mapper(chunk)));
    output.push(...batchResults);
  }
  return output;
}

function computeCoverage(objetivo: number, resultado: number): number {
  if (objetivo === 0 && resultado === 0) return 0;
  if (objetivo === 0 && resultado > 1) return 1;
  if (resultado > 0 && objetivo > 0) {
    const cob = resultado / objetivo;
    const cobRounded = round2(cob);
    return cobRounded;
  }
  return 0;
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

function buildRuleMetaKey(teamId: string, planTypeName: string | null | undefined, productName: string): string {
  return `${teamId}||${normalizeKey(planTypeName ?? "")}||${normalizeKey(productName)}`;
}

function resolveCoberturaPago(
  cobertura: number,
  curveId: string | null,
  pointsByCurveId: Map<string, Array<{ cobertura: number; pago: number }>>,
): number {
  if (!curveId) return 0;
  const points = pointsByCurveId.get(curveId) ?? [];
  if (points.length === 0) return 0;

  const coberturaAcotada = round2(cobertura);
  const normalizedPoints = points
    .map((point) => ({
      cobertura: round2(toNumber(point.cobertura)),
      pago: toNumber(point.pago),
    }))
    .sort((a, b) => a.cobertura - b.cobertura);
  const sorted = normalizedPoints;
  const maxPoint = sorted[sorted.length - 1];
  let pago = 0;

  if (coberturaAcotada > maxPoint.cobertura) {
    pago = maxPoint.pago;
  } else {
    let minDiff = Number.POSITIVE_INFINITY;
    for (const point of sorted) {
      const diff = Math.abs(coberturaAcotada - point.cobertura);
      if (diff < minDiff) {
        minDiff = diff;
        pago = point.pago;
      }
    }
  }

  return round6(Math.min(pago, 4));
}

export async function buildResultadosV2Preview(periodMonth: string): Promise<ResultadosV2PreviewResult> {
  return buildResultadosV2PreviewWithOptions(periodMonth, {});
}

export async function buildResultadosV2PreviewWithOptions(
  periodMonth: string,
  options: { baseAssignments?: AssignmentLike[] },
): Promise<ResultadosV2PreviewResult> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client no disponible.");

  const baseAssignments = options.baseAssignments
    ? options.baseAssignments
    : (
      await runCalculoProcess(periodMonth, {
        persist: false,
        previewLimit: Number.POSITIVE_INFINITY,
      })
    ).previewRows as AssignmentLike[];
  const assignmentMap = new Map<string, AssignmentLike>();
  for (const row of baseAssignments) {
    const key = [
      row.ruta,
      row.teamid,
      row.plan,
      row.plan_type_name ?? "",
      row.brick ?? "",
      row.molecula_producto ?? "",
    ].join("||");
    const current = assignmentMap.get(key);
    if (!current) {
      assignmentMap.set(key, { ...row });
      continue;
    }
    current.objetivo = round6(current.objetivo + toNumber(row.objetivo));
    current.valor = round6(current.valor + toNumber(row.valor));
    current.resultado = round6(current.resultado + toNumber(row.resultado));
  }
  const assignments = Array.from(assignmentMap.values());

  const teamIds = Array.from(new Set(assignments.map((row) => row.teamid).filter((value) => value.length > 0)));
  const statusRoutes = Array.from(new Set(assignments.map((row) => row.ruta).filter((value) => value.length > 0)));

  const ruleVersionsResult = await queryWithRetry(() =>
    supabase
      .from("team_incentive_rule_versions")
      .select("team_id, version_no, created_at, rule_definition_id")
      .eq("period_month", periodMonth)
      .in("team_id", teamIds),
  );
  if (ruleVersionsResult.error) {
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
  const teamIdByDefinitionId = new Map<string, string>();
  for (const [teamId, row] of latestRuleByTeam.entries()) {
    const definitionId = String(row.rule_definition_id ?? "").trim();
    if (!definitionId) continue;
    teamIdByDefinitionId.set(definitionId, teamId);
  }

  const ruleMetaByTeamProduct = new Map<string, RuleMeta>();
  const ruleProductsByTeam = new Map<string, Array<{ productName: string; planTypeName: string | null }>>();
  if (definitionIds.length > 0) {
    const itemChunks = chunkArray(definitionIds, IN_CHUNK_SIZE);
    const itemResults = await mapChunksWithConcurrency(itemChunks, (definitionChunk) =>
      queryWithRetry(() =>
        supabase
          .from("team_rule_definition_items")
          .select("definition_id, product_name, plan_type_name, prod_weight, agrupador, elemento, calcular_en_valores, precio_promedio, curva_pago")
          .in("definition_id", definitionChunk),
      ),
    );

    for (const itemsResult of itemResults) {
      if (itemsResult.error) {
        throw new Error(`No se pudieron leer team_rule_definition_items: ${itemsResult.error.message}`);
      }
      for (const item of (itemsResult.data ?? []) as RuleItemRow[]) {
        const definitionId = String(item.definition_id ?? "").trim();
        if (!definitionId) continue;
        const teamId = teamIdByDefinitionId.get(definitionId);
        const productName = String(item.product_name ?? "").trim();
        if (!teamId || !productName) continue;
        const planTypeName = String(item.plan_type_name ?? "").trim() || null;
        ruleMetaByTeamProduct.set(buildRuleMetaKey(teamId, planTypeName, productName), {
          prodWeight: toNumber(item.prod_weight),
          planTypeName,
          agrupador: String(item.agrupador ?? "").trim() || null,
          elemento: String(item.elemento ?? "").trim() || null,
          calcularEnValores: item.calcular_en_valores === true,
          precioPromedio: toNumber(item.precio_promedio),
          curvaPagoId: String(item.curva_pago ?? "").trim() || null,
        });

        const productBucket = ruleProductsByTeam.get(teamId) ?? [];
        const exists = productBucket.some(
          (entry) =>
            normalizeKey(entry.productName) === normalizeKey(productName) &&
            normalizeKey(entry.planTypeName ?? "") === normalizeKey(planTypeName ?? ""),
        );
        if (!exists) productBucket.push({ productName, planTypeName });
        ruleProductsByTeam.set(teamId, productBucket);
      }
    }
  }

  const referencedCurveIds = Array.from(
    new Set(
      Array.from(ruleMetaByTeamProduct.values())
        .map((meta) => String(meta.curvaPagoId ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );
  const curveNameById = new Map<string, string>();
  const pointsByCurveId = new Map<string, Array<{ cobertura: number; pago: number }>>();
  const curveMetaChunks = chunkArray(referencedCurveIds, IN_CHUNK_SIZE);
  const curveMetaResults = await mapChunksWithConcurrency(curveMetaChunks, (curveChunk) =>
    queryWithRetry(() =>
      supabase
        .from("team_incentive_pay_curves")
        .select("id, curve_name")
        .in("id", curveChunk),
    ),
  );
  for (const curveMetaResult of curveMetaResults) {
    if (curveMetaResult.error) {
      throw new Error(`No se pudieron leer curvas de pago: ${curveMetaResult.error.message}`);
    }
    for (const curve of (curveMetaResult.data ?? []) as PayCurveRow[]) {
      const curveId = String(curve.id ?? "").trim();
      if (!curveId) continue;
      curveNameById.set(curveId, String(curve.curve_name ?? "").trim() || curveId);
    }
  }
  const curveChunks = chunkArray(referencedCurveIds, IN_CHUNK_SIZE);
  const pointsResults = await mapChunksWithConcurrency(curveChunks, (curveChunk) =>
    queryWithRetry(() =>
      supabase
        .from("team_incentive_pay_curve_points")
        .select("curve_id, cobertura, pago")
        .in("curve_id", curveChunk),
    ),
  );
  for (const pointsResult of pointsResults) {
    if (pointsResult.error) {
      throw new Error(`No se pudieron leer puntos de curvas: ${pointsResult.error.message}`);
    }
    for (const point of (pointsResult.data ?? []) as PayCurvePointRow[]) {
      const curveId = String(point.curve_id ?? "").trim();
      if (!curveId) continue;
      const bucket = pointsByCurveId.get(curveId) ?? [];
      bucket.push({ cobertura: toNumber(point.cobertura), pago: toNumber(point.pago) });
      pointsByCurveId.set(curveId, bucket);
    }
  }

  let statusRows: StatusRow[] = [];

  // Evita un IN masivo por ruta (puede romper por tamaño/timeout).
  // Primero intentamos por team_id; si falla, hacemos fallback por chunks de ruta.
  const statusByTeamResult = await queryWithRetry(() =>
    supabase
      .from("sales_force_status")
      .select("territorio_individual, team_id, linea_principal, nombre_completo, no_empleado, base_incentivos, territorio_padre")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .in("team_id", teamIds),
  );
  if (!statusByTeamResult.error) {
    statusRows = (statusByTeamResult.data ?? []) as StatusRow[];
  } else {
    const routeChunks = chunkArray(statusRoutes, IN_CHUNK_SIZE);
    const statusChunkResults = await mapChunksWithConcurrency(routeChunks, (routeChunk) =>
      queryWithRetry(() =>
        supabase
          .from("sales_force_status")
          .select("territorio_individual, team_id, linea_principal, nombre_completo, no_empleado, base_incentivos, territorio_padre")
          .eq("period_month", periodMonth)
          .eq("is_deleted", false)
          .in("territorio_individual", routeChunk),
      ),
    );
    const fallbackRows: StatusRow[] = [];
    for (const statusChunkResult of statusChunkResults) {
      if (statusChunkResult.error) {
        throw new Error(`No se pudo leer sales_force_status: ${statusChunkResult.error.message}`);
      }
      fallbackRows.push(...((statusChunkResult.data ?? []) as StatusRow[]));
    }
    statusRows = fallbackRows;
  }

  const statusByRoute = new Map<string, StatusRow>();
  for (const row of statusRows) {
    const route = String(row.territorio_individual ?? "").trim();
    if (!route) continue;
    statusByRoute.set(route, row);
  }

  const guaranteesResult = await queryWithRetry(() =>
    supabase
      .from("team_incentive_guarantees")
      .select("scope_type, scope_value, rule_scope, rule_key, is_active")
      .eq("is_active", true)
      .lte("guarantee_start_month", periodMonth)
      .gte("guarantee_end_month", periodMonth),
  );
  if (guaranteesResult.error && !isMissingRelationError(guaranteesResult.error)) {
    throw new Error(`No se pudo leer team_incentive_guarantees: ${guaranteesResult.error.message}`);
  }
  const guarantees = (guaranteesResult.data ?? []) as GuaranteeRow[];

  const assignmentByTeamRoutePlan = new Map<string, AssignmentLike>();
  for (const assignment of assignments) {
    const assignmentKey = [
      assignment.teamid,
      assignment.ruta,
      normalizeKey(assignment.plan_type_name ?? ""),
      normalizeKey(assignment.plan),
    ].join("||");
    assignmentByTeamRoutePlan.set(assignmentKey, assignment);
  }

  const assignmentsWithMissing = assignments.slice();
  const teamRoutePairs = new Set(assignments.map((row) => `${row.teamid}||${row.ruta}`));
  for (const teamRoute of teamRoutePairs) {
    const [teamId, ruta] = teamRoute.split("||");
    const teamProducts = ruleProductsByTeam.get(teamId) ?? [];
    for (const product of teamProducts) {
      const assignmentKey = [teamId, ruta, normalizeKey(product.planTypeName ?? ""), normalizeKey(product.productName)].join("||");
      if (assignmentByTeamRoutePlan.has(assignmentKey)) continue;
      const meta =
        ruleMetaByTeamProduct.get(buildRuleMetaKey(teamId, product.planTypeName, product.productName)) ??
        ruleMetaByTeamProduct.get(buildRuleMetaKey(teamId, null, product.productName));
      assignmentsWithMissing.push({
        ruta,
        teamid: teamId,
        plan: product.productName,
        plan_type_name: product.planTypeName ?? meta?.planTypeName ?? null,
        brick: null,
        molecula_producto: null,
        objetivo: 0,
        valor: 0,
        resultado: 0,
      });
    }
  }

  const transformedRows: WorkingRow[] = assignmentsWithMissing.map((row) => {
    const meta =
      ruleMetaByTeamProduct.get(buildRuleMetaKey(row.teamid, row.plan_type_name, row.plan)) ??
      ruleMetaByTeamProduct.get(buildRuleMetaKey(row.teamid, null, row.plan));
    let objetivo = toNumber(row.objetivo);
    let resultado = toNumber(row.resultado);
    if (meta?.calcularEnValores && meta.precioPromedio > 0) {
      objetivo = round6(objetivo * meta.precioPromedio);
      resultado = round6(resultado * meta.precioPromedio);
    }
    return {
      teamId: row.teamid,
      planTypeName: row.plan_type_name,
      productName: row.plan,
      sourceProductKey: normalizeKey(row.plan),
      prodWeight: meta?.prodWeight ?? 0,
      agrupador: meta?.agrupador ?? null,
      elemento: meta?.elemento ?? null,
      ruta: row.ruta,
      brick: row.brick ?? null,
      molecula: row.molecula_producto ?? null,
      actual: toNumber(row.valor),
      resultado,
      objetivo,
      coverage: computeCoverage(objetivo, resultado),
      curvaPagoId: meta?.curvaPagoId ?? null,
      calcularEnValores: meta?.calcularEnValores === true,
      precioPromedio: meta?.precioPromedio ?? 0,
    };
  });

  const groupedRows = new Map<string, GroupAccumulator>();
  const groupingDetails: ResultadoV2GroupingDetailRow[] = [];
  for (const row of transformedRows) {
    const shouldGroup = row.calcularEnValores && Boolean(row.agrupador) && row.productName !== row.agrupador;
    const key = shouldGroup
      ? [row.ruta, row.teamId, row.planTypeName ?? "", row.agrupador].join("||")
      : [row.ruta, row.teamId, row.planTypeName ?? "", row.productName].join("||");
    const finalProductName = shouldGroup ? (row.agrupador ?? row.productName) : row.productName;
    if (row.calcularEnValores) {
      const precioPromedio = toNumber(row.precioPromedio);
      const objetivoUnidades = precioPromedio > 0 ? round6(row.objetivo / precioPromedio) : 0;
      const resultadoUnidades = precioPromedio > 0 ? round6(row.resultado / precioPromedio) : 0;
      groupingDetails.push({
        ruta: row.ruta,
        team_id: row.teamId,
        plan_type_name: row.planTypeName,
        agrupador: row.agrupador,
        product_name_origen: row.productName,
        product_name_final: finalProductName,
        calcular_en_valores: row.calcularEnValores,
        fue_agrupado: shouldGroup,
        brick: row.brick,
        molecula: row.molecula,
        precio_promedio: round6(precioPromedio),
        prod_weight: row.prodWeight,
        objetivo_unidades: objetivoUnidades,
        resultado_unidades: resultadoUnidades,
        objetivo_dinero: row.objetivo,
        resultado_dinero: row.resultado,
        actual_dinero: row.actual,
        cobertura: row.coverage,
      });
    }

    const current = groupedRows.get(key);
    if (!current) {
      const initialWeightByProduct = new Map<string, number>();
      initialWeightByProduct.set(row.sourceProductKey, row.prodWeight);
      groupedRows.set(key, {
        ...row,
        productName: finalProductName,
        prodWeight: row.prodWeight,
        weightByProduct: initialWeightByProduct,
      });
      continue;
    }

    if (!current.weightByProduct.has(row.sourceProductKey)) {
      current.weightByProduct.set(row.sourceProductKey, row.prodWeight);
      current.prodWeight = round6(current.prodWeight + row.prodWeight);
    }
    current.objetivo = round6(current.objetivo + row.objetivo);
    current.actual = round6(current.actual + row.actual);
    current.resultado = round6(current.resultado + row.resultado);
    current.coverage = computeCoverage(current.objetivo, current.resultado);
    if (!current.curvaPagoId && row.curvaPagoId) current.curvaPagoId = row.curvaPagoId;
    current.calcularEnValores = current.calcularEnValores || row.calcularEnValores;
  }

  const finalRows: ResultadoV2PreviewRow[] = [];
  let garantiasAplicadas = 0;

  for (const row of groupedRows.values()) {
    const status = statusByRoute.get(row.ruta);
    const baseIncentivos = toNumber(status?.base_incentivos);
    const pagoVariable = round6(row.prodWeight * baseIncentivos);
    const coberturaPago = resolveCoberturaPago(row.coverage, row.curvaPagoId, pointsByCurveId);
    let pagoResultado = round6(coberturaPago * pagoVariable);
    let garantia = false;

    const linea = String(status?.linea_principal ?? "").trim();
    const route = row.ruta;
    for (const guarantee of guarantees) {
      const scopeValue = String(guarantee.scope_value ?? "").trim();
      if (!scopeValue) continue;
      let scopeMatch = false;
      if (guarantee.scope_type === "team_id") scopeMatch = normalizeKey(scopeValue) === normalizeKey(row.teamId);
      if (guarantee.scope_type === "linea") scopeMatch = normalizeKey(scopeValue) === normalizeKey(linea);
      if (guarantee.scope_type === "representante") scopeMatch = normalizeKey(scopeValue) === normalizeKey(route);
      if (!scopeMatch) continue;

      if (guarantee.rule_scope === "single_rule") {
        const ruleKey = String(guarantee.rule_key ?? "").trim();
        if (!ruleKey || normalizeKey(ruleKey) !== normalizeKey(row.productName)) continue;
      }

      garantia = true;
      pagoResultado = pagoVariable;
      garantiasAplicadas += 1;
      break;
    }

    const managerTerritory = String(status?.territorio_padre ?? "").trim() || null;
    const manager = managerTerritory;
    finalRows.push({
      team_id: row.teamId,
      plan_type_name: row.planTypeName,
      product_name: row.productName,
      prod_weight: row.prodWeight,
      agrupador: row.agrupador,
      garantia,
      elemento: row.elemento,
      ruta: row.ruta,
      representante: row.ruta,
      actual: row.actual,
      resultado: row.resultado,
      objetivo: row.objetivo,
      cobertura: row.coverage,
      pagovariable: pagoVariable,
      coberturapago: coberturaPago,
      nombre: status?.nombre_completo ?? null,
      linea: status?.linea_principal ?? null,
      manager,
      empleado: status?.no_empleado ?? null,
      pagoresultado: pagoResultado,
      periodo: periodMonth.slice(0, 7),
      curva_pago: row.curvaPagoId ? (curveNameById.get(row.curvaPagoId) ?? row.curvaPagoId) : null,
      brick: row.brick,
      molecula: row.molecula,
      calcular_en_valores: row.calcularEnValores,
    });
  }

  finalRows.sort((a, b) => {
    if (a.team_id !== b.team_id) return a.team_id.localeCompare(b.team_id, "es");
    if (a.ruta !== b.ruta) return a.ruta.localeCompare(b.ruta, "es");
    const weightDiff = toNumber(b.prod_weight) - toNumber(a.prod_weight);
    if (Math.abs(weightDiff) > 0.000001) return weightDiff > 0 ? 1 : -1;
    if (a.product_name !== b.product_name) return a.product_name.localeCompare(b.product_name, "es");
    return String(a.plan_type_name ?? "").localeCompare(String(b.plan_type_name ?? ""), "es");
  });

  return {
    periodMonth,
    rows: finalRows,
    groupingDetails,
    summary: {
      assignmentsCount: assignments.length,
      rowsCount: finalRows.length,
      totalObjetivo: round6(finalRows.reduce((sum, row) => sum + toNumber(row.objetivo), 0)),
      totalResultado: round6(finalRows.reduce((sum, row) => sum + toNumber(row.resultado), 0)),
      totalPagoVariable: round6(finalRows.reduce((sum, row) => sum + toNumber(row.pagovariable), 0)),
      totalPagoResultado: round6(finalRows.reduce((sum, row) => sum + toNumber(row.pagoresultado), 0)),
      garantiasAplicadas,
    },
  };
}
