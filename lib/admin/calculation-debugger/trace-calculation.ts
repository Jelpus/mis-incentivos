import { buildResultadosV2Preview } from "@/lib/admin/calculo/build-resultados-v2-preview";
import { runCalculoProcess } from "@/lib/admin/calculo/run-calculo-process";
import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";
import { normalizePeriodMonthInput, normalizeSourceFileCode } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CalculationDebuggerTraceData, CalculationDiagnosis } from "@/lib/admin/calculation-debugger/types";

type TraceInput = {
  period: string;
  representativeName: string;
  product: string;
  metric?: string | null;
  expectedValue: number;
  actualValue: number;
  description: string;
};

type StatusRow = {
  no_empleado: number | string | null;
  nombre_completo: string | null;
  territorio_individual: string | null;
  team_id: string | null;
  linea_principal: string | null;
  base_incentivos: number | string | null;
  territorio_padre: string | null;
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
  rule_order: number | null;
  product_name: string | null;
  plan_type_name: string | null;
  candado: string | null;
  cobertura_candado: number | string | null;
  distribucion_no_asignada: boolean | null;
  prod_weight: number | string | null;
  agrupador: string | null;
  curva_pago: string | null;
  elemento: string | null;
  calcular_en_valores?: boolean | null;
  precio_promedio?: number | string | null;
};

type RuleSourceRow = {
  item_id: number | null;
  source_order: number | null;
  file_code: string | null;
  file_display: string | null;
  fuente: string | null;
  metric: string | null;
  molecula_producto: string | null;
};

type SourceFileMetadataRow = {
  id: string | null;
  period_month: string | null;
  file_code: string | null;
  display_name: string | null;
  original_file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  size_bytes: number | string | null;
  uploaded_at: string | null;
};

type ObjectiveVersionRow = {
  id: string | null;
  version_no: number | null;
  source_file_name?: string | null;
  summary?: Record<string, unknown> | null;
};

type ObjectiveRow = {
  territorio_individual: string | null;
  team_id: string | null;
  product_name: string | null;
  plan_type_name: string | null;
  target: number | string | null;
  brick: string | null;
  cuenta: string | null;
  metodo?: string | null;
  sales_credity?: number | string | null;
  source_row_number?: number | null;
};

type AdjustmentRow = {
  adjustment_id: string | null;
  ruta: string | null;
  product_name: string | null;
  stage: string | null;
  kind: string | null;
  delta_pagoresultado: number | null;
  comment: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

type NormalizedSourceBQRow = {
  archivo: string | null;
  institucion: string | null;
  brick: string | null;
  estado: string | null;
  codigo_estado: string | null;
  molecula_producto: string | null;
  metric: string | null;
  fuente: string | null;
  ytd: string | number | null;
  valor: number | string | null;
  periodo: string | null;
};

type PayCurveRow = {
  id: string | null;
  curve_code?: string | null;
  curve_name: string | null;
};

type PayCurvePointRow = {
  curve_id: string | null;
  cobertura: number | string | null;
  pago: number | string | null;
};

type GuaranteeRow = {
  scope_type: string | null;
  scope_value: string | null;
  rule_scope: string | null;
  rule_key: string | null;
  target_coverage: number | string | null;
  guarantee_payment_preference: string | null;
  guarantee_start_month: string | null;
  guarantee_end_month: string | null;
  is_active: boolean | null;
};

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildNormalizedHeaderMap(headers: string[]): Map<string, string> {
  const output = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    if (!output.has(normalized)) output.set(normalized, header);
  }
  return output;
}

function resolveHeader(headerMap: Map<string, string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const found = headerMap.get(normalizeHeader(candidate));
    if (found) return found;
  }
  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function nearlyEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

function explainClosestValue(params: {
  actualValue: number;
  expectedValue: number;
  calculatedValue: number;
  assignmentValorTotal: number;
  assignmentResultadoTotal: number;
  objectiveTotal: number;
  finalActualTotal: number;
  finalPagoResultado: number;
  finalPagoVariable: number;
  activeOverrideDelta: number;
}): { suspectedCause: string; recommendedFix: string; confidenceScore: number; evidence: string } | null {
  const comparisons = [
    {
      label: "valor antes de Sales Credity",
      value: params.assignmentValorTotal,
      cause:
        "La diferencia parece venir de comparar el Valor bruto contra el Resultado calculado. El Resultado se obtiene aplicando Sales Credity/peso al Valor.",
      fix:
        "Validar si el numero reportado corresponde a Valor o Resultado. Si esperaban Resultado, revisar sales_credity en cuotas/drill down.",
      confidence: 0.86,
    },
    {
      label: "resultado despues de Sales Credity",
      value: params.assignmentResultadoTotal,
      cause:
        "El valor reconstruido de Resultado coincide con la asignacion. La diferencia parece venir de una expectativa o metrica distinta.",
      fix:
        "Confirmar que estan comparando contra Resultado y no contra Valor, Objetivo, Actual o Pago.",
      confidence: 0.76,
    },
    {
      label: "objetivo",
      value: params.objectiveTotal,
      cause:
        "El valor reportado se parece mas al Objetivo que al Resultado. Puede haber confusion entre cuota/objetivo y resultado calculado.",
      fix:
        "Confirmar la metrica solicitada. Si el objetivo esta mal, corregir el archivo de cuotas.",
      confidence: 0.74,
    },
    {
      label: "actual final",
      value: params.finalActualTotal,
      cause:
        "El valor reportado se parece al Actual final, no al Resultado. La diferencia puede ser por comparar columnas distintas.",
      fix:
        "Validar si el usuario esta leyendo Actual en lugar de Resultado.",
      confidence: 0.72,
    },
    {
      label: "pago resultado",
      value: params.finalPagoResultado,
      cause:
        "El valor reportado se parece al Pago Resultado, no al Resultado operativo. La diferencia puede ser por comparar pago contra resultado.",
      fix:
        "Confirmar si el caso debe investigarse como resultado, cobertura o pago.",
      confidence: 0.72,
    },
    {
      label: "pago variable",
      value: params.finalPagoVariable,
      cause:
        "El valor reportado se parece al Pago Variable antes de cobertura pago.",
      fix:
        "Revisar si estan comparando pago variable contra pago resultado.",
      confidence: 0.68,
    },
  ];

  for (const comparison of comparisons) {
    if (nearlyEqual(params.actualValue, comparison.value) || nearlyEqual(params.expectedValue, comparison.value)) {
      return {
        suspectedCause: comparison.cause,
        recommendedFix: comparison.fix,
        confidenceScore: comparison.confidence,
        evidence: `${comparison.label}: ${comparison.value.toFixed(2)}.`,
      };
    }
  }

  if (params.activeOverrideDelta !== 0 && nearlyEqual(params.calculatedValue + params.activeOverrideDelta, params.actualValue)) {
    return {
      suspectedCause:
        "La diferencia se explica por un override activo: el valor base mas el ajuste coincide con el valor reportado.",
      recommendedFix:
        "Revisar resultados_v2_ajustes. Si el override no corresponde, corregirlo o desactivarlo.",
      confidenceScore: 0.9,
      evidence: `calculado ${params.calculatedValue.toFixed(2)} + override ${params.activeOverrideDelta.toFixed(2)} = ${(params.calculatedValue + params.activeOverrideDelta).toFixed(2)}.`,
    };
  }

  return null;
}

function describeObjectiveBlock(value: unknown): string {
  const normalized = normalizeKey(value);
  if (normalized === "PRIVATE") return "cuotas privadas";
  if (normalized.includes("CUENTA")) return "drill down cuentas";
  if (normalized.includes("ESTADO")) return "drill down estados";
  return normalized ? normalized.toLowerCase() : "sin clasificar";
}

function hasCuentaEstadoConflict(objectives: ObjectiveRow[]): boolean {
  return objectives.some((objective) => {
    const metodo = normalizeKey(objective.metodo || objective.plan_type_name);
    const brick = String(objective.brick ?? "").trim();
    const cuenta = normalizeKey(objective.cuenta);
    return metodo.includes("CUENTA") && /^\d{1,3}$/.test(brick) && cuenta.length > 0;
  });
}

function buildObjectiveDuplicateEvidence(objectives: ObjectiveRow[]): Array<Record<string, unknown>> {
  const grouped = new Map<string, { count: number; targetTotal: number; rows: ObjectiveRow[] }>();
  for (const objective of objectives) {
    const key = [
      normalizeKey(objective.territorio_individual),
      normalizeKey(objective.product_name),
      normalizeKey(objective.plan_type_name ?? objective.metodo),
      normalizeKey(objective.brick),
      normalizeKey(objective.cuenta),
    ].join("||");
    const current = grouped.get(key) ?? { count: 0, targetTotal: 0, rows: [] };
    current.count += 1;
    current.targetTotal = round6(current.targetTotal + toNumber(objective.target));
    current.rows.push(objective);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .filter(([, value]) => value.count > 1)
    .slice(0, 10)
    .map(([key, value]) => ({
      key,
      count: value.count,
      targetTotal: value.targetTotal,
      sample: value.rows.slice(0, 3),
    }));
}

function periodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

function publicRecord<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

type RequiredHeaderGroup = {
  label: string;
  candidates: string[];
};

function getRequiredHeaderGroupsForSourceFile(fileLogicKey: string): RequiredHeaderGroup[] {
  if (fileLogicKey.includes("asignac")) {
    return [
      { label: "producto/product_name/product", candidates: ["producto", "product_name", "product"] },
      { label: "ruta", candidates: ["ruta"] },
      { label: "unidades", candidates: ["unidades"] },
    ];
  }

  if (fileLogicKey === "b2b_base") {
    return [
      { label: "producto/molecula_producto", candidates: ["producto", "molecula_producto"] },
      { label: "brick", candidates: ["brick"] },
      { label: "unidades", candidates: ["unidades"] },
    ];
  }

  if (fileLogicKey.includes("ddd")) {
    return [
      { label: "product_id/product/producto", candidates: ["product_id", "product", "producto"] },
      { label: "brick", candidates: ["brick"] },
      { label: "ytd/YTD", candidates: ["ytd"] },
    ];
  }

  if (fileLogicKey.includes("diario")) {
    return [
      { label: "material", candidates: ["material"] },
      { label: "billed_quantity", candidates: ["billed_quantity"] },
    ];
  }

  if (fileLogicKey.includes("iqvia")) {
    return [
      { label: "clue_id", candidates: ["clue_id"] },
      { label: "molecula_h", candidates: ["molecula_h"] },
      { label: "metric", candidates: ["metric"] },
      { label: "fuente_db", candidates: ["fuente_db"] },
      { label: "ytd/YTD", candidates: ["ytd"] },
    ];
  }

  if (fileLogicKey.includes("contacto")) {
    return [
      { label: "sku_number", candidates: ["sku_number"] },
      { label: "quantity", candidates: ["quantity"] },
      { label: "hcp_full_name", candidates: ["hcp_full_name"] },
    ];
  }

  return [];
}

function uniqueNonEmpty(values: unknown[], limit = 20): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const key = normalizeKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(raw);
    if (output.length >= limit) break;
  }
  return output;
}

async function auditSourceFiles(params: {
  supabase: NonNullable<ReturnType<typeof createAdminClient>>;
  periodMonth: string;
  ruleSources: RuleSourceRow[];
  fileHints?: Array<{ fileCode?: string | null; fileDisplay?: string | null; source?: string }>;
}): Promise<Array<Record<string, unknown>>> {
  const sourcesByFileCode = new Map<string, RuleSourceRow[]>();
  for (const source of params.ruleSources) {
    const fileCode = normalizeSourceFileCode(source.file_code || source.file_display);
    if (!fileCode) continue;
    const current = sourcesByFileCode.get(fileCode) ?? [];
    current.push(source);
    sourcesByFileCode.set(fileCode, current);
  }

  for (const hint of params.fileHints ?? []) {
    const fileCode = normalizeSourceFileCode(hint.fileCode || hint.fileDisplay);
    if (!fileCode || sourcesByFileCode.has(fileCode)) continue;
    sourcesByFileCode.set(fileCode, [
      {
        item_id: null,
        source_order: null,
        file_code: hint.fileCode ?? hint.fileDisplay ?? null,
        file_display: hint.fileDisplay ?? hint.fileCode ?? null,
        fuente: null,
        metric: null,
        molecula_producto: null,
      },
    ]);
  }

  const fileCodes = Array.from(sourcesByFileCode.keys());
  if (fileCodes.length === 0) return [];

  const metadataResult = await params.supabase
    .from("team_incentive_source_files")
    .select(
      "id, period_month, file_code, display_name, original_file_name, storage_bucket, storage_path, content_type, size_bytes, uploaded_at",
    )
    .eq("period_month", params.periodMonth);

  if (metadataResult.error) {
    return fileCodes.map((fileCode) => ({
      fileCode,
      status: "error",
      issues: [`No se pudo leer team_incentive_source_files: ${metadataResult.error.message}`],
      expectedFromPayComponents: sourcesByFileCode.get(fileCode) ?? [],
    }));
  }

  const metadataByCode = new Map<string, SourceFileMetadataRow>();
  for (const row of (metadataResult.data ?? []) as SourceFileMetadataRow[]) {
    const aliases = [
      normalizeSourceFileCode(row.file_code),
      normalizeSourceFileCode(row.display_name),
      normalizeSourceFileCode(row.original_file_name),
    ].filter(Boolean);
    for (const alias of aliases) {
      if (!metadataByCode.has(alias)) metadataByCode.set(alias, row);
    }
  }

  const audits: Array<Record<string, unknown>> = [];
  for (const fileCode of fileCodes) {
    const metadata = metadataByCode.get(fileCode) ?? null;
    const expectedSources = sourcesByFileCode.get(fileCode) ?? [];
    const issues: string[] = [];

    if (!metadata) {
      audits.push({
        fileCode,
        status: "error",
        downloadUrl: `/api/admin/source-files/download?period=${encodeURIComponent(params.periodMonth)}&fileCode=${encodeURIComponent(fileCode)}`,
        issues: ["No existe metadata del archivo fuente para este periodo/file_code."],
        expectedFromPayComponents: expectedSources,
      });
      continue;
    }

    const resolvedDownloadFileCode = normalizeSourceFileCode(metadata.file_code) || fileCode;
    const downloadUrl = `/api/admin/source-files/download?period=${encodeURIComponent(params.periodMonth)}&fileCode=${encodeURIComponent(resolvedDownloadFileCode)}`;
    const storageBucket = String(metadata.storage_bucket ?? "").trim();
    const storagePath = String(metadata.storage_path ?? "").trim();
    if (!storageBucket || !storagePath) {
      audits.push({
        fileCode,
        status: "error",
        metadata,
        downloadUrl,
        issues: ["La metadata existe, pero no tiene storage_bucket/storage_path."],
        expectedFromPayComponents: expectedSources,
      });
      continue;
    }

    const downloadResult = await params.supabase.storage.from(storageBucket).download(storagePath);
    if (downloadResult.error || !downloadResult.data) {
      audits.push({
        fileCode,
        status: "error",
        metadata,
        downloadUrl,
        issues: [`No se pudo descargar el archivo desde Storage: ${downloadResult.error?.message ?? "archivo no disponible"}`],
        expectedFromPayComponents: expectedSources,
      });
      continue;
    }

    try {
      const fileBuffer = Buffer.from(await downloadResult.data.arrayBuffer());
      const { read, utils } = await import("xlsx");
      const workbook = read(fileBuffer, { type: "buffer", sheetRows: 250 });
      const sheetName = workbook.SheetNames[0] || "";
      if (!sheetName || !workbook.Sheets[sheetName]) {
        audits.push({
          fileCode,
          status: "error",
          metadata,
          downloadUrl,
          issues: ["El archivo descargado no tiene hojas legibles."],
          expectedFromPayComponents: expectedSources,
        });
        continue;
      }

      const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
      const headers = Object.keys(rows[0] ?? {});
      const headerMap = buildNormalizedHeaderMap(headers);
      const fileLogicKey = normalizeSourceFileCode(`${fileCode} ${metadata.display_name ?? ""}`);
      const requiredGroups = getRequiredHeaderGroupsForSourceFile(fileLogicKey);
      const missingRequiredHeaders = requiredGroups
        .filter((group) => group.candidates.every((candidate) => !headerMap.has(normalizeHeader(candidate))))
        .map((group) => group.label);

      if (missingRequiredHeaders.length > 0) {
        issues.push(`Faltan columnas minimas: ${missingRequiredHeaders.join(", ")}.`);
      }

      const resolvedColumns = {
        metric: resolveHeader(headerMap, ["metric", "metrica"]),
        fuente: resolveHeader(headerMap, ["fuente", "fuente_db", "source"]),
        moleculaProducto: resolveHeader(headerMap, ["molecula_producto", "molecula", "molecula_h", "producto", "product"]),
        brick: resolveHeader(headerMap, ["brick", "clue_id"]),
        valor: resolveHeader(headerMap, ["valor", "unidades", "quantity", "billed_quantity"]),
      };

      const expectedMetrics = uniqueNonEmpty(expectedSources.map((source) => source.metric));
      const expectedFuentes = uniqueNonEmpty(expectedSources.map((source) => source.fuente));
      const expectedMolecules = uniqueNonEmpty(expectedSources.map((source) => source.molecula_producto));

      if (expectedMetrics.length > 0 && !resolvedColumns.metric && fileLogicKey.includes("iqvia")) {
        issues.push(`El Pay Component espera metric (${expectedMetrics.join(", ")}), pero el archivo no trae columna metric.`);
      }
      if (expectedFuentes.length > 0 && !resolvedColumns.fuente && fileLogicKey.includes("iqvia")) {
        issues.push(`El Pay Component espera fuente (${expectedFuentes.join(", ")}), pero el archivo no trae fuente/fuente_db.`);
      }
      if (expectedMolecules.length > 0 && !resolvedColumns.moleculaProducto) {
        issues.push(`El Pay Component espera molecula_producto (${expectedMolecules.join(", ")}), pero no se detecto columna de producto/molecula.`);
      }

      const distinctValues = {
        metric: resolvedColumns.metric ? uniqueNonEmpty(rows.map((row) => row[resolvedColumns.metric as string])) : [],
        fuente: resolvedColumns.fuente ? uniqueNonEmpty(rows.map((row) => row[resolvedColumns.fuente as string])) : [],
        moleculaProducto: resolvedColumns.moleculaProducto
          ? uniqueNonEmpty(rows.map((row) => row[resolvedColumns.moleculaProducto as string]))
          : [],
      };

      const normalizedDistinctMetric = new Set(distinctValues.metric.map(normalizeKey));
      const normalizedDistinctFuente = new Set(distinctValues.fuente.map(normalizeKey));
      for (const expectedMetric of expectedMetrics) {
        if (resolvedColumns.metric && normalizedDistinctMetric.size > 0 && !normalizedDistinctMetric.has(normalizeKey(expectedMetric))) {
          issues.push(`La columna metric existe, pero no se encontro el valor esperado "${expectedMetric}" en la muestra.`);
        }
      }
      for (const expectedFuente of expectedFuentes) {
        if (resolvedColumns.fuente && normalizedDistinctFuente.size > 0 && !normalizedDistinctFuente.has(normalizeKey(expectedFuente))) {
          issues.push(`La columna fuente existe, pero no se encontro el valor esperado "${expectedFuente}" en la muestra.`);
        }
      }

      audits.push({
        fileCode,
        status: issues.length > 0 ? "warning" : "ok",
        metadata,
        downloadUrl,
        workbook: {
          sheets: workbook.SheetNames,
          inspectedSheet: sheetName,
          inspectedRows: rows.length,
          headers,
        },
        expectedFromPayComponents: expectedSources,
        requiredHeaders: requiredGroups,
        missingRequiredHeaders,
        resolvedColumns,
        distinctValues,
        issues,
      });
    } catch (error) {
      audits.push({
        fileCode,
        status: "error",
        metadata,
        downloadUrl,
        issues: [error instanceof Error ? `No se pudo abrir/evaluar el archivo: ${error.message}` : "No se pudo abrir/evaluar el archivo."],
        expectedFromPayComponents: expectedSources,
      });
    }
  }

  return audits;
}

function pickLatestRule(rows: RuleVersionRow[]): RuleVersionRow | null {
  return rows.reduce<RuleVersionRow | null>((current, row) => {
    if (!current) return row;
    const nextVersion = Number(row.version_no ?? 0);
    const currentVersion = Number(current.version_no ?? 0);
    if (nextVersion > currentVersion) return row;
    if (nextVersion === currentVersion && String(row.created_at ?? "") > String(current.created_at ?? "")) return row;
    return current;
  }, null);
}

async function fetchAdjustments(params: {
  periodMonth: string;
  route: string | null;
  product: string;
}): Promise<{ rows: Array<Record<string, unknown>>; message: string | null }> {
  if (!isBigQueryConfigured()) {
    return { rows: [], message: "BigQuery no configurado; no se revisaron overrides publicados." };
  }

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) {
    return { rows: [], message: "Falta GCP_PROJECT_ID; no se revisaron overrides publicados." };
  }

  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_ADJUSTMENTS_TABLE?.trim() || "resultados_v2_ajustes";
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  try {
    const rows = await fetchBigQueryRows<AdjustmentRow>({
      query: `
        SELECT
          adjustment_id,
          ruta,
          product_name,
          stage,
          kind,
          delta_pagoresultado,
          comment,
          is_active,
          CAST(updated_at AS STRING) AS updated_at
        FROM ${tableRef}
        WHERE periodo = @periodo
          AND (@ruta IS NULL OR ruta = @ruta)
          AND UPPER(product_name) = UPPER(@product)
        ORDER BY is_active DESC, updated_at DESC
        LIMIT 100
      `,
      parameters: [
        { name: "periodo", type: "STRING", value: periodCode(params.periodMonth) },
        { name: "ruta", type: "STRING", value: params.route },
        { name: "product", type: "STRING", value: params.product },
      ],
    });
    return { rows: rows.map((row) => publicRecord(row as unknown as Record<string, unknown>)), message: null };
  } catch (error) {
    return {
      rows: [],
      message: error instanceof Error ? error.message : "No se pudieron revisar overrides publicados.",
    };
  }
}

async function fetchIncludedSourceRows(params: {
  periodMonth: string;
  assignments: Array<Record<string, unknown>>;
}): Promise<Array<Record<string, unknown>>> {
  if (!isBigQueryConfigured() || params.assignments.length === 0) return [];
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) return [];

  const filesDataset = process.env.BQ_DATASET_ID?.trim() || "incentivos";
  const filesTable = process.env.BQ_TABLE_FILES_NORMALIZADOS?.trim() || "filesNormalizados";
  const tableRef = `\`${projectId}.${filesDataset}.${filesTable}\``;
  const period = params.periodMonth.slice(0, 7);
  const output: Array<Record<string, unknown>> = [];

  for (const assignment of params.assignments.slice(0, 25)) {
    const archivo = String(assignment.archivo ?? "").trim();
    const archivoNormalized = normalizeSourceFileCode(archivo);
    const fuente = String(assignment.fuente ?? "").trim();
    const metric = String(assignment.metric ?? "").trim();
    const molecula = String(assignment.molecula_producto ?? "").trim();
    const moleculaNormalized = normalizeKey(molecula);
    const encontrar = String(assignment.encontrar ?? "").trim();
    const brick = String(assignment.brick ?? "").trim();
    const brickCode = String(Number(brick));
    const brickNormalized = normalizeKey(brick).replace(/[^A-Z0-9]+/g, " ").trim();
    if (!archivo || !molecula) continue;

    const runRowsQuery = (findingMode: string) => fetchBigQueryRows<NormalizedSourceBQRow>({
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
        FROM ${tableRef}
        WHERE periodo = @periodo
          AND (
            UPPER(archivo) = UPPER(@archivo)
            OR REGEXP_REPLACE(LOWER(archivo), r'[^a-z0-9]+', '_') = @archivo_normalized
            OR STRPOS(REGEXP_REPLACE(LOWER(archivo), r'[^a-z0-9]+', '_'), @archivo_normalized) > 0
            OR STRPOS(@archivo_normalized, REGEXP_REPLACE(LOWER(archivo), r'[^a-z0-9]+', '_')) > 0
          )
          AND (@fuente = '' OR UPPER(fuente) = UPPER(@fuente))
          AND (@metric = '' OR UPPER(metric) = UPPER(@metric))
          AND (
            UPPER(molecula_producto) = UPPER(@molecula)
            OR STRPOS(
              REGEXP_REPLACE(UPPER(COALESCE(molecula_producto, '')), r'[^A-Z0-9]+', ' '),
              @molecula_normalized
            ) > 0
            OR STRPOS(
              @molecula_normalized,
              REGEXP_REPLACE(UPPER(COALESCE(molecula_producto, '')), r'[^A-Z0-9]+', ' ')
            ) > 0
          )
          AND (
            @encontrar != 'estado'
            OR REGEXP_REPLACE(CAST(codigo_estado AS STRING), r'\\.0$', '') = @brick_code
            OR REGEXP_REPLACE(CAST(codigo_estado AS STRING), r'\\.0$', '') = @brick
            OR UPPER(estado) = UPPER(@cuenta)
          )
          AND (
            @encontrar != 'brick'
            OR REGEXP_REPLACE(UPPER(COALESCE(brick, '')), r'[^A-Z0-9]+', ' ') = @brick_normalized
            OR STRPOS(
              REGEXP_REPLACE(UPPER(COALESCE(brick, '')), r'[^A-Z0-9]+', ' '),
              @brick_normalized
            ) > 0
            OR STRPOS(
              @brick_normalized,
              REGEXP_REPLACE(UPPER(COALESCE(brick, '')), r'[^A-Z0-9]+', ' ')
            ) > 0
          )
        LIMIT 200
      `,
      parameters: [
        { name: "periodo", type: "STRING", value: period },
        { name: "archivo", type: "STRING", value: archivo },
        { name: "archivo_normalized", type: "STRING", value: archivoNormalized },
        { name: "fuente", type: "STRING", value: fuente },
        { name: "metric", type: "STRING", value: metric },
        { name: "molecula", type: "STRING", value: molecula },
        { name: "molecula_normalized", type: "STRING", value: moleculaNormalized },
        { name: "encontrar", type: "STRING", value: findingMode },
        { name: "brick", type: "STRING", value: brick },
        { name: "brick_normalized", type: "STRING", value: brickNormalized },
        { name: "brick_code", type: "STRING", value: Number.isFinite(Number(brick)) ? brickCode : brick },
        { name: "cuenta", type: "STRING", value: String(assignment.cuenta ?? "").trim() },
      ],
    }).catch(() => []);

    let rows = await runRowsQuery(encontrar);
    let sourceLookupMode = encontrar;
    if (rows.length === 0 && /^\d{1,3}$/.test(brick)) {
      const fallbackRows = await runRowsQuery("estado");
      if (fallbackRows.length > 0) {
        rows = fallbackRows;
        sourceLookupMode = "estado_fallback";
      }
    }

    const totalYtd = round6(rows.reduce((sum, row) => {
      const ytd = toNumber(row.ytd);
      return sum + (ytd !== 0 ? ytd : toNumber(row.valor));
    }, 0));
    const assignmentValor = toNumber(assignment.valor);

    output.push({
      assignmentKey: [
        assignment.archivo,
        assignment.fuente,
        assignment.metric,
        assignment.molecula_producto,
        assignment.brick,
        assignment.cuenta,
      ].join(" | "),
      sourceLookupMode,
      assignmentValor,
      normalizedRows: rows.length,
      normalizedTotal: totalYtd,
      differenceVsAssignment: round6(totalYtd - assignmentValor),
      rows: rows.map((row) => ({
        ...row,
        effective_value: (() => {
          const ytd = toNumber(row.ytd);
          return ytd !== 0 ? ytd : toNumber(row.valor);
        })(),
      })),
    });
  }

  return output;
}

export async function traceCalculation(input: TraceInput): Promise<CalculationDiagnosis> {
  const periodMonth = normalizePeriodMonthInput(input.period);
  if (!periodMonth) {
    throw new Error("Periodo invalido.");
  }

  const representativeInput = String(input.representativeName ?? "").trim();
  const productInput = String(input.product ?? "").trim();
  const expectedValue = toNumber(input.expectedValue);
  const actualValue = toNumber(input.actualValue);
  const difference = round6(actualValue - expectedValue);

  if (!representativeInput) throw new Error("Falta representante o territorio.");
  if (!productInput) throw new Error("Falta producto.");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client no disponible.");

  const statusResult = await supabase
    .from("sales_force_status")
    .select(
      "no_empleado, nombre_completo, territorio_individual, team_id, linea_principal, base_incentivos, territorio_padre",
    )
    .eq("period_month", periodMonth)
    .eq("is_deleted", false)
    .eq("is_active", true);

  if (statusResult.error) {
    throw new Error(`No se pudo leer sales_force_status: ${statusResult.error.message}`);
  }

  const statusRows = (statusResult.data ?? []) as StatusRow[];
  const representative =
    statusRows.find((row) => normalizeKey(row.territorio_individual) === normalizeKey(representativeInput)) ??
    statusRows.find((row) => normalizeKey(row.nombre_completo) === normalizeKey(representativeInput)) ??
    statusRows.find((row) => normalizeKey(`${row.territorio_individual ?? ""} - ${row.nombre_completo ?? ""}`) === normalizeKey(representativeInput)) ??
    null;

  const route = String(representative?.territorio_individual ?? "").trim() || null;
  const teamId = String(representative?.team_id ?? "").trim() || null;
  const checks: CalculationDebuggerTraceData["checks"] = [];

  if (!representative) {
    checks.push({
      step: "representante",
      status: "error",
      message: "No se encontro representante activo para el periodo.",
      evidence: { representativeInput, periodMonth },
    });
  } else {
    checks.push({
      step: "representante",
      status: "ok",
      message: "Representante localizado en sales_force_status.",
      evidence: { route, teamId, nombre_completo: representative.nombre_completo },
    });
  }

  let ruleVersion: RuleVersionRow | null = null;
  let ruleItems: RuleItemRow[] = [];
  let ruleSources: RuleSourceRow[] = [];
  let sourceFiles: Array<Record<string, unknown>> = [];
  let payCurves: Array<Record<string, unknown>> = [];
  if (teamId) {
    const versionResult = await supabase
      .from("team_incentive_rule_versions")
      .select("team_id, version_no, created_at, rule_definition_id")
      .eq("period_month", periodMonth)
      .eq("team_id", teamId);

    if (versionResult.error) {
      checks.push({ step: "pay_components", status: "error", message: versionResult.error.message });
    } else {
      ruleVersion = pickLatestRule((versionResult.data ?? []) as RuleVersionRow[]);
      if (!ruleVersion?.rule_definition_id) {
        checks.push({
          step: "pay_components",
          status: "warning",
          message: "No se encontro version de reglas para el team_id del representante.",
          evidence: { teamId },
        });
      } else {
        const itemSelect =
          "id, definition_id, rule_order, product_name, plan_type_name, candado, cobertura_candado, distribucion_no_asignada, prod_weight, agrupador, curva_pago, elemento, calcular_en_valores, precio_promedio";
        const itemResultWithOptional = await supabase
          .from("team_rule_definition_items")
          .select(itemSelect)
          .eq("definition_id", ruleVersion.rule_definition_id);

        let itemError = itemResultWithOptional.error;
        let itemData = (itemResultWithOptional.data ?? []) as RuleItemRow[];
        if (
          itemError &&
          (String(itemError.message).includes("calcular_en_valores") ||
            String(itemError.message).includes("precio_promedio"))
        ) {
          const itemResultWithoutOptional = await supabase
            .from("team_rule_definition_items")
            .select(
              "id, definition_id, rule_order, product_name, plan_type_name, candado, cobertura_candado, distribucion_no_asignada, prod_weight, agrupador, curva_pago, elemento",
            )
            .eq("definition_id", ruleVersion.rule_definition_id);
          itemError = itemResultWithoutOptional.error;
          itemData = (itemResultWithoutOptional.data ?? []) as RuleItemRow[];
        }

        if (itemError) {
          checks.push({ step: "pay_components", status: "error", message: itemError.message });
        } else {
          ruleItems = itemData.filter(
            (item) => normalizeKey(item.product_name) === normalizeKey(productInput),
          );
          checks.push({
            step: "pay_components",
            status: ruleItems.length > 0 ? "ok" : "warning",
            message:
              ruleItems.length > 0
                ? "Producto encontrado en team_rule_definition_items."
                : "El producto no aparece en los pay components del team_id.",
            evidence: { productInput, teamId, ruleItems: ruleItems.length },
          });

          const itemIds = ruleItems
            .map((item) => Number(item.id ?? 0))
            .filter((value) => Number.isFinite(value) && value > 0);
          if (itemIds.length > 0) {
            const sourcesResult = await supabase
              .from("team_rule_definition_item_sources")
              .select("item_id, source_order, file_code, file_display, fuente, metric, molecula_producto")
              .in("item_id", itemIds);
            if (sourcesResult.error) {
              checks.push({ step: "fuentes", status: "error", message: sourcesResult.error.message });
            } else {
              ruleSources = (sourcesResult.data ?? []) as RuleSourceRow[];
              checks.push({
                step: "fuentes",
                status: ruleSources.length > 0 ? "ok" : "warning",
                message:
                  ruleSources.length > 0
                    ? "Fuentes del producto localizadas."
                    : "El producto no tiene fuentes configuradas.",
                evidence: { sources: ruleSources.length },
              });
            }
          }
        }
      }
    }
  }

  if (ruleSources.length > 0) {
    sourceFiles = await auditSourceFiles({ supabase, periodMonth, ruleSources });
    const filesWithIssues = sourceFiles.filter((file) => {
      const status = String(file.status ?? "");
      return status === "warning" || status === "error";
    });
    checks.push({
      step: "archivos_fuente",
      status: filesWithIssues.length > 0 ? "warning" : "ok",
      message:
        filesWithIssues.length > 0
          ? "Se encontraron alertas en archivos fuente usados por el Pay Component."
          : "Los archivos fuente declarados fueron localizados y sus headers basicos son legibles.",
      evidence: {
        filesAudited: sourceFiles.length,
        filesWithIssues: filesWithIssues.length,
        issues: filesWithIssues.flatMap((file) =>
          Array.isArray(file.issues) ? (file.issues as unknown[]).map((issue) => String(issue)) : [],
        ),
      },
    });
  }

  const curveIds = Array.from(
    new Set(
      ruleItems
        .map((item) => String(item.curva_pago ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );
  if (curveIds.length > 0) {
    const curvesResult = await supabase
      .from("team_incentive_pay_curves")
      .select("id, curve_code, curve_name")
      .in("id", curveIds);
    const pointsResult = await supabase
      .from("team_incentive_pay_curve_points")
      .select("curve_id, cobertura, pago")
      .in("curve_id", curveIds);

    if (!curvesResult.error && !pointsResult.error) {
      const pointsByCurveId = new Map<string, PayCurvePointRow[]>();
      for (const point of (pointsResult.data ?? []) as PayCurvePointRow[]) {
        const curveId = String(point.curve_id ?? "").trim();
        if (!curveId) continue;
        const current = pointsByCurveId.get(curveId) ?? [];
        current.push(point);
        pointsByCurveId.set(curveId, current);
      }
      payCurves = ((curvesResult.data ?? []) as PayCurveRow[]).map((curve) => {
        const curveId = String(curve.id ?? "").trim();
        const points = (pointsByCurveId.get(curveId) ?? [])
          .map((point) => ({
            curve_id: point.curve_id,
            cobertura: toNumber(point.cobertura),
            pago: toNumber(point.pago),
          }))
          .sort((a, b) => a.cobertura - b.cobertura);
        return publicRecord({ ...curve, points });
      });
    }
  }

  let objectives: ObjectiveRow[] = [];
  const objectiveVersionResult = await supabase
    .from("team_objective_target_versions")
    .select("id, version_no, source_file_name, summary")
    .eq("period_month", periodMonth)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle<ObjectiveVersionRow>();

  if (objectiveVersionResult.error) {
    checks.push({ step: "objetivos", status: "error", message: objectiveVersionResult.error.message });
  } else if (objectiveVersionResult.data?.id && route) {
    const objectivesResultWithMetodo = await supabase
      .from("team_objective_targets")
      .select("territorio_individual, team_id, product_name, plan_type_name, target, brick, cuenta, metodo, sales_credity, source_row_number")
      .eq("version_id", objectiveVersionResult.data.id)
      .eq("territorio_individual", route)
      .ilike("product_name", productInput);

    let objectivesError = objectivesResultWithMetodo.error;
    let objectivesData = (objectivesResultWithMetodo.data ?? []) as ObjectiveRow[];
    if (objectivesError && String(objectivesError.message).includes("metodo")) {
      const objectivesResultWithoutMetodo = await supabase
        .from("team_objective_targets")
        .select("territorio_individual, team_id, product_name, plan_type_name, target, brick, cuenta, sales_credity, source_row_number")
        .eq("version_id", objectiveVersionResult.data.id)
        .eq("territorio_individual", route)
        .ilike("product_name", productInput);
      objectivesError = objectivesResultWithoutMetodo.error;
      objectivesData = (objectivesResultWithoutMetodo.data ?? []) as ObjectiveRow[];
    }

    if (objectivesError) {
      checks.push({ step: "objetivos", status: "error", message: objectivesError.message });
    } else {
      objectives = objectivesData;
      checks.push({
        step: "objetivos",
        status: objectives.length > 0 ? "ok" : "warning",
        message: objectives.length > 0 ? "Objetivos encontrados para ruta/producto." : "Sin objetivos para ruta/producto.",
        evidence: {
          objectiveRows: objectives.length,
          targetTotal: round6(objectives.reduce((sum, row) => sum + toNumber(row.target), 0)),
        },
      });
    }
  }

  const calculation = await runCalculoProcess(periodMonth, {
    persist: false,
    previewLimit: Number.POSITIVE_INFINITY,
  });
  const matchingAssignments = calculation.previewRows.filter((row) => {
    return normalizeKey(row.ruta) === normalizeKey(route) && normalizeKey(row.plan) === normalizeKey(productInput);
  });
  const relatedAssignments = calculation.previewRows
    .filter((row) => normalizeKey(row.ruta) === normalizeKey(route))
    .slice(0, 100);

  if (sourceFiles.length === 0) {
    const assignmentFileHints = [...matchingAssignments, ...relatedAssignments]
      .map((row) => ({
        fileCode: row.archivo,
        fileDisplay: row.archivo,
        source: "assignment_preview",
      }))
      .filter((hint) => String(hint.fileDisplay ?? "").trim().length > 0);
    if (assignmentFileHints.length > 0) {
      sourceFiles = await auditSourceFiles({
        supabase,
        periodMonth,
        ruleSources,
        fileHints: assignmentFileHints,
      });
    }
  }

  if (sourceFiles.length > 0 && !checks.some((check) => check.step === "archivos_fuente")) {
    const filesWithIssues = sourceFiles.filter((file) => {
      const status = String(file.status ?? "");
      return status === "warning" || status === "error";
    });
    checks.push({
      step: "archivos_fuente",
      status: filesWithIssues.length > 0 ? "warning" : "ok",
      message:
        filesWithIssues.length > 0
          ? "Se encontraron alertas en archivos fuente usados por la asignacion."
          : "Los archivos fuente usados por la asignacion fueron localizados y sus headers basicos son legibles.",
      evidence: {
        filesAudited: sourceFiles.length,
        filesWithIssues: filesWithIssues.length,
        issues: filesWithIssues.flatMap((file) =>
          Array.isArray(file.issues) ? (file.issues as unknown[]).map((issue) => String(issue)) : [],
        ),
      },
    });
  }

  const finalPreview = await buildResultadosV2Preview(periodMonth);
  const finalRows = finalPreview.rows.filter((row) => {
    return normalizeKey(row.ruta) === normalizeKey(route) && normalizeKey(row.product_name) === normalizeKey(productInput);
  });
  const groupingDetails = finalPreview.groupingDetails.filter((row) => {
    return (
      normalizeKey(row.ruta) === normalizeKey(route) &&
      (normalizeKey(row.product_name_origen) === normalizeKey(productInput) ||
        normalizeKey(row.product_name_final) === normalizeKey(productInput))
    );
  });
  const overrides = await fetchAdjustments({ periodMonth, route, product: productInput });
  const includedSourceRows = await fetchIncludedSourceRows({
    periodMonth,
    assignments: matchingAssignments.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
  });
  let guarantees: Array<Record<string, unknown>> = [];
  if (representative && route && teamId) {
    const line = String(representative.linea_principal ?? "").trim();
    const guaranteeResult = await supabase
      .from("team_incentive_guarantees")
      .select(
        "scope_type, scope_value, rule_scope, rule_key, target_coverage, guarantee_payment_preference, guarantee_start_month, guarantee_end_month, is_active",
      )
      .eq("is_active", true)
      .lte("guarantee_start_month", periodMonth)
      .gte("guarantee_end_month", periodMonth);

    if (!guaranteeResult.error) {
      guarantees = ((guaranteeResult.data ?? []) as GuaranteeRow[])
        .filter((guarantee) => {
          const scopeType = String(guarantee.scope_type ?? "").trim();
          const scopeValue = normalizeKey(guarantee.scope_value);
          const scopeMatches =
            (scopeType === "representante" && scopeValue === normalizeKey(route)) ||
            (scopeType === "team_id" && scopeValue === normalizeKey(teamId)) ||
            (scopeType === "linea" && scopeValue === normalizeKey(line));
          if (!scopeMatches) return false;
          if (String(guarantee.rule_scope ?? "").trim() !== "single_rule") return true;
          return normalizeKey(guarantee.rule_key) === normalizeKey(productInput);
        })
        .map((guarantee) => publicRecord(guarantee as unknown as Record<string, unknown>));
    }
  }

  checks.push({
    step: "asignacion_unidades",
    status: matchingAssignments.length > 0 ? "ok" : "warning",
    message:
      matchingAssignments.length > 0
        ? "El preview de asignacion contiene filas para ruta/producto."
        : "El preview no genero filas para ruta/producto.",
    evidence: {
      matchingAssignments: matchingAssignments.length,
      exactMatches: matchingAssignments.filter((row) => row.match_mode === "exact").length,
      fuzzyMatches: matchingAssignments.filter((row) => row.match_mode === "fuzzy").length,
      noneMatches: matchingAssignments.filter((row) => row.match_mode === "none").length,
    },
  });
  checks.push({
    step: "resultado_final",
    status: finalRows.length > 0 ? "ok" : "warning",
    message:
      finalRows.length > 0
        ? "El preview de resultados_v2 contiene resultado final para ruta/producto."
        : "No se encontro resultado final para ruta/producto.",
    evidence: {
      finalRows: finalRows.length,
      pagoresultado: round6(finalRows.reduce((sum, row) => sum + toNumber(row.pagoresultado), 0)),
      resultado: round6(finalRows.reduce((sum, row) => sum + toNumber(row.resultado), 0)),
      objetivo: round6(finalRows.reduce((sum, row) => sum + toNumber(row.objetivo), 0)),
    },
  });
  checks.push({
    step: "overrides",
    status: overrides.rows.some((row) => row.is_active !== false) ? "warning" : "ok",
    message:
      overrides.rows.length > 0
        ? "Se encontraron overrides/ajustes publicados para el producto."
        : "No se encontraron overrides publicados para el producto.",
    evidence: { rows: overrides.rows.length, message: overrides.message },
  });

  const finalPagoResultado = round6(finalRows.reduce((sum, row) => sum + toNumber(row.pagoresultado), 0));
  const finalResultado = round6(finalRows.reduce((sum, row) => sum + toNumber(row.resultado), 0));
  const finalActualTotal = round6(finalRows.reduce((sum, row) => sum + toNumber(row.actual), 0));
  const finalPagoVariable = round6(finalRows.reduce((sum, row) => sum + toNumber(row.pagovariable), 0));
  const metricKey = normalizeKey(input.metric);
  const calculatedValue = metricKey.includes("PAGO") ? finalPagoResultado : finalResultado;
  const calculatedDelta = round6(calculatedValue - actualValue);
  const activeOverrides = overrides.rows.filter((row) => row.is_active !== false);
  const activeOverrideDelta = round6(activeOverrides.reduce((sum, row) => sum + toNumber(row.delta_pagoresultado), 0));
  const objectiveDuplicateEvidence = buildObjectiveDuplicateEvidence(objectives);
  const cuentaEstadoConflict = hasCuentaEstadoConflict(objectives);
  const objectiveTotal = round6(objectives.reduce((sum, row) => sum + toNumber(row.target), 0));
  const assignmentValorTotal = round6(matchingAssignments.reduce((sum, row) => sum + toNumber(row.valor), 0));
  const assignmentResultadoTotal = round6(matchingAssignments.reduce((sum, row) => sum + toNumber(row.resultado), 0));
  const assignmentBlocks = Array.from(
    new Set(matchingAssignments.map((row) => String(row.objective_block ?? "").trim()).filter(Boolean)),
  );
  const noneAssignments = matchingAssignments.filter((row) => row.match_mode === "none");
  const exactAssignments = matchingAssignments.filter((row) => row.match_mode === "exact");
  const fuzzyAssignments = matchingAssignments.filter((row) => row.match_mode === "fuzzy");
  const payComponentLooksOk = ruleItems.length > 0 && ruleSources.length > 0;
  const sourceFileIssues = sourceFiles.filter((file) => {
    const status = String(file.status ?? "");
    return status === "warning" || status === "error";
  });
  const sourceFilesLookOk = ruleSources.length === 0 || sourceFileIssues.length === 0;
  const normalizedMismatches = includedSourceRows.filter((row) => Math.abs(toNumber(row.differenceVsAssignment)) > 0.01);
  const normalizedEvidence = includedSourceRows
    .map((row) => `${row.assignmentKey}: normalizado=${toNumber(row.normalizedTotal).toFixed(2)} vs asignacion=${toNumber(row.assignmentValor).toFixed(2)}`)
    .slice(0, 5);
  const drillDownLooksOk =
    assignmentBlocks.length === 0 ||
    !assignmentBlocks.some((block) => block.includes("drilldown")) ||
    noneAssignments.length === 0;
  const territorialLooksSuspicious =
    representative !== null &&
    (matchingAssignments.length === 0 || noneAssignments.length > 0 || objectiveDuplicateEvidence.length > 0);

  let suspectedCause = "El problema parece venir de una carga incompleta o inconsistente antes del resultado final.";
  let recommendedFix = "Corregir la data de entrada que alimenta el calculo y volver a ejecutar el flujo del periodo.";
  let confidenceScore = 0.45;
  let specificEvidence: string | null = null;
  const numericExplanation = explainClosestValue({
    actualValue,
    expectedValue,
    calculatedValue,
    assignmentValorTotal,
    assignmentResultadoTotal,
    objectiveTotal,
    finalActualTotal,
    finalPagoResultado,
    finalPagoVariable,
    activeOverrideDelta,
  });

  if (!representative) {
    suspectedCause = "El problema parece venir de sales_force_status: el representante o territorio no existe activo para el periodo.";
    recommendedFix = "Corregir la carga de sales_force_status para ese periodo antes de recalcular.";
    confidenceScore = 0.9;
  } else if (ruleItems.length === 0) {
    suspectedCause = "El problema parece venir de configuracion incompleta: el producto no esta cargado en los Pay Components del team_id.";
    recommendedFix = "Corregir team_rule_definition_items para el team_id/periodo y despues recalcular.";
    confidenceScore = 0.82;
  } else if (ruleSources.length === 0) {
    suspectedCause = "El Pay Component existe, pero esta incompleto: no tiene fuentes/metricas para reconstruir el valor.";
    recommendedFix = "Completar team_rule_definition_item_sources para el producto y recalcular.";
    confidenceScore = 0.8;
  } else if (matchingAssignments.length === 0 && sourceFileIssues.length > 0) {
    suspectedCause = "El problema parece venir del archivo fuente cargado: hay columnas faltantes, mal nombradas o valores esperados que no aparecen en la muestra.";
    recommendedFix = "Corregir el archivo en team_incentive_source_files, respetando los nombres de columnas esperados, reprocesarlo y recalcular.";
    confidenceScore = 0.88;
  } else if (objectives.length === 0) {
    suspectedCause = "Esto no es un error del Pay Component: falta la cuota/objetivo para la combinacion ruta/producto.";
    recommendedFix = "Corregir el archivo de cuotas u objetivos para esa ruta/producto y volver a cargar el periodo.";
    confidenceScore = 0.84;
  } else if (objectiveDuplicateEvidence.length > 0) {
    suspectedCause = "La diferencia se genera antes del calculo final: hay cuotas duplicadas para la misma ruta/producto/brick/cuenta.";
    recommendedFix = "Corregir el archivo de cuotas eliminando o consolidando los registros duplicados y recalcular.";
    confidenceScore = 0.86;
  } else if (cuentaEstadoConflict && assignmentValorTotal > objectiveTotal * 2) {
    suspectedCause = "La cuota esta marcada como CUENTAS pero usa un codigo de estado numerico. Esto hizo que el calculo anterior buscara bricks que contenian ese numero en lugar de filtrar codigo_estado.";
    recommendedFix = "Tratar esta cuota como Estado o corregir el metodo en el archivo de cuotas. El calculo fue ajustado para inferir Estado cuando brick es numerico.";
    confidenceScore = 0.9;
  } else if (noneAssignments.length > 0) {
    suspectedCause = "La diferencia se genera antes, en la etapa de asignacion territorial: hay objetivos sin match contra la data original.";
    recommendedFix = "Corregir cuotas/drill down: validar brick, cuenta, estado, fuente, metrica, molecula y sales_credity usados para esa ruta.";
    confidenceScore = 0.78;
  } else if (normalizedMismatches.length > 0) {
    suspectedCause = "La asignacion no cuadra contra las filas normalizadas consultadas. Esto puede ser un problema nuestro: normalizacion/BigQuery desactualizado, duplicado o filtro distinto al archivo descargado.";
    recommendedFix = "Comparar filas normalizadas contra el Excel descargado. Si el Excel correcto suma distinto, reprocesar el archivo fuente y revisar la logica de filtro por estado/brick.";
    confidenceScore = 0.82;
  } else if (numericExplanation && Math.abs(calculatedDelta) > 0.000001) {
    suspectedCause = numericExplanation.suspectedCause;
    recommendedFix = numericExplanation.recommendedFix;
    confidenceScore = numericExplanation.confidenceScore;
    specificEvidence = numericExplanation.evidence;
  } else if (activeOverrides.length > 0) {
    suspectedCause = "La diferencia puede venir de un override activo aplicado despues del calculo base.";
    recommendedFix = "Validar resultados_v2_ajustes: si el ajuste no corresponde, desactivarlo o corregir su delta.";
    confidenceScore = 0.72;
  } else if (Math.abs(calculatedDelta) > 0.000001) {
    suspectedCause = "El preview deterministico no coincide con el valor publicado/reportado; probablemente falta seguir un paso del flujo.";
    recommendedFix = "Recalcular, confirmar precalculo y publicar nuevamente el periodo; despues comparar resultados_v2 contra el preview.";
    confidenceScore = 0.68;
  } else {
    suspectedCause = "El calculo reconstruido coincide con el valor actual; la diferencia parece venir de una expectativa mal definida o de una lectura incorrecta de la metrica.";
    recommendedFix = "Validar con el equipo el valor esperado, la metrica seleccionada y la fuente usada para reportar la diferencia.";
    confidenceScore = 0.58;
  }

  const evidence = [
    payComponentLooksOk
      ? "Esto no es un error del Pay Component: el producto y sus fuentes existen para el team_id."
      : "Pay Component incompleto o ausente para el producto/team_id.",
    sourceFilesLookOk
      ? "Los archivos fuente usados por el producto fueron encontrados y pasaron la revision basica de headers."
      : "La evidencia apunta al archivo fuente: hay headers/valores esperados faltantes o el archivo no se pudo abrir.",
    drillDownLooksOk
      ? "Esto no apunta a un error del Drill Down: no hay filas drill down sin match en la evidencia actual."
      : "El Drill Down/cuotas requiere revision: hay filas sin match o datos territoriales inconsistentes.",
    territorialLooksSuspicious
      ? "La diferencia se observa antes del resultado final, en cuotas/asignacion territorial."
      : "No hay senal fuerte de falla territorial en las filas reconstruidas.",
    `Diferencia reportada actual - esperado: ${difference.toFixed(6)}.`,
    `Preview calculado para ${metricKey.includes("PAGO") ? "pagoresultado" : "resultado"}: ${calculatedValue.toFixed(6)}.`,
    `Valor bruto asignado: ${assignmentValorTotal.toFixed(6)}; Resultado despues de Sales Credity: ${assignmentResultadoTotal.toFixed(6)}.`,
    normalizedEvidence.length > 0 ? `Filas normalizadas revisadas: ${normalizedEvidence.join(" || ")}.` : "",
    specificEvidence ? `Coincidencia relevante: ${specificEvidence}` : "",
    `Filas de asignacion ruta/producto: ${matchingAssignments.length} (exact=${exactAssignments.length}, fuzzy=${fuzzyAssignments.length}, none=${noneAssignments.length}).`,
    `Filas finales resultados_v2 ruta/producto: ${finalRows.length}.`,
    `Bloques evaluados: ${assignmentBlocks.map(describeObjectiveBlock).join(", ") || "sin filas"}.`,
    `Cuotas duplicadas detectadas: ${objectiveDuplicateEvidence.length}.`,
    cuentaEstadoConflict ? "Se detecto cuota CUENTAS con brick numerico; debe tratarse como Estado." : "",
    `Archivos fuente auditados: ${sourceFiles.length}; con alertas: ${sourceFileIssues.length}.`,
    `Overrides activos encontrados: ${activeOverrides.length}.`,
  ].filter(Boolean);

  const objectiveVersion = objectiveVersionResult.data ?? null;
  const objectiveSource = objectiveVersion
    ? {
      id: objectiveVersion.id,
      versionNo: objectiveVersion.version_no,
      sourceFileName: objectiveVersion.source_file_name ?? null,
      downloads: {
        private: objectiveVersion.id
          ? `/api/admin/objetivos/versions/${encodeURIComponent(objectiveVersion.id)}/download?source=private`
          : null,
        drilldown: objectiveVersion.id
          ? `/api/admin/objetivos/versions/${encodeURIComponent(objectiveVersion.id)}/download?source=drilldown`
          : null,
      },
      summary: objectiveVersion.summary ?? null,
    }
    : null;

  const traceData: CalculationDebuggerTraceData = {
    input: {
      period: periodMonth,
      representativeName: representativeInput,
      product: productInput,
      metric: input.metric ?? null,
      expectedValue,
      actualValue,
      difference,
      description: input.description,
    },
    representative: representative ? publicRecord(representative as unknown as Record<string, unknown>) : null,
    ruleVersion: ruleVersion ? publicRecord(ruleVersion as unknown as Record<string, unknown>) : null,
    ruleItems: ruleItems.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
    ruleSources: ruleSources.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
    sourceFiles,
    objectiveSource,
    payCurves,
    guarantees,
    objectives: objectives.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
    calculationPreview: {
      summary: {
        objectiveVersionNo: calculation.objectiveVersionNo,
        sourceRowsInPeriod: calculation.sourceRowsInPeriod,
        assignmentsCount: calculation.assignmentsCount,
        productsEvaluated: calculation.productsEvaluated,
        exactMatches: calculation.exactMatches,
        fuzzyMatches: calculation.fuzzyMatches,
        totalObjetivo: calculation.totalObjetivo,
        totalValor: calculation.totalValor,
        totalResultado: calculation.totalResultado,
        finalRowsCount: finalPreview.summary.rowsCount,
        totalPagoResultado: finalPreview.summary.totalPagoResultado,
      },
      matchingAssignments: matchingAssignments.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
      includedSourceRows,
      relatedAssignments: relatedAssignments.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
      finalRows: finalRows.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
      groupingDetails: groupingDetails.map((row) => publicRecord(row as unknown as Record<string, unknown>)),
    },
    overrides,
    checks: [
      ...checks,
      {
        step: "clasificacion_operativa",
        status: territorialLooksSuspicious || activeOverrides.length > 0 ? "warning" : "ok",
        message: suspectedCause,
        evidence: {
          payComponentLooksOk,
          sourceFilesLookOk,
          drillDownLooksOk,
          sourceFileIssues,
          assignmentBlocks,
          noneAssignments: noneAssignments.length,
          objectiveDuplicates: objectiveDuplicateEvidence,
          activeOverrides: activeOverrides.length,
        },
      },
    ],
  };

  const diagnosisSummary = [
    `El problema parece venir de: ${suspectedCause}`,
    payComponentLooksOk ? "Esto no es un error del Pay Component." : "El Pay Component esta incompleto o no corresponde al team_id.",
    sourceFilesLookOk ? "El archivo fuente no muestra alertas basicas." : "La evidencia apunta al archivo fuente cargado.",
    drillDownLooksOk ? "Esto no es un error directo del Drill Down." : "El Drill Down/cuotas tiene evidencia que requiere correccion.",
    `Valor calculado de referencia: ${calculatedValue.toFixed(6)}; valor actual reportado: ${actualValue.toFixed(6)}.`,
    `La correccion sugerida es: ${recommendedFix}`,
  ].join(" ");

  return {
    diagnosisSummary,
    suspectedCause,
    recommendedFix,
    confidenceScore,
    difference,
    evidence,
    traceData,
  };
}
