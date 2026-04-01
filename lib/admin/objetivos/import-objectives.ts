import { cleanNumber, cleanText } from "@/lib/import-engine/cleaners";
import { detectHeaderRow } from "@/lib/import-engine/header-detector";
import { parseExcelBuffer } from "@/lib/import-engine/excel-parser";

type ParsedInputRow = {
  rowNumber: number;
  sourceType: "private" | "drilldown" | "private+drilldown";
  sourceFileName: string | null;
  sourceSheetName: string | null;
  periodMonth: string;
  territorioIndividual: string;
  productName: string;
  metodo: string;
  planTypeName: string;
  target: number;
  brick: string | null;
  cuenta: string | null;
  canal: string | null;
  producto: string | null;
  periodoString: string | null;
  periodo: string | null;
  salesCredity: number;
};

type ParsedInputIssue = {
  rowNumber: number;
  sourceType: "private" | "drilldown" | "private+drilldown";
  sourceFileName: string | null;
  sourceSheetName: string | null;
  code: string;
  route: string | null;
  productName: string | null;
  teamId: string | null;
  actionSuggestion: string;
  reason: string;
};

export type ParsedObjectivesInput = {
  sheetName: string;
  totalRowsRead: number;
  rowsForPeriod: ParsedInputRow[];
  skippedByPeriod: number;
  invalidRows: ParsedInputIssue[];
  sourceBreakdown: Array<{
    sourceType: "private" | "drilldown";
    sourceFileName: string | null;
    sheetName: string;
    parsedRows: number;
    invalidRows: number;
    skippedByPeriod: number;
  }>;
};

export type ParsedObjectivesSource = {
  source: "private" | "drilldown";
  fileName: string;
  sheetName: string;
  parsed: ParsedObjectivesInput;
};

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
  definition_id: string | null;
  product_name: string | null;
  plan_type_name: string | null;
};

type ValidatedRow = ParsedInputRow & {
  teamId: string;
  rowKey: string;
  issueCodes: string[];
  valid: boolean;
};

export type ObjectivesPreviewSummary = {
  parsedRows: number;
  validRows: number;
  invalidRows: number;
  skippedByPeriod: number;
  duplicatedRows: number;
  expectedRequiredCount: number;
  coveredRequiredCount: number;
  missingRequiredCount: number;
  criticalCount: number;
  warningCount: number;
  routesWithMissingCount: number;
  criticalExamples: string[];
  warningExamples: string[];
  invalidExamples: string[];
  missingExamples: string[];
  teamAlerts: Array<{
    teamId: string;
    missingCount: number;
    missingExamples: string[];
  }>;
  criticalDetails: Array<{
    severity: "critical";
    code: "missing_required_objective";
    sourceType: "private+drilldown";
    sourceFileName: string | null;
    sourceSheetName: string | null;
    rowNumber: number;
    route: string | null;
    productName: string | null;
    teamId: string | null;
    message: string;
    actionSuggestion: string;
  }>;
  invalidDetails: Array<{
    severity: "critical" | "warning";
    code: string;
    sourceType: "private" | "drilldown" | "private+drilldown";
    sourceFileName: string | null;
    sourceSheetName: string | null;
    rowNumber: number;
    route: string | null;
    productName: string | null;
    teamId: string | null;
    message: string;
    actionSuggestion: string;
  }>;
  sourceBreakdown: Array<{
    sourceType: "private" | "drilldown";
    sourceFileName: string | null;
    sheetName: string;
    parsedRows: number;
    invalidRows: number;
    skippedByPeriod: number;
  }>;
};

export type ObjectivesPreviewComputation = {
  summary: ObjectivesPreviewSummary;
  validRowsForInsert: ValidatedRow[];
  hasStatusData: boolean;
  hasRuleDefinitions: boolean;
};

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeHeader(value: string): string {
  return normalizeKey(value)
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveColumn(headerKey: string): keyof ParsedInputRow | null {
  if (headerKey === "RUTA" || headerKey === "TERRITORIO_INDIVIDUAL") return "territorioIndividual";
  if (headerKey === "PRODUCT_NAME" || headerKey === "PRODUCTO_NOMBRE") return "productName";
  if (headerKey === "TARGET" || headerKey === "OBJETIVO") return "target";
  if (headerKey === "BRICK" || headerKey === "CLUE_BRICK" || headerKey === "CLUE__BRICK") return "brick";
  if (headerKey === "CUENTA" || headerKey === "ACCOUNT") return "cuenta";
  if (headerKey === "CANAL") return "canal";
  if (headerKey === "PLAN_TYPE_NAME" || headerKey === "PLAN_TYPE" || headerKey === "TIPO_PLAN") return "planTypeName";
  if (headerKey === "PRODUCTO") return "producto";
  if (headerKey === "PERIODOSTRING" || headerKey === "PERIODO_STRING" || headerKey === "YYYYMM") return "periodoString";
  if (headerKey === "PERIODO" || headerKey === "YYMM") return "periodo";
  return null;
}

function normalizeMetodoValue(value: string | null | undefined): "PRIVATE" | "CUENTAS" | "ESTADOS" {
  const normalized = normalizeKey(value);
  if (normalized.includes("ESTADO")) return "ESTADOS";
  if (normalized.includes("CUENTA")) return "CUENTAS";
  return "CUENTAS";
}

const SPANISH_MONTH_INDEX: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

function periodMonthFromYYYYMM(value: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function periodMonthFromYYMM(value: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{2})(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]) + 2000;
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function parseRowPeriodMonth(periodoString: string | null, periodo: string | null): string | null {
  return periodMonthFromYYYYMM(periodoString) ?? periodMonthFromYYMM(periodo);
}

function periodMonthFromMesName(value: string | null, selectedPeriodMonth: string): string | null {
  if (!value) return null;
  const normalized = normalizeKey(value);
  const monthIndex = SPANISH_MONTH_INDEX[normalized];
  if (!monthIndex) return null;
  const year = Number(selectedPeriodMonth.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return `${String(year).padStart(4, "0")}-${String(monthIndex).padStart(2, "0")}-01`;
}

export function parseObjectivesFile(params: {
  fileBuffer: Buffer;
  selectedPeriodMonth: string;
  sourceFileName?: string | null;
  requestedSheetName?: string | null;
}): ParsedObjectivesInput {
  const workbook = parseExcelBuffer(params.fileBuffer);
  const firstSheet = workbook.sheetNames[0] ?? null;
  if (!firstSheet) {
    return {
      sheetName: "",
      totalRowsRead: 0,
      rowsForPeriod: [],
      skippedByPeriod: 0,
      invalidRows: [
        {
          rowNumber: 0,
          sourceType: "private",
          sourceFileName: params.sourceFileName ?? null,
          sourceSheetName: null,
          code: "empty_workbook",
          route: null,
          productName: null,
          teamId: null,
          actionSuggestion: "Verifica que el archivo tenga al menos una hoja con datos.",
          reason: "El archivo no contiene hojas.",
        },
      ],
      sourceBreakdown: [],
    };
  }

  const selectedSheetName =
    params.requestedSheetName && workbook.sheets[params.requestedSheetName]
      ? params.requestedSheetName
      : firstSheet;
  const matrix = workbook.sheets[selectedSheetName] ?? [];
  const detectedHeader = detectHeaderRow(matrix);
  if (!detectedHeader) {
    return {
      sheetName: selectedSheetName,
      totalRowsRead: matrix.length,
      rowsForPeriod: [],
      skippedByPeriod: 0,
      invalidRows: [
        {
          rowNumber: 0,
          sourceType: "private",
          sourceFileName: params.sourceFileName ?? null,
          sourceSheetName: selectedSheetName,
          code: "header_not_detected",
          route: null,
          productName: null,
          teamId: null,
          actionSuggestion: "Asegura que exista una fila de encabezados legible con columnas esperadas.",
          reason: "No se pudo detectar fila de encabezados.",
        },
      ],
      sourceBreakdown: [],
    };
  }

  const headerIndex = detectedHeader.headerRowIndex;
  const headers = detectedHeader.headers;
  const columnMap = new Map<number, keyof ParsedInputRow>();
  headers.forEach((headerValue, columnIndex) => {
    const parsed = resolveColumn(normalizeHeader(headerValue));
    if (parsed) columnMap.set(columnIndex, parsed);
  });

  const mandatoryColumns: Array<keyof ParsedInputRow> = [
    "territorioIndividual",
    "productName",
    "target",
  ];
  const hasMandatory = mandatoryColumns.every((column) =>
    Array.from(columnMap.values()).includes(column),
  );
  if (!hasMandatory) {
    return {
      sheetName: selectedSheetName,
      totalRowsRead: matrix.length,
      rowsForPeriod: [],
      skippedByPeriod: 0,
      invalidRows: [
        {
          rowNumber: detectedHeader.headerRowNumber,
          sourceType: "private",
          sourceFileName: params.sourceFileName ?? null,
          sourceSheetName: selectedSheetName,
          code: "missing_required_columns",
          route: null,
          productName: null,
          teamId: null,
          actionSuggestion: "Incluye columnas: ruta/territorio_individual, product_name y target.",
          reason:
            "Faltan columnas requeridas. Minimo: ruta/territorio_individual, product_name, target.",
        },
      ],
      sourceBreakdown: [],
    };
  }

  const invalidRows: ParsedInputIssue[] = [];
  const rowsForPeriod: ParsedInputRow[] = [];
  let skippedByPeriod = 0;

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;

    const mapped: Partial<ParsedInputRow> = {};
    for (const [columnIndex, targetField] of columnMap.entries()) {
      const rawValue = row[columnIndex];
      if (targetField === "target") {
        mapped.target = cleanNumber(rawValue) ?? NaN;
      } else if (targetField === "periodoString" || targetField === "periodo") {
        (mapped as Record<string, unknown>)[targetField] = cleanText(rawValue);
      } else {
        (mapped as Record<string, unknown>)[targetField] = cleanText(rawValue);
      }
    }

    const isEmptyRow =
      !mapped.territorioIndividual &&
      !mapped.productName &&
      (mapped.target === undefined || Number.isNaN(mapped.target));
    if (isEmptyRow) continue;

    const rowPeriodMonth = parseRowPeriodMonth(mapped.periodoString ?? null, mapped.periodo ?? null);
    if (rowPeriodMonth && rowPeriodMonth !== params.selectedPeriodMonth) {
      skippedByPeriod += 1;
      continue;
    }

    if (!mapped.territorioIndividual || !mapped.productName) {
      invalidRows.push({
        rowNumber,
        sourceType: "private",
        sourceFileName: params.sourceFileName ?? null,
        sourceSheetName: selectedSheetName,
        code: "missing_required_fields",
        route: mapped.territorioIndividual ?? null,
        productName: mapped.productName ?? null,
        teamId: null,
        actionSuggestion: "Completa ruta y product_name en la fila.",
        reason: "Faltan campos requeridos (ruta o product_name).",
      });
      continue;
    }

    if (mapped.target === undefined || !Number.isFinite(mapped.target)) {
      invalidRows.push({
        rowNumber,
        sourceType: "private",
        sourceFileName: params.sourceFileName ?? null,
        sourceSheetName: selectedSheetName,
        code: "invalid_target",
        route: mapped.territorioIndividual ?? null,
        productName: mapped.productName ?? null,
        teamId: null,
        actionSuggestion: "Captura un target numerico mayor o igual a 0.",
        reason: "Target invalido.",
      });
      continue;
    }

    rowsForPeriod.push({
      rowNumber,
      sourceType: "private",
      sourceFileName: params.sourceFileName ?? null,
      sourceSheetName: selectedSheetName,
      periodMonth: rowPeriodMonth ?? params.selectedPeriodMonth,
      territorioIndividual: mapped.territorioIndividual,
      productName: mapped.productName,
      metodo: "PRIVATE",
      planTypeName: mapped.planTypeName ?? "PRIVATE",
      target: mapped.target,
      brick: "PRIVATE",
      cuenta: "PRIVATE",
      canal: mapped.canal ?? null,
      producto: mapped.producto ?? null,
      periodoString: mapped.periodoString ?? null,
      periodo: mapped.periodo ?? null,
      salesCredity: 1,
    });
  }

  return {
    sheetName: selectedSheetName,
    totalRowsRead: matrix.length,
    rowsForPeriod,
    skippedByPeriod,
    invalidRows,
    sourceBreakdown: [
      {
        sourceType: "private",
        sourceFileName: params.sourceFileName ?? null,
        sheetName: selectedSheetName,
        parsedRows: rowsForPeriod.length,
        invalidRows: invalidRows.length,
        skippedByPeriod,
      },
    ],
  };
}

function resolveDrillDownColumn(headerKey: string): "ruta" | "productName" | "cuota" | "mes" | "canal" | "producto" | "metodo" | "brick" | "cuenta" | "salesCredity" | null {
  if (headerKey === "RUTA" || headerKey === "TERRITORIO_INDIVIDUAL") return "ruta";
  if (headerKey === "PRODUCT_NAME" || headerKey === "PRODUCTO_NOMBRE") return "productName";
  if (headerKey === "CUOTA" || headerKey === "TARGET" || headerKey === "OBJETIVO") return "cuota";
  if (headerKey === "MES" || headerKey === "MONTH") return "mes";
  if (headerKey === "CHANNEL" || headerKey === "CANAL") return "canal";
  if (headerKey === "PRODUCT" || headerKey === "PRODUCTO") return "producto";
  if (headerKey === "METODO" || headerKey === "METODOLOGIA" || headerKey === "METHOD" || headerKey === "METODO_") return "metodo";
  if (headerKey === "BRICK" || headerKey === "CLUE_BRICK" || headerKey === "CLUE__BRICK") return "brick";
  if (headerKey === "CUENTA" || headerKey === "ACCOUNT") return "cuenta";
  if (headerKey === "SALES_CRED" || headerKey === "SALES_CREDIT" || headerKey === "SALES_CREDITY") return "salesCredity";
  return null;
}

export function parseDrillDownObjectivesFile(params: {
  fileBuffer: Buffer;
  selectedPeriodMonth: string;
  sourceFileName?: string | null;
  requestedSheetName?: string | null;
}): ParsedObjectivesInput {
  const workbook = parseExcelBuffer(params.fileBuffer);
  const firstSheet = workbook.sheetNames[0] ?? null;
  if (!firstSheet) {
    return {
      sheetName: "",
      totalRowsRead: 0,
      rowsForPeriod: [],
      skippedByPeriod: 0,
      invalidRows: [
        {
          rowNumber: 0,
          sourceType: "drilldown",
          sourceFileName: params.sourceFileName ?? null,
          sourceSheetName: null,
          code: "empty_workbook",
          route: null,
          productName: null,
          teamId: null,
          actionSuggestion: "Verifica que el archivo tenga al menos una hoja con datos.",
          reason: "El archivo no contiene hojas.",
        },
      ],
      sourceBreakdown: [],
    };
  }

  const selectedSheetName =
    params.requestedSheetName && workbook.sheets[params.requestedSheetName]
      ? params.requestedSheetName
      : firstSheet;
  const matrix = workbook.sheets[selectedSheetName] ?? [];
  const detectedHeader = detectHeaderRow(matrix);
  if (!detectedHeader) {
    return {
      sheetName: selectedSheetName,
      totalRowsRead: matrix.length,
      rowsForPeriod: [],
      skippedByPeriod: 0,
      invalidRows: [
        {
          rowNumber: 0,
          sourceType: "drilldown",
          sourceFileName: params.sourceFileName ?? null,
          sourceSheetName: selectedSheetName,
          code: "header_not_detected",
          route: null,
          productName: null,
          teamId: null,
          actionSuggestion: "Asegura que exista una fila de encabezados legible con columnas esperadas.",
          reason: "No se pudo detectar fila de encabezados.",
        },
      ],
      sourceBreakdown: [],
    };
  }

  const headerIndex = detectedHeader.headerRowIndex;
  const headers = detectedHeader.headers;
  const columnMap = new Map<number, "ruta" | "productName" | "cuota" | "mes" | "canal" | "producto" | "metodo" | "brick" | "cuenta" | "salesCredity">();
  headers.forEach((headerValue, columnIndex) => {
    const parsed = resolveDrillDownColumn(normalizeHeader(headerValue));
    if (parsed) columnMap.set(columnIndex, parsed);
  });

  const mandatoryColumns: Array<"ruta" | "productName" | "cuota" | "mes"> = ["ruta", "productName", "cuota", "mes"];
  const hasMandatory = mandatoryColumns.every((column) =>
    Array.from(columnMap.values()).includes(column),
  );
  if (!hasMandatory) {
    return {
      sheetName: selectedSheetName,
      totalRowsRead: matrix.length,
      rowsForPeriod: [],
      skippedByPeriod: 0,
      invalidRows: [
        {
          rowNumber: detectedHeader.headerRowNumber,
          sourceType: "drilldown",
          sourceFileName: params.sourceFileName ?? null,
          sourceSheetName: selectedSheetName,
          code: "missing_required_columns",
          route: null,
          productName: null,
          teamId: null,
          actionSuggestion: "Incluye columnas: RUTA, PRODUCT_NAME, CUOTA y MES.",
          reason:
            "Faltan columnas requeridas. Minimo: RUTA, PRODUCT_NAME, CUOTA y MES.",
        },
      ],
      sourceBreakdown: [],
    };
  }

  const invalidRows: ParsedInputIssue[] = [];
  const preAggregatedRows: ParsedInputRow[] = [];
  let skippedByPeriod = 0;

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;

    const mapped: Partial<{
      ruta: string | null;
      productName: string | null;
      cuota: number;
      mes: string | null;
      canal: string | null;
      producto: string | null;
      metodo: string | null;
      brick: string | null;
      cuenta: string | null;
      salesCredity: number;
    }> = {};

    for (const [columnIndex, targetField] of columnMap.entries()) {
      const rawValue = row[columnIndex];
      if (targetField === "cuota") {
        mapped.cuota = cleanNumber(rawValue) ?? NaN;
      } else if (targetField === "salesCredity") {
        mapped.salesCredity = cleanNumber(rawValue) ?? NaN;
      } else {
        (mapped as Record<string, unknown>)[targetField] = cleanText(rawValue);
      }
    }

    const isEmptyRow =
      !mapped.ruta &&
      !mapped.productName &&
      (mapped.cuota === undefined || Number.isNaN(mapped.cuota));
    if (isEmptyRow) continue;

    const rowPeriodMonth = periodMonthFromMesName(mapped.mes ?? null, params.selectedPeriodMonth);
    if (rowPeriodMonth && rowPeriodMonth !== params.selectedPeriodMonth) {
      skippedByPeriod += 1;
      continue;
    }

    if (!mapped.ruta || !mapped.productName) {
      invalidRows.push({
        rowNumber,
        sourceType: "drilldown",
        sourceFileName: params.sourceFileName ?? null,
        sourceSheetName: selectedSheetName,
        code: "missing_required_fields",
        route: mapped.ruta ?? null,
        productName: mapped.productName ?? null,
        teamId: null,
        actionSuggestion: "Completa RUTA y PRODUCT_NAME en la fila.",
        reason: "Faltan campos requeridos (RUTA o PRODUCT_NAME).",
      });
      continue;
    }

    if (mapped.cuota === undefined || !Number.isFinite(mapped.cuota)) {
      invalidRows.push({
        rowNumber,
        sourceType: "drilldown",
        sourceFileName: params.sourceFileName ?? null,
        sourceSheetName: selectedSheetName,
        code: "invalid_target",
        route: mapped.ruta ?? null,
        productName: mapped.productName ?? null,
        teamId: null,
        actionSuggestion: "Captura CUOTA numerica mayor o igual a 0.",
        reason: "CUOTA invalida.",
      });
      continue;
    }
    if (mapped.salesCredity !== undefined && !Number.isFinite(mapped.salesCredity)) {
      invalidRows.push({
        rowNumber,
        sourceType: "drilldown",
        sourceFileName: params.sourceFileName ?? null,
        sourceSheetName: selectedSheetName,
        code: "invalid_sales_credity",
        route: mapped.ruta ?? null,
        productName: mapped.productName ?? null,
        teamId: null,
        actionSuggestion: "Captura SALES CRED numerico mayor o igual a 0 (ej. 1 o 0.5).",
        reason: "SALES CRED invalido.",
      });
      continue;
    }

    preAggregatedRows.push({
      rowNumber,
      sourceType: "drilldown",
      sourceFileName: params.sourceFileName ?? null,
      sourceSheetName: selectedSheetName,
      periodMonth: rowPeriodMonth ?? params.selectedPeriodMonth,
      territorioIndividual: mapped.ruta,
      productName: mapped.productName,
      metodo: normalizeMetodoValue(mapped.metodo),
      planTypeName: mapped.metodo?.trim() || "DRILL DOWN CUOTAS",
      target: mapped.cuota,
      brick: mapped.brick ?? null,
      cuenta: mapped.cuenta ?? null,
      canal: mapped.canal ?? null,
      producto: mapped.producto ?? null,
      periodoString: null,
      periodo: null,
      salesCredity:
        mapped.salesCredity !== undefined && Number.isFinite(mapped.salesCredity) && mapped.salesCredity >= 0
          ? mapped.salesCredity
          : 1,
    });
  }

  const aggregatedByKey = new Map<string, ParsedInputRow>();
  for (const row of preAggregatedRows) {
    const key = `${toRowKey(row.territorioIndividual, row.productName)}||${normalizeKey(row.brick)}||${normalizeKey(row.cuenta)}`;
    const current = aggregatedByKey.get(key);
    if (!current) {
      aggregatedByKey.set(key, { ...row });
      continue;
    }
    aggregatedByKey.set(key, {
      ...current,
      target: current.target + row.target,
      rowNumber: Math.min(current.rowNumber, row.rowNumber),
      salesCredity:
        Number.isFinite(current.salesCredity) && current.salesCredity > 0
          ? current.salesCredity
          : row.salesCredity,
    });
  }

  return {
    sheetName: selectedSheetName,
    totalRowsRead: matrix.length,
    rowsForPeriod: Array.from(aggregatedByKey.values()),
    skippedByPeriod,
    invalidRows,
    sourceBreakdown: [
      {
        sourceType: "drilldown",
        sourceFileName: params.sourceFileName ?? null,
        sheetName: selectedSheetName,
        parsedRows: aggregatedByKey.size,
        invalidRows: invalidRows.length,
        skippedByPeriod,
      },
    ],
  };
}

export function mergeObjectivesSources(sources: ParsedObjectivesSource[]): ParsedObjectivesInput {
  const invalidRows: ParsedInputIssue[] = [];
  const rowsForPeriod: ParsedInputRow[] = [];
  let skippedByPeriod = 0;
  let totalRowsRead = 0;
  const drillDownCoverageKeys = new Set<string>();

  for (const source of sources) {
    if (source.source !== "drilldown") continue;
    for (const row of source.parsed.rowsForPeriod) {
      drillDownCoverageKeys.add(toRowKey(row.territorioIndividual, row.productName));
    }
  }

  for (const source of sources) {
    totalRowsRead += source.parsed.totalRowsRead;
    skippedByPeriod += source.parsed.skippedByPeriod;
    invalidRows.push(
      ...source.parsed.invalidRows.map((issue) => ({
        rowNumber: issue.rowNumber,
        sourceType: issue.sourceType ?? source.source,
        sourceFileName: issue.sourceFileName ?? source.fileName,
        sourceSheetName: issue.sourceSheetName ?? source.sheetName,
        code: issue.code,
        route: issue.route ?? null,
        productName: issue.productName ?? null,
        teamId: issue.teamId ?? null,
        actionSuggestion: issue.actionSuggestion,
        reason: issue.reason,
      })),
    );
    if (source.source === "private") {
      for (const row of source.parsed.rowsForPeriod) {
        const baseKey = toRowKey(row.territorioIndividual, row.productName);
        if (drillDownCoverageKeys.has(baseKey)) {
          // Si Drill Down ya trae la combinacion ruta+producto,
          // priorizamos el detalle de Drill Down y no duplicamos con fila PRIVATE.
          continue;
        }
        rowsForPeriod.push(row);
      }
    } else {
      rowsForPeriod.push(...source.parsed.rowsForPeriod);
    }
  }

  return {
    sheetName: sources.map((source) => `${source.source}:${source.parsed.sheetName || "-"}`).join(" | "),
    totalRowsRead,
    rowsForPeriod,
    skippedByPeriod,
    invalidRows,
    sourceBreakdown: sources.map((source) => ({
      sourceType: source.source,
      sourceFileName: source.fileName,
      sheetName: source.parsed.sheetName,
      parsedRows: source.parsed.rowsForPeriod.length,
      invalidRows: source.parsed.invalidRows.length,
      skippedByPeriod: source.parsed.skippedByPeriod,
    })),
  };
}

function toProductKey(productName: string): string {
  return normalizeKey(productName);
}

function toRouteKey(route: string): string {
  return normalizeKey(route);
}

function isIgnoredRoutePlaceholder(route: string | null | undefined): boolean {
  const key = toRouteKey(String(route ?? ""));
  if (!key) return true;
  const ignored = new Set([
    "NO VISIT",
    "NOVISIT",
    "NO VISITADO",
    "NOVISITADO",
    "NULL",
    "N/A",
    "NA",
    "-",
  ]);
  return ignored.has(key);
}

function toRowKey(route: string, productName: string): string {
  return `${toRouteKey(route)}||${toProductKey(productName)}`;
}

export function computeObjectivesPreview(params: {
  parsedInput: ParsedObjectivesInput;
  selectedPeriodMonth: string;
  statusRows: StatusRow[];
  ruleVersionRows: RuleVersionRow[];
  ruleItemRows: RuleItemRow[];
}): ObjectivesPreviewComputation {
  function sourceLabel(sourceType: ParsedInputRow["sourceType"] | ParsedInputIssue["sourceType"]): string {
    if (sourceType === "private") return "Objetivos Privados";
    if (sourceType === "drilldown") return "Drill Down Cuotas";
    return "Objetivos Privados + Drill Down Cuotas";
  }

  const routeToTeam = new Map<string, { route: string; teamId: string }>();
  const vacantRoutes = new Set<string>();
  for (const row of params.statusRows) {
    const route = cleanText(row.territorio_individual);
    const teamId = cleanText(row.team_id);
    const isActive = row.is_active === true;
    const isVacant = row.is_vacant === true;
    if (!route) continue;

    const routeKey = toRouteKey(route);
    if (isVacant) {
      vacantRoutes.add(routeKey);
    }
    if (!teamId || !isActive || isVacant) continue;
    routeToTeam.set(routeKey, { route, teamId });
  }

  const latestVersionByTeam = new Map<string, RuleVersionRow>();
  for (const row of params.ruleVersionRows) {
    const teamId = cleanText(row.team_id);
    const definitionId = cleanText(row.rule_definition_id);
    if (!teamId || !definitionId) continue;

    const current = latestVersionByTeam.get(teamId);
    if (!current) {
      latestVersionByTeam.set(teamId, row);
      continue;
    }

    const currentVersionNo = Number(current.version_no ?? 0);
    const nextVersionNo = Number(row.version_no ?? 0);
    if (nextVersionNo > currentVersionNo) {
      latestVersionByTeam.set(teamId, row);
      continue;
    }

    if (nextVersionNo === currentVersionNo) {
      const currentCreatedAt = String(current.created_at ?? "");
      const nextCreatedAt = String(row.created_at ?? "");
      if (nextCreatedAt > currentCreatedAt) {
        latestVersionByTeam.set(teamId, row);
      }
    }
  }

  const productSetByDefinition = new Map<string, Set<string>>();
  for (const row of params.ruleItemRows) {
    const definitionId = cleanText(row.definition_id);
    const productName = cleanText(row.product_name);
    const planTypeName = cleanText(row.plan_type_name);
    if (!definitionId || !productName || !planTypeName) continue;
    const currentSet = productSetByDefinition.get(definitionId) ?? new Set<string>();
    currentSet.add(toProductKey(productName));
    productSetByDefinition.set(definitionId, currentSet);
  }

  const requiredProductsByTeam = new Map<string, Set<string>>();
  for (const [teamId, versionRow] of latestVersionByTeam.entries()) {
    const definitionId = cleanText(versionRow.rule_definition_id);
    if (!definitionId) continue;
    const products = productSetByDefinition.get(definitionId);
    if (products && products.size > 0) {
      requiredProductsByTeam.set(teamId, products);
    }
  }

  const validatedRows: ValidatedRow[] = [];
  const invalidDetails: ObjectivesPreviewSummary["invalidDetails"] = params.parsedInput.invalidRows.map(
    (issue) => ({
      severity: "warning",
      code: issue.code,
      sourceType: issue.sourceType,
      sourceFileName: issue.sourceFileName ?? null,
      sourceSheetName: issue.sourceSheetName ?? null,
      rowNumber: issue.rowNumber,
      route: issue.route ?? null,
      productName: issue.productName ?? null,
      teamId: issue.teamId ?? null,
      message: issue.reason,
      actionSuggestion: issue.actionSuggestion,
    }),
  );

  for (const row of params.parsedInput.rowsForPeriod) {
    const routeKey = toRouteKey(row.territorioIndividual);
    const productKey = toProductKey(row.productName);
    const status = routeToTeam.get(routeKey);

    // Si la ruta existe en status pero el periodo la marca como vacante,
    // no se considera advertencia y tampoco se intenta insertar.
    if (!status && vacantRoutes.has(routeKey)) {
      continue;
    }

    // Excluir placeholders de ruta para evitar ruido de advertencias.
    if (!status && isIgnoredRoutePlaceholder(row.territorioIndividual)) {
      continue;
    }

    const teamId = status?.teamId ?? "";
    const requiredProducts = teamId ? requiredProductsByTeam.get(teamId) : null;

    const issueCodes: string[] = [];
    if (!status) issueCodes.push("unknown_route");
    if (status && requiredProducts && requiredProducts.size > 0 && !requiredProducts.has(productKey)) {
      issueCodes.push("product_not_in_team_rules");
    }
    if (!(row.target >= 0)) {
      issueCodes.push("negative_target");
    }

    validatedRows.push({
      ...row,
      teamId,
      rowKey: `${toRowKey(row.territorioIndividual, row.productName)}||${normalizeKey(row.brick)}||${normalizeKey(row.cuenta)}`,
      issueCodes,
      valid: issueCodes.length === 0,
    });
  }

  const dedupedByKey = new Map<string, ValidatedRow>();
  let duplicatedRows = 0;
  for (const row of validatedRows) {
    if (dedupedByKey.has(row.rowKey)) duplicatedRows += 1;
    dedupedByKey.set(row.rowKey, row);
  }

  const finalRows = Array.from(dedupedByKey.values());
  const validRowsForInsert = finalRows.filter((row) => row.valid);
  const invalidRowsComputed = finalRows.filter((row) => !row.valid);

  for (const row of invalidRowsComputed) {
    for (const code of row.issueCodes) {
      if (code === "unknown_route") {
        invalidDetails.push({
          severity: "warning",
          code,
          sourceType: row.sourceType,
          sourceFileName: row.sourceFileName ?? null,
          sourceSheetName: row.sourceSheetName ?? null,
          rowNumber: row.rowNumber,
          route: row.territorioIndividual,
          productName: row.productName,
          teamId: row.teamId || null,
          message: `ruta (${row.territorioIndividual}) no encontrada en sales_force_status del periodo`,
          actionSuggestion: "Corrige RUTA para que exista en sales_force_status del periodo seleccionado.",
        });
        continue;
      }
      if (code === "product_not_in_team_rules") {
        const teamLabel = row.teamId || "sin_team";
        invalidDetails.push({
          severity: "warning",
          code,
          sourceType: row.sourceType,
          sourceFileName: row.sourceFileName ?? null,
          sourceSheetName: row.sourceSheetName ?? null,
          rowNumber: row.rowNumber,
          route: row.territorioIndividual,
          productName: row.productName,
          teamId: row.teamId || null,
          message: `product_name (${row.productName}) no existe en reglas del team (${teamLabel})`,
          actionSuggestion: "Corrige PRODUCT_NAME o actualiza las reglas del team para incluir ese producto.",
        });
        continue;
      }
      if (code === "negative_target") {
        invalidDetails.push({
          severity: "warning",
          code,
          sourceType: row.sourceType,
          sourceFileName: row.sourceFileName ?? null,
          sourceSheetName: row.sourceSheetName ?? null,
          rowNumber: row.rowNumber,
          route: row.territorioIndividual,
          productName: row.productName,
          teamId: row.teamId || null,
          message: `target (${row.target}) negativo`,
          actionSuggestion: "Corrige TARGET/CUOTA a un numero mayor o igual a 0.",
        });
      }
    }
  }
  for (const row of finalRows) {
    if (!(row.salesCredity > 1)) continue;
    invalidDetails.push({
      severity: "warning",
      code: "sales_credity_gt_1",
      sourceType: row.sourceType,
      sourceFileName: row.sourceFileName ?? null,
      sourceSheetName: row.sourceSheetName ?? null,
      rowNumber: row.rowNumber,
      route: row.territorioIndividual,
      productName: row.productName,
      teamId: row.teamId || null,
      message: `sales_credity (${row.salesCredity}) mayor a 1`,
      actionSuggestion:
        "Revisa SALES CRED. Normalmente debe estar entre 0 y 1 (ejemplo: 0.143 en lugar de 14.3).",
    });
  }

  const invalidExamples = invalidDetails
    .slice(0, 8)
    .map(
      (detail) =>
        `Fila ${detail.rowNumber} (${sourceLabel(detail.sourceType)}): ${detail.message}`,
    );

  const expectedProductsByRoute = new Map<string, { teamId: string; products: Set<string> }>();
  for (const [routeKey, status] of routeToTeam.entries()) {
    const requiredProducts = requiredProductsByTeam.get(status.teamId);
    if (!requiredProducts || requiredProducts.size === 0) continue;
    expectedProductsByRoute.set(routeKey, { teamId: status.teamId, products: requiredProducts });
  }

  const loadedProductsByRoute = new Map<string, Set<string>>();
  for (const row of validRowsForInsert) {
    const routeKey = toRouteKey(row.territorioIndividual);
    const productKey = toProductKey(row.productName);
    const current = loadedProductsByRoute.get(routeKey) ?? new Set<string>();
    current.add(productKey);
    loadedProductsByRoute.set(routeKey, current);
  }

  let expectedRequiredCount = 0;
  let coveredRequiredCount = 0;
  const missingExamples: string[] = [];
  const criticalExamples: string[] = [];
  const criticalDetails: ObjectivesPreviewSummary["criticalDetails"] = [];
  const teamMissingMap = new Map<string, { count: number; examples: string[] }>();

  for (const [routeKey, expected] of expectedProductsByRoute.entries()) {
    const loaded = loadedProductsByRoute.get(routeKey) ?? new Set<string>();
    for (const product of expected.products) {
      expectedRequiredCount += 1;
      if (loaded.has(product)) {
        coveredRequiredCount += 1;
      } else {
        if (missingExamples.length < 12) {
          missingExamples.push(`${routeKey} | ${product}`);
        }
        if (criticalExamples.length < 12) {
          criticalExamples.push(
            `No se encontro objetivo para ruta (${routeKey}) y product_name (${product}) del team (${expected.teamId})`,
          );
        }
        criticalDetails.push({
          severity: "critical",
          code: "missing_required_objective",
          sourceType: "private+drilldown",
          sourceFileName: null,
          sourceSheetName: null,
          rowNumber: 0,
          route: routeKey,
          productName: product,
          teamId: expected.teamId,
          message: `No se encontro objetivo para ruta (${routeKey}) y product_name (${product}) del team (${expected.teamId})`,
          actionSuggestion:
            "Carga objetivo para la combinacion requerida de ruta + product_name segun reglas vigentes del team.",
        });
        const teamBucket = teamMissingMap.get(expected.teamId) ?? { count: 0, examples: [] };
        teamBucket.count += 1;
        if (teamBucket.examples.length < 3) {
          teamBucket.examples.push(`${routeKey} | ${product}`);
        }
        teamMissingMap.set(expected.teamId, teamBucket);
      }
    }
  }

  const teamAlerts = Array.from(teamMissingMap.entries())
    .map(([teamId, info]) => ({
      teamId,
      missingCount: info.count,
      missingExamples: info.examples,
    }))
    .sort((a, b) => b.missingCount - a.missingCount);

  const summary: ObjectivesPreviewSummary = {
    parsedRows: params.parsedInput.rowsForPeriod.length,
    validRows: validRowsForInsert.length,
    invalidRows: params.parsedInput.invalidRows.length + invalidRowsComputed.length,
    skippedByPeriod: params.parsedInput.skippedByPeriod,
    duplicatedRows,
    expectedRequiredCount,
    coveredRequiredCount,
    missingRequiredCount: Math.max(0, expectedRequiredCount - coveredRequiredCount),
    criticalCount: Math.max(0, expectedRequiredCount - coveredRequiredCount),
    warningCount: invalidDetails.length,
    routesWithMissingCount: new Set(missingExamples.map((item) => item.split("|")[0].trim())).size,
    criticalExamples,
    warningExamples: invalidExamples,
    invalidExamples,
    criticalDetails,
    invalidDetails,
    missingExamples,
    teamAlerts,
    sourceBreakdown: params.parsedInput.sourceBreakdown,
  };

  return {
    summary,
    validRowsForInsert,
    hasStatusData: routeToTeam.size > 0,
    hasRuleDefinitions: requiredProductsByTeam.size > 0,
  };
}
