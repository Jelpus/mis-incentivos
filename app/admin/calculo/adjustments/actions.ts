"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBigQueryConfigured, runBigQueryQuery } from "@/lib/integrations/bigquery";

type AdjustmentActionResult =
  | { ok: true; message: string; applied: number; invalid: number; errors: string[] }
  | { ok: false; message: string; errors?: string[] };

type AdjustmentInput = {
  ruta: string;
  productName: string;
  pagoResultadoDelta: number;
  comment: string | null;
  kind: string;
};

const EMPTY_PRODUCT_KEY = "__SIN_PRODUCTO__";

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeProductKey(value: string): string {
  const normalized = normalizeText(value);
  return normalized || EMPTY_PRODUCT_KEY;
}

function normalizeRouteKey(value: string): string {
  return normalizeText(value);
}

function normalizeRouteMatchKey(value: string): string {
  return normalizeRouteKey(value).toLowerCase().replace(/\s+/g, "");
}

function sqlStringLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlFloatLiteral(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}

function getRowValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row ?? {});
  if (entries.length === 0) return undefined;
  const targetKeys = new Set(aliases.map((alias) => normalizeHeaderKey(alias)));
  for (const [key, value] of entries) {
    if (targetKeys.has(normalizeHeaderKey(String(key)))) {
      return value;
    }
  }
  return undefined;
}

function hasAnyHeader(rowValues: unknown[], aliases: string[]): boolean {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeaderKey(alias)));
  for (const value of rowValues) {
    const normalized = normalizeHeaderKey(String(value ?? ""));
    if (aliasSet.has(normalized)) return true;
  }
  return false;
}

function isMeaningfulRow(values: unknown[]): boolean {
  return values.some((value) => normalizeText(value).length > 0);
}

function buildRowsFromMatrix(matrix: unknown[][]): {
  rows: Array<Record<string, unknown>>;
  headerIndex: number;
  headers: string[];
  score: number;
} {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { rows: [], headerIndex: -1, headers: [], score: 0 };
  }

  const rutaAliases = ["ruta", "territorio_individual", "territorio", "route", "territorioindividual"];
  const deltaAliases = [
    "pagoresultado_delta",
    "delta_pagoresultado",
    "ajuste_delta",
    "ajustedelta",
    "ajusted",
    "delta",
    "ajuste",
    "extra",
    "monto",
    "monto_ajuste",
    "montoajuste",
    "valor",
    "value",
    "pr_ajus",
    "prajus",
    "pagoresultado_ajustado",
  ];
  const productAliases = ["product_name", "producto", "product", "productname", "plan", "planname"];
  const commentAliases = ["comment", "comentario", "nota", "notes"];

  let headerIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < Math.min(matrix.length, 25); index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    if (!isMeaningfulRow(row)) continue;
    const hasRuta = hasAnyHeader(row, rutaAliases);
    const hasDelta = hasAnyHeader(row, deltaAliases);
    const hasProduct = hasAnyHeader(row, productAliases);
    const hasComment = hasAnyHeader(row, commentAliases);
    const score = Number(hasRuta) + Number(hasDelta) + Number(hasProduct) + Number(hasComment);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
    if (hasRuta && hasDelta && score >= 2) {
      headerIndex = index;
      bestScore = score;
      break;
    }
  }

  if (headerIndex < 0) {
    headerIndex = 0;
  }

  const headerRow = Array.isArray(matrix[headerIndex]) ? matrix[headerIndex] : [];
  const headers = headerRow.map((cell, colIndex) => {
    const text = normalizeText(cell);
    return text || `col_${colIndex + 1}`;
  });

  const rows: Array<Record<string, unknown>> = [];
  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const sourceRow = Array.isArray(matrix[r]) ? matrix[r] : [];
    if (!isMeaningfulRow(sourceRow)) continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = sourceRow[c] ?? "";
    }
    rows.push(obj);
  }
  return { rows, headerIndex, headers, score: Math.max(bestScore, 0) };
}

function normalizePeriodCode(periodMonth: string): string {
  return `${periodMonth.slice(0, 4)}${periodMonth.slice(5, 7)}`;
}

function toNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Keep only numeric-related characters; supports values like "$19,250.000"
  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  let normalized = cleaned;
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    const decimalSep = lastDot > lastComma ? "." : ",";
    if (decimalSep === ".") {
      normalized = cleaned.replace(/,/g, "");
    } else {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma && !hasDot) {
    normalized = cleaned.replace(",", ".");
  } else {
    normalized = cleaned;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKind(value: unknown, fallback: string): string {
  const kind = normalizeText(value).toLowerCase();
  return kind || fallback;
}

async function ensureBigQueryReady(): Promise<{
  projectId: string;
  datasetId: string;
  baseTableId: string;
  adjustmentsTableId: string;
}> {
  if (!isBigQueryConfigured()) {
    throw new Error("BigQuery no esta configurado.");
  }
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  if (!projectId) throw new Error("Falta GCP_PROJECT_ID.");
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const baseTableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const adjustmentsTableId = process.env.BQ_RESULTS_ADJUSTMENTS_TABLE?.trim() || "resultados_v2_ajustes";
  return { projectId, datasetId, baseTableId, adjustmentsTableId };
}

async function applyAdjustments(
  periodMonth: string,
  rows: AdjustmentInput[],
  actorUserId: string,
): Promise<AdjustmentActionResult> {
  if (rows.length === 0) {
    return { ok: false, message: "No hay filas validas para aplicar.", errors: [] };
  }

  const { projectId, datasetId, adjustmentsTableId } = await ensureBigQueryReady();
  const adjustmentsTableRef = `\`${projectId}.${datasetId}.${adjustmentsTableId}\``;
  const periodo = normalizePeriodCode(periodMonth);
  const fixedStage = "precalculo";
  let applied = 0;
  let invalid = 0;
  const errors: string[] = [];
  const distinctRouteKeys = Array.from(
    new Set(rows.map((row) => normalizeRouteMatchKey(row.ruta)).filter((routeKey) => routeKey.length > 0)),
  );
  if (distinctRouteKeys.length === 0) {
    return { ok: false, message: "No hay rutas validas en el archivo.", errors: [] };
  }

  const existingRoutes = new Map<string, string>();
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "No hay conexion admin para validar rutas en sales_force_status." };
  }
  const statusRoutesResult = await supabase
    .from("sales_force_status")
    .select("territorio_individual")
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (statusRoutesResult.error) {
    return { ok: false, message: `No se pudo validar rutas con sales_force_status: ${statusRoutesResult.error.message}` };
  }

  for (const row of statusRoutesResult.data ?? []) {
    const routeValue = normalizeRouteKey(String(row.territorio_individual ?? ""));
    const routeKey = normalizeRouteMatchKey(routeValue);
    if (routeKey && routeValue && !existingRoutes.has(routeKey)) {
      existingRoutes.set(routeKey, routeValue);
    }
  }
  if (existingRoutes.size === 0) {
    return {
      ok: false,
      message: `No hay rutas en sales_force_status para ${periodMonth}.`,
    };
  }

  const validRows: AdjustmentInput[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;
    const routeInput = normalizeRouteKey(row.ruta);
    const routeKey = normalizeRouteMatchKey(routeInput);
    const matchedRoute = existingRoutes.get(routeKey);
    if (!matchedRoute) {
      invalid += 1;
      if (errors.length < 25) {
        errors.push(`Fila ${rowNumber}: ruta=${row.ruta} no existe en ${periodMonth}.`);
      }
      continue;
    }
    validRows.push({
      ...row,
      ruta: matchedRoute,
      productName: normalizeText(row.productName),
    });
  }

  if (validRows.length > 0) {
    const grouped = new Map<
      string,
      { ruta: string; productName: string; kind: string; delta: number; comments: string[] }
    >();
    for (const row of validRows) {
      const ruta = normalizeRouteKey(row.ruta);
      const productName = normalizeProductKey(row.productName);
      const kind = normalizeKind(row.kind, "ajuste_batch");
      const key = `${ruta}||${productName}||${kind}`;
      const current = grouped.get(key) ?? {
        ruta,
        productName,
        kind,
        delta: 0,
        comments: [],
      };
      current.delta += row.pagoResultadoDelta;
      if (row.comment && row.comment.trim()) current.comments.push(row.comment.trim());
      grouped.set(key, current);
    }

    const sourceRows = Array.from(grouped.values());
    applied = sourceRows.length;
    const sourceSql = sourceRows
      .map((row) => {
        const comment = row.comments.join(" | ");
        return `SELECT
  ${sqlStringLiteral(periodo)} AS periodo,
  ${sqlStringLiteral(row.ruta)} AS ruta,
  ${sqlStringLiteral(row.productName)} AS product_name,
  ${sqlStringLiteral(fixedStage)} AS stage,
  ${sqlStringLiteral(row.kind)} AS kind,
  ${sqlFloatLiteral(row.delta)} AS delta,
  ${sqlStringLiteral(comment)} AS comment`;
      })
      .join("\nUNION ALL\n");

    await runBigQueryQuery({
      query: `
        MERGE ${adjustmentsTableRef} T
        USING (
          ${sourceSql}
        ) S
        ON T.periodo = S.periodo
          AND LOWER(REGEXP_REPLACE(TRIM(T.ruta), r'\\s+', '')) = LOWER(REGEXP_REPLACE(TRIM(S.ruta), r'\\s+', ''))
          AND UPPER(TRIM(T.product_name)) = UPPER(TRIM(S.product_name))
          AND T.stage = S.stage
          AND T.kind = S.kind
        WHEN MATCHED THEN
          UPDATE SET
            delta_pagoresultado = IFNULL(T.delta_pagoresultado, 0) + S.delta,
            comment = CASE
              WHEN TRIM(S.comment) = '' THEN T.comment
              WHEN T.comment IS NULL OR TRIM(T.comment) = '' THEN S.comment
              ELSE CONCAT(T.comment, ' | ', S.comment)
            END,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP(),
            updated_by = ${sqlStringLiteral(actorUserId)}
        WHEN NOT MATCHED THEN
          INSERT (
            adjustment_id,
            periodo,
            ruta,
            product_name,
            stage,
            kind,
            delta_pagoresultado,
            comment,
            is_active,
            created_at,
            created_by,
            updated_at,
            updated_by
          )
          VALUES (
            GENERATE_UUID(),
            S.periodo,
            S.ruta,
            S.product_name,
            S.stage,
            S.kind,
            S.delta,
            S.comment,
            TRUE,
            CURRENT_TIMESTAMP(),
            ${sqlStringLiteral(actorUserId)},
            CURRENT_TIMESTAMP(),
            ${sqlStringLiteral(actorUserId)}
          )
      `,
    });
  }

  revalidatePath("/admin/calculo");
  revalidatePath("/admin/calculo/adjustments");
  revalidatePath("/admin/calculo/aprobar");
  return {
    ok: true,
    message: `Ajustes guardados en tabla de ajustes. Exitosas: ${applied}. Invalidas: ${invalid}.`,
    applied,
    invalid,
    errors,
  };
}

export async function deleteManualAdjustmentAction(
  _prevState: AdjustmentActionResult | null,
  formData: FormData,
): Promise<AdjustmentActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const { projectId, datasetId, adjustmentsTableId } = await ensureBigQueryReady();
  const adjustmentsTableRef = `\`${projectId}.${datasetId}.${adjustmentsTableId}\``;
  const adjustmentId = normalizeText(formData.get("adjustment_id"));
  const fixedStage = "precalculo";

  if (adjustmentId) {
    await runBigQueryQuery({
      query: `
        UPDATE ${adjustmentsTableRef}
        SET
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP(),
          updated_by = @updated_by
        WHERE adjustment_id = @adjustment_id
      `,
      parameters: [
        { name: "updated_by", type: "STRING", value: user.id },
        { name: "adjustment_id", type: "STRING", value: adjustmentId },
      ],
    });
  } else {
    const periodInput = normalizeText(formData.get("period_month"));
    const periodMonth = normalizePeriodMonthInput(periodInput);
    if (!periodMonth) return { ok: false, message: "Periodo invalido." };
    const ruta = normalizeText(formData.get("ruta"));
    const productName = normalizeText(formData.get("product_name"));
    const kind = normalizeKind(formData.get("kind"), "ajuste_manual");
    if (!ruta) {
      return { ok: false, message: "Captura ruta." };
    }
    const periodo = normalizePeriodCode(periodMonth);
    const productKey = normalizeProductKey(productName);
    await runBigQueryQuery({
      query: `
        UPDATE ${adjustmentsTableRef}
        SET
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP(),
          updated_by = @updated_by
        WHERE periodo = @periodo
          AND LOWER(REGEXP_REPLACE(TRIM(ruta), r'\\s+', '')) = LOWER(REGEXP_REPLACE(TRIM(@ruta), r'\\s+', ''))
          AND UPPER(TRIM(product_name)) = UPPER(TRIM(@product_name))
          AND stage = @stage
          AND kind = @kind
          AND is_active = TRUE
      `,
      parameters: [
        { name: "updated_by", type: "STRING", value: user.id },
        { name: "periodo", type: "STRING", value: periodo },
        { name: "ruta", type: "STRING", value: ruta },
        { name: "product_name", type: "STRING", value: productKey },
        { name: "stage", type: "STRING", value: fixedStage },
        { name: "kind", type: "STRING", value: kind },
      ],
    });
  }

  revalidatePath("/admin/calculo");
  revalidatePath("/admin/calculo/adjustments");
  revalidatePath("/admin/calculo/aprobar");
  return { ok: true, message: "Ajuste desactivado.", applied: 1, invalid: 0, errors: [] };
}

export async function applyManualAdjustmentAction(
  _prevState: AdjustmentActionResult | null,
  formData: FormData,
): Promise<AdjustmentActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = normalizeText(formData.get("period_month"));
  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido." };
  }

  const ruta = normalizeText(formData.get("ruta"));
  const productName = normalizeText(formData.get("product_name"));
  const deltaRaw = formData.get("pagoresultado_delta");
  const comment = normalizeText(formData.get("comment")) || null;
  const kind = normalizeKind(formData.get("kind"), "ajuste_manual");
  const delta = toNumber(deltaRaw);

  if (!ruta || delta === null) {
    return { ok: false, message: "Captura ruta y pagoresultado delta validos." };
  }

  return applyAdjustments(periodMonth, [{ ruta, productName, pagoResultadoDelta: delta, comment, kind }], user.id);
}

export async function uploadAdjustmentsBatchAction(
  _prevState: AdjustmentActionResult | null,
  formData: FormData,
): Promise<AdjustmentActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = normalizeText(formData.get("period_month"));
  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido." };
  }

  const defaultKind = normalizeKind(formData.get("kind"), "ajuste_batch");
  const requestedSheetName = normalizeText(formData.get("sheet_name"));

  const uploadedFile = formData.get("file");
  if (!(uploadedFile instanceof File)) {
    return { ok: false, message: "Debes seleccionar un archivo Excel o CSV." };
  }

  let parsedRows: Array<Record<string, unknown>> = [];
  let detectedSheetName = "";
  let detectedHeaderIndex = -1;
  let detectedHeaders: string[] = [];
  try {
    const { read, utils } = await import("xlsx");
    const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
    const workbook = read(fileBuffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames ?? [];
    if (sheetNames.length === 0) {
      return { ok: false, message: "No se encontro una hoja valida en el archivo." };
    }

    let best: {
      rows: Array<Record<string, unknown>>;
      headerIndex: number;
      headers: string[];
      score: number;
      sheetName: string;
    } | null = null;

    const orderedSheetNames = requestedSheetName
      ? sheetNames.filter((name) => name === requestedSheetName)
      : sheetNames;

    if (requestedSheetName && orderedSheetNames.length === 0) {
      return {
        ok: false,
        message: `La pestaña seleccionada "${requestedSheetName}" no existe en el archivo.`,
      };
    }

    for (const sheetName of orderedSheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const matrix = utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const candidate = buildRowsFromMatrix(matrix);
      if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.rows.length > best.rows.length)) {
        best = { ...candidate, sheetName };
      }
    }

    if (!best) {
      return { ok: false, message: "No se pudo detectar una hoja util para ajustes." };
    }

    parsedRows = best.rows;
    detectedSheetName = best.sheetName;
    detectedHeaderIndex = best.headerIndex;
    detectedHeaders = best.headers;
  } catch {
    return { ok: false, message: "No se pudo leer el archivo. Usa plantilla valida." };
  }

  if (parsedRows.length === 0) {
    return { ok: false, message: "El archivo no contiene filas para procesar." };
  }

  const rows: AdjustmentInput[] = [];
  const parseErrors: string[] = [];

  for (let index = 0; index < parsedRows.length; index += 1) {
    const row = parsedRows[index] ?? {};
    const rowNumber = index + 2;
    const ruta = normalizeText(
      getRowValue(row, ["ruta", "territorio_individual", "territorio", "route", "territorioindividual"]),
    );
    const productName = normalizeText(
      getRowValue(row, ["product_name", "producto", "product", "productname", "plan", "planname"]),
    );

    const deltaFromDeltaCols = toNumber(
      getRowValue(row, [
        "pagoresultado_delta",
        "delta_pagoresultado",
        "ajuste_delta",
        "ajustedelta",
        "ajusted",
        "delta",
        "ajuste",
        "extra",
        "monto",
        "monto_ajuste",
        "montoajuste",
        "valor",
        "value",
      ]),
    );
    const deltaFromLegacyPagoResultado = toNumber(
      getRowValue(row, [
        "pagoresultado",
        "pr",
        "pr_ajus",
        "prajus",
        "pr_ajustado",
        "pr_ajust",
        "pr_ajustado",
        "pagoresultado_ajustado",
        "calculadora",
      ]),
    );
    const delta = deltaFromDeltaCols ?? deltaFromLegacyPagoResultado;

    const comment = normalizeText(
      getRowValue(row, ["comment", "comentario", "nota", "notes"]),
    ) || null;
    const kind = normalizeKind(getRowValue(row, ["kind", "tipo"]), defaultKind);

    if (!ruta || delta === null) {
      if (parseErrors.length < 25) {
        const rawRuta = normalizeText(
          getRowValue(row, ["ruta", "territorio_individual", "territorio", "route", "territorioindividual"]),
        );
        const rawValor = normalizeText(
          getRowValue(row, [
            "pagoresultado_delta",
            "delta_pagoresultado",
            "ajuste_delta",
            "ajustedelta",
            "ajusted",
            "delta",
            "ajuste",
            "extra",
            "monto",
            "monto_ajuste",
            "montoajuste",
            "valor",
            "value",
            "pagoresultado",
            "pr",
            "pr_ajus",
            "prajus",
            "pr_ajustado",
            "pr_ajust",
            "pagoresultado_ajustado",
            "calculadora",
          ]),
        );
        parseErrors.push(`Fila ${rowNumber}: requiere ruta y pagoresultado_delta numerico. Leido ruta="${rawRuta}" valor="${rawValor}"`);
      }
      continue;
    }

    rows.push({ ruta, productName, pagoResultadoDelta: delta, comment, kind });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      message: `No hay filas validas para aplicar. Hoja detectada: ${detectedSheetName || "-"}, header fila: ${detectedHeaderIndex >= 0 ? detectedHeaderIndex + 1 : "-"}, headers: ${detectedHeaders.slice(0, 12).join(" | ")}`,
      errors: parseErrors.slice(0, 25),
    };
  }

  // Keep batch uploads idempotent: replace previous active batch rows for this period+kind.
  try {
    const { projectId, datasetId, adjustmentsTableId } = await ensureBigQueryReady();
    const adjustmentsTableRef = `\`${projectId}.${datasetId}.${adjustmentsTableId}\``;
    const periodo = normalizePeriodCode(periodMonth);
    await runBigQueryQuery({
      query: `
        UPDATE ${adjustmentsTableRef}
        SET
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP(),
          updated_by = @updated_by
        WHERE periodo = @periodo
          AND stage = 'precalculo'
          AND kind = @kind
          AND is_active = TRUE
      `,
      parameters: [
        { name: "updated_by", type: "STRING", value: user.id },
        { name: "periodo", type: "STRING", value: periodo },
        { name: "kind", type: "STRING", value: defaultKind },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `No se pudo preparar el reemplazo de batch: ${error.message}` : "No se pudo preparar el reemplazo de batch.",
    };
  }

  const result = await applyAdjustments(periodMonth, rows, user.id);
  if (!result.ok) return result;
  return {
    ...result,
    errors: [...parseErrors, ...result.errors].slice(0, 25),
    invalid: result.invalid + parseErrors.length,
    message: `Batch de ajustes guardado en tabla de ajustes. Exitosas: ${result.applied}. Invalidas: ${result.invalid + parseErrors.length}.`,
  };
}
