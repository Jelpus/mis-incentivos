"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
  normalizeSourceFileCode,
  sanitizeStoragePathChunk,
} from "@/lib/admin/incentive-rules/shared";
import {
  createNormalizedRuleDefinition,
  loadRuleDefinitionsByIds,
} from "@/lib/admin/incentive-rules/rule-definition-normalized";
import { TEAM_RULE_REFERENCE_VALUES } from "@/lib/admin/incentive-rules/rule-catalog";
import {
  insertBigQueryRows,
  isBigQueryConfigured,
  runBigQueryQuery,
  validateBigQueryTableConnection,
} from "@/lib/integrations/bigquery";
import type { SupabaseClient } from "@supabase/supabase-js";

type SaveTeamRuleResult =
  | {
      ok: true;
      message: string;
      versionNo: number;
    }
  | {
      ok: false;
      message: string;
    };

type UploadTeamRulesFromExcelResult =
  | {
      ok: true;
      message: string;
      periodMonth: string;
      sheetName: string;
      processedRows: number;
      createdTeams: number;
      skippedEmptyRows: number;
      ignoredTeams: string[];
      missingTeamsFromFile: string[];
      warnings: string[];
    }
  | {
      ok: false;
      message: string;
      validationErrors?: string[];
    };

type CloneTeamRulesPeriodResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type UploadTeamSourceFileResult =
  | {
      ok: true;
      message: string;
      fileCode: string;
      periodMonth: string;
      uploadedPath: string;
      normalizedRows: number;
      bigQueryStatus: "uploaded" | "skipped";
    }
  | {
      ok: false;
      message: string;
    };

type PreviewTeamSourceFileResult =
  | {
      ok: true;
      message: string;
      summary: {
        normalizedRows: number;
        rowsEligibleForBigQuery: number;
        droppedRowsBySchema: number;
        teamsWithRequirements: number;
        teamsFullyCovered: number;
        distinctMetrics: string[];
        distinctFuentes: string[];
        distinctMoleculas: string[];
        teamAlerts: Array<{
          teamId: string;
          missingCount: number;
          missingExamples: string[];
        }>;
      };
    }
  | {
      ok: false;
      message: string;
    };

const MAX_SOURCE_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const SOURCE_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const BIGQUERY_HEALTH_CACHE_TTL_MS = 10 * 60 * 1000;

type SourceConstraint = {
  metrics: Set<string>;
  fuentes: Set<string>;
};

type SourceValidationSnapshot = {
  requiredCodes: Set<string>;
  constraintsByFile: Map<string, SourceConstraint>;
  requirementsByFileAndTeam: Map<string, Map<string, SourceRequirement[]>>;
};

const sourceValidationSnapshotCache = new Map<
  string,
  { expiresAt: number; snapshot: SourceValidationSnapshot }
>();
const readyStorageBuckets = new Set<string>();
let bigQueryHealthCache: { key: string; expiresAt: number } | null = null;

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseOptionalNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanLike(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "true" || raw === "1" || raw === "si" || raw === "yes";
}

function sanitizeUploadedFileName(fileName: string): string {
  const safeName = sanitizeStoragePathChunk(fileName);
  if (!safeName) return "file";
  return safeName;
}

function normalizeUpperText(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.toUpperCase();
}

function normalizeLowerText(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return raw;
}

function normalizeCp(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 5) return digits.slice(0, 5);
  return digits.padStart(5, "0");
}

function normalizeCodigoEstado(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return String(Number(digits));
}

type NormalizedSourceRow = {
  archivo: string;
  institucion: string | null;
  cedula: string | null;
  medico: string | null;
  cp: string | null;
  estado: string | null;
  codigo_estado: string | null;
  brick: string | null;
  molecula_producto: string | null;
  valor: number | null;
  trimestre: number | null;
  trimestre_anterior: number | null;
  semestre: number | null;
  ytd: number | null;
  metric: string | null;
  fuente: string | null;
  periodo: string;
  meses: Record<string, number>;
};

type BigQuerySourceRow = {
  archivo: string | null;
  institucion: string | null;
  cedula: string | null;
  medico: string | null;
  cp: string | null;
  estado: string | null;
  codigo_estado: string | null;
  brick: string | null;
  molecula_producto: string | null;
  valor: number | null;
  trimestre: number | null;
  trimestre_anterior: number | null;
  semestre: number | null;
  ytd: string | null;
  metric: string | null;
  fuente: string | null;
  periodo: string | null;
};

const MONTH_BY_TOKEN: Record<string, number> = {
  ene: 1,
  enero: 1,
  jan: 1,
  febrero: 2,
  feb: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
};

function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(period: string, delta: number): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return toMonthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function detectHeaderMonthKey(header: string): string | null {
  const raw = String(header ?? "").trim();
  if (!raw) return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");

  let match = normalized.match(/^(\d{4})[-_/](\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return toMonthKey(year, month);
  }

  match = normalized.match(/^(\d{1,2})[-_/](\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month >= 1 && month <= 12) return toMonthKey(year, month);
  }

  match = normalized.match(/^([a-z]+)[-_/ ](\d{2,4})$/);
  if (match) {
    const month = MONTH_BY_TOKEN[match[1]];
    const rawYear = Number(match[2]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (month && year >= 2000 && year <= 2099) return toMonthKey(year, month);
  }

  match = normalized.match(/^(\d{2,4})[-_/ ]([a-z]+)$/);
  if (match) {
    const rawYear = Number(match[1]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const month = MONTH_BY_TOKEN[match[2]];
    if (month && year >= 2000 && year <= 2099) return toMonthKey(year, month);
  }

  return null;
}

function readStringFromRow(
  row: Record<string, unknown>,
  normalizedMap: Map<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const key = normalizedMap.get(normalizeHeader(candidate));
    if (!key) continue;
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return null;
}

function readNumberFromRow(
  row: Record<string, unknown>,
  normalizedMap: Map<string, string>,
  candidates: string[],
): number | null {
  for (const candidate of candidates) {
    const key = normalizedMap.get(normalizeHeader(candidate));
    if (!key) continue;
    const value = parseOptionalNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function sumMonths(months: Record<string, number>, periodMonthInput: string, startOffset: number, count: number): number | null {
  let sum = 0;
  let found = false;
  for (let index = 0; index < count; index += 1) {
    const key = shiftMonth(periodMonthInput, startOffset - index);
    const value = months[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      found = true;
    }
  }
  return found ? Number(sum.toFixed(6)) : null;
}

function extractMonthValues(row: Record<string, unknown>): Record<string, number> {
  const monthValues: Record<string, number> = {};
  for (const header of Object.keys(row)) {
    const monthKey = detectHeaderMonthKey(header);
    if (!monthKey) continue;
    const value = parseOptionalNumber(row[header]);
    if (value === null) continue;
    monthValues[monthKey] = value;
  }
  return monthValues;
}

function sanitizeBrick(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.toUpperCase().padStart(8, "0");
}

function shouldKeepByMetricFuente(
  row: Pick<NormalizedSourceRow, "metric" | "fuente">,
  allowedMetrics: Set<string>,
  allowedFuentes: Set<string>,
): boolean {
  const normalizedMetric = normalizeUpperText(row.metric);
  const normalizedFuentes = splitFuenteValues(row.fuente);

  const metricOk =
    allowedMetrics.size === 0 ||
    (normalizedMetric ? allowedMetrics.has(normalizedMetric) : false);
  const fuenteOk =
    allowedFuentes.size === 0 ||
    normalizedFuentes.some((fuente) => allowedFuentes.has(fuente));

  return metricOk && fuenteOk;
}

function normalizeRowsForBigQuery(params: {
  rows: Array<Record<string, unknown>>;
  periodMonth: string;
  fileCode: string;
  displayName: string;
  allowedMetrics: Set<string>;
  allowedFuentes: Set<string>;
}): NormalizedSourceRow[] {
  const periodMonthInput = params.periodMonth.slice(0, 7);
  const fileLogicKey = normalizeSourceFileCode(`${params.fileCode} ${params.displayName}`);
  const normalizedRows: NormalizedSourceRow[] = [];

  const pushIfValid = (row: NormalizedSourceRow) => {
    if (shouldKeepByMetricFuente(row, params.allowedMetrics, params.allowedFuentes)) {
      normalizedRows.push(row);
    }
  };

  const estadosDF: Record<string, string> = {
    AGS: "AGUASCALIENTES",
    BC: "BAJA CALIFORNIA NORTE",
    BCS: "BAJA CALIFORNIA SUR",
    CHI: "CHIHUAHUA",
    CHS: "CHIAPAS",
    CMP: "CAMPECHE",
    CMX: "DISTRITO FEDERAL",
    COA: "COAHUILA",
    COL: "COLIMA",
    DF: "DISTRITO FEDERAL",
    DGO: "DURANGO",
    GRO: "GUERRERO",
    GTO: "GUANAJUATO",
    HGO: "HIDALGO",
    JAL: "JALISCO",
    MCH: "MICHOACAN",
    MEX: "ESTADO DE MEXICO",
    MOR: "MORELOS",
    NAY: "NAYARIT",
    NL: "NUEVO LEON",
    OAX: "OAXACA",
    PUE: "PUEBLA",
    QR: "QUINTANA ROO",
    QRO: "QUERETARO",
    SIN: "SINALOA",
    SLP: "SAN LUIS POTOSI",
    SON: "SONORA",
    TAB: "TABASCO",
    TLX: "TLAXCALA",
    TMS: "TAMAULIPAS",
    VER: "VERACRUZ",
    YUC: "YUCATAN",
    ZAC: "ZACATECAS",
  };
  const diarioRegionCodigoEstado: Record<string, string> = {
    BC: "2",
    CHI: "6",
    CMX: "7",
    DF: "7",
    JAL: "15",
    NL: "19",
    PUE: "21",
    QRO: "22",
    SON: "26",
  };

  for (const rawRow of params.rows) {
    const row = rawRow ?? {};
    const headers = Object.keys(row);
    const normalizedHeaderMap = new Map<string, string>();
    for (const header of headers) {
      normalizedHeaderMap.set(normalizeHeader(header), header);
    }
    const monthValues = extractMonthValues(row);
    const ytdValue = readNumberFromRow(row, normalizedHeaderMap, ["ytd"]);
    const codigoEstado = normalizeCodigoEstado(
      readStringFromRow(row, normalizedHeaderMap, [
        "codigo_estado",
        "cod_estado",
        "codigo de estado",
        "state_code",
        "state code",
        "codigoestado",
      ]),
    );
    const institucion = normalizeUpperText(
      readStringFromRow(row, normalizedHeaderMap, [
        "institucion",
        "institución",
        "institution",
        "institucion_name",
        "nombre_institucion",
      ]),
    );

    if (fileLogicKey.includes("asignac")) {
      const producto = readStringFromRow(row, normalizedHeaderMap, [
        "producto",
        "product_name",
        "product",
      ]);
      const brick = normalizeLowerText(readStringFromRow(row, normalizedHeaderMap, ["ruta"]));
      pushIfValid({
        archivo: params.displayName || params.fileCode,
        institucion,
        cedula: null,
        medico: null,
        cp: null,
        estado: null,
        codigo_estado: codigoEstado,
        brick,
        molecula_producto: producto,
        valor: readNumberFromRow(row, normalizedHeaderMap, ["unidades"]) ?? 0,
        trimestre: null,
        trimestre_anterior: null,
        semestre: null,
        ytd: ytdValue,
        metric: "UNIDADES",
        fuente: "B2B",
        periodo: periodMonthInput,
        meses: monthValues,
      });
      continue;
    }

    if (fileLogicKey === "b2b_base") {
      const cp = normalizeCp(readStringFromRow(row, normalizedHeaderMap, ["cod_postal", "cp"]));
      const estado = readStringFromRow(row, normalizedHeaderMap, ["estado"]);
      const medico = normalizeLowerText(
        readStringFromRow(row, normalizedHeaderMap, ["nombre_medico", "medico"]),
      );
      pushIfValid({
        archivo: params.displayName || params.fileCode,
        institucion,
        cedula: readStringFromRow(row, normalizedHeaderMap, ["ced_profesional", "cedula"]),
        medico,
        cp,
        estado,
        codigo_estado: codigoEstado,
        brick: sanitizeBrick(readStringFromRow(row, normalizedHeaderMap, ["brick"])),
        molecula_producto: normalizeUpperText(
          readStringFromRow(row, normalizedHeaderMap, ["producto", "molecula_producto"]),
        ),
        valor: readNumberFromRow(row, normalizedHeaderMap, ["unidades"]) ?? 0,
        trimestre: null,
        trimestre_anterior: null,
        semestre: null,
        ytd: ytdValue,
        metric: "UNIDADES",
        fuente: "B2B",
        periodo: periodMonthInput,
        meses: monthValues,
      });
      continue;
    }

    if (fileLogicKey.includes("ddd")) {
      const month01 = readNumberFromRow(row, normalizedHeaderMap, ["month01"]) ?? 0;
      const month02 = readNumberFromRow(row, normalizedHeaderMap, ["month02"]) ?? 0;
      const month03 = readNumberFromRow(row, normalizedHeaderMap, ["month03"]) ?? 0;
      const month04 = readNumberFromRow(row, normalizedHeaderMap, ["month04"]) ?? 0;
      const month05 = readNumberFromRow(row, normalizedHeaderMap, ["month05"]) ?? 0;
      const month06 = readNumberFromRow(row, normalizedHeaderMap, ["month06"]) ?? 0;
      const productRaw = readStringFromRow(row, normalizedHeaderMap, [
        "product_id",
        "product",
        "producto",
      ]);
      const cleanedProduct = (productRaw ?? "").replace(/\s+NVR$/i, "").trim();
      pushIfValid({
        archivo: params.displayName || params.fileCode,
        institucion,
        cedula: null,
        medico: null,
        cp: null,
        estado: null,
        codigo_estado: codigoEstado,
        brick: sanitizeBrick(readStringFromRow(row, normalizedHeaderMap, ["brick"])),
        molecula_producto: normalizeUpperText(cleanedProduct),
        valor: month01,
        trimestre: month01 + month02 + month03,
        trimestre_anterior: month04 + month05 + month06,
        semestre: month01 + month02 + month03 + month04 + month05 + month06,
        ytd: ytdValue,
        metric:
          readStringFromRow(row, normalizedHeaderMap, ["metrics", "metric"]) ?? "UNIDADES",
        fuente: "DDD",
        periodo: periodMonthInput,
        meses: monthValues,
      });
      continue;
    }

    if (fileLogicKey.includes("diario")) {
      const material = readStringFromRow(row, normalizedHeaderMap, ["material"]);
      const finalClient = normalizeLowerText(
        readStringFromRow(row, normalizedHeaderMap, ["final_client_description"]),
      );
      if (!material) continue;
      if (finalClient === "issste" || finalClient === "imss") continue;

      const brickParts = [
        normalizeUpperText(readStringFromRow(row, normalizedHeaderMap, ["final_client_description"])),
        normalizeUpperText(readStringFromRow(row, normalizedHeaderMap, ["customer_name"])),
        normalizeUpperText(readStringFromRow(row, normalizedHeaderMap, ["purchase_order_number"])),
      ].filter((value): value is string => Boolean(value));

      const region = normalizeUpperText(readStringFromRow(row, normalizedHeaderMap, ["region"]));
      const codigoEstadoFromRegion = region ? diarioRegionCodigoEstado[region] ?? null : null;
      const resolvedCodigoEstado = codigoEstado ?? codigoEstadoFromRegion ?? "999";

      pushIfValid({
        archivo: params.displayName || params.fileCode,
        institucion:
          institucion ??
          normalizeUpperText(readStringFromRow(row, normalizedHeaderMap, ["final_client_description"])),
        cedula: null,
        medico: null,
        cp: null,
        estado: region ? estadosDF[region] ?? region : null,
        codigo_estado: resolvedCodigoEstado,
        brick: brickParts.length > 0 ? brickParts.join("-") : null,
        molecula_producto: String(material),
        valor: readNumberFromRow(row, normalizedHeaderMap, ["billed_quantity"]) ?? 0,
        trimestre: null,
        trimestre_anterior: null,
        semestre: null,
        ytd: readNumberFromRow(row, normalizedHeaderMap, ["billed_quantity"]) ?? 0,
        metric: "UNIDADES",
        fuente: "DF",
        periodo: periodMonthInput,
        meses: monthValues,
      });
      continue;
    }

    if (fileLogicKey.includes("iqvia")) {
      const clueId = readStringFromRow(row, normalizedHeaderMap, ["clue_id"]);
      const molecula = readStringFromRow(row, normalizedHeaderMap, ["molecula_h"]);
      const metric = readStringFromRow(row, normalizedHeaderMap, ["metric"]);
      const fuente = readStringFromRow(row, normalizedHeaderMap, ["fuente_db"]);
      if (!clueId || !molecula || !metric || !fuente) continue;

      const month01 = readNumberFromRow(row, normalizedHeaderMap, ["month01"]) ?? 0;
      const month02 = readNumberFromRow(row, normalizedHeaderMap, ["month02"]) ?? 0;
      const month03 = readNumberFromRow(row, normalizedHeaderMap, ["month03"]) ?? 0;
      const month04 = readNumberFromRow(row, normalizedHeaderMap, ["month04"]) ?? 0;
      const month05 = readNumberFromRow(row, normalizedHeaderMap, ["month05"]) ?? 0;
      const month06 = readNumberFromRow(row, normalizedHeaderMap, ["month06"]) ?? 0;

      pushIfValid({
        archivo: params.displayName || params.fileCode,
        institucion,
        cedula: null,
        medico: null,
        cp: null,
        estado: null,
        codigo_estado: codigoEstado,
        brick: normalizeUpperText(clueId),
        molecula_producto: normalizeUpperText(molecula),
        valor: month01,
        trimestre: month01 + month02 + month03,
        trimestre_anterior: month04 + month05 + month06,
        semestre: month01 + month02 + month03 + month04 + month05 + month06,
        ytd: ytdValue,
        metric,
        fuente,
        periodo: periodMonthInput,
        meses: monthValues,
      });
      continue;
    }

    if (fileLogicKey.includes("contacto")) {
      const sku = readStringFromRow(row, normalizedHeaderMap, ["sku_number"]);
      const quantity = readNumberFromRow(row, normalizedHeaderMap, ["quantity"]);
      const hcp = readStringFromRow(row, normalizedHeaderMap, ["hcp_full_name"]);
      if (!sku || quantity === null || !hcp) continue;

      pushIfValid({
        archivo: params.displayName || params.fileCode,
        institucion,
        cedula: null,
        medico: normalizeLowerText(hcp),
        cp: null,
        estado: null,
        codigo_estado: codigoEstado,
        brick: null,
        molecula_producto: String(sku),
        valor: quantity,
        trimestre: null,
        trimestre_anterior: null,
        semestre: null,
        ytd: ytdValue,
        metric: "QUANTITY",
        fuente: "CONTACTO",
        periodo: periodMonthInput,
        meses: monthValues,
      });
      continue;
    }

    const cedula = readStringFromRow(row, normalizedHeaderMap, ["cedula", "id", "no_empleado"]);
    const medico = readStringFromRow(row, normalizedHeaderMap, [
      "medico",
      "nombre_medico",
      "doctor",
    ]);
    const cp = readStringFromRow(row, normalizedHeaderMap, ["cp", "codigo_postal"]);
    const estado = readStringFromRow(row, normalizedHeaderMap, ["estado"]);
    const brick = readStringFromRow(row, normalizedHeaderMap, ["brick"]);
    const moleculaProducto = readStringFromRow(row, normalizedHeaderMap, [
      "molecula_producto",
      "molecula",
      "molecula_h",
      "molecula_d",
      "producto",
    ]);
    const metric = readStringFromRow(row, normalizedHeaderMap, ["metric", "metrica"]);
    const fuente = readStringFromRow(row, normalizedHeaderMap, [
      "fuente",
      "source",
      "fuente_d",
      "fuente_db",
    ]);
    const month01Value = readNumberFromRow(row, normalizedHeaderMap, [
      "month01",
      "month1",
      "mes01",
      "mes1",
    ]);
    const valor =
      monthValues[periodMonthInput] ??
      month01Value ??
      readNumberFromRow(row, normalizedHeaderMap, ["valor", "value"]);

    const hasContent =
      Object.keys(monthValues).length > 0 ||
      cedula ||
      medico ||
      cp ||
      estado ||
      brick ||
      moleculaProducto ||
      metric ||
      fuente ||
      ytdValue !== null ||
      valor !== null;

    if (!hasContent) continue;

    pushIfValid({
      archivo: params.displayName || params.fileCode,
      institucion,
      cedula,
      medico,
      cp,
      estado,
      codigo_estado: codigoEstado,
      brick,
      molecula_producto: moleculaProducto,
      valor,
      trimestre:
        readNumberFromRow(row, normalizedHeaderMap, ["trimestre"]) ??
        sumMonths(monthValues, periodMonthInput, 0, 3),
      trimestre_anterior:
        readNumberFromRow(row, normalizedHeaderMap, ["trimestre_anterior"]) ??
        sumMonths(monthValues, periodMonthInput, -3, 3),
      semestre:
        readNumberFromRow(row, normalizedHeaderMap, ["semestre"]) ??
        sumMonths(monthValues, periodMonthInput, 0, 6),
      ytd: ytdValue,
      metric,
      fuente,
      periodo: periodMonthInput,
      meses: monthValues,
    });
  }

  return normalizedRows;
}

function sanitizeStringOrNull(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function sanitizeNumberOrNull(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function isBigQueryStreamingBufferMutationError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("streaming buffer") &&
    (normalized.includes("update or delete") || normalized.includes("would affect rows"))
  );
}

function sanitizeNumericStringOrNull(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  // BigQuery NUMERIC accepts up to 9 decimal digits in canonical decimal form.
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  const serialized = rounded.toFixed(9).replace(/\.?0+$/, "");

  if (serialized === "-0") return "0";
  return serialized;
}

function mapNormalizedRowsToBigQuerySchema(
  rows: NormalizedSourceRow[],
): { rows: BigQuerySourceRow[]; droppedRows: number } {
  const mappedRows: BigQuerySourceRow[] = [];
  let droppedRows = 0;

  for (const row of rows) {
    const mapped: BigQuerySourceRow = {
      archivo: sanitizeStringOrNull(row.archivo),
      institucion: sanitizeStringOrNull(row.institucion),
      cedula: sanitizeStringOrNull(row.cedula),
      medico: sanitizeStringOrNull(row.medico),
      cp: sanitizeStringOrNull(row.cp),
      estado: sanitizeStringOrNull(row.estado),
      codigo_estado: sanitizeStringOrNull(row.codigo_estado),
      brick: sanitizeStringOrNull(row.brick),
      molecula_producto: sanitizeStringOrNull(row.molecula_producto),
      valor: sanitizeNumberOrNull(row.valor),
      trimestre: sanitizeNumberOrNull(row.trimestre),
      trimestre_anterior: sanitizeNumberOrNull(row.trimestre_anterior),
      semestre: sanitizeNumberOrNull(row.semestre),
      ytd: sanitizeNumericStringOrNull(row.ytd),
      metric: sanitizeStringOrNull(row.metric),
      fuente: sanitizeStringOrNull(row.fuente),
      periodo: sanitizeStringOrNull(row.periodo),
    };

    // Aunque la tabla los permite null, sin archivo/periodo la fila no es util para trazabilidad.
    if (!mapped.archivo || !mapped.periodo) {
      droppedRows += 1;
      continue;
    }

    mappedRows.push(mapped);
  }

  return { rows: mappedRows, droppedRows };
}

function collectSourceFileCodesFromRuleDefinition(
  ruleDefinition: Record<string, unknown> | null,
): Set<string> {
  const codes = new Set<string>();
  const rules = Array.isArray(ruleDefinition?.rules) ? ruleDefinition.rules : [];

  for (const item of rules) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    if (Array.isArray(row.sources)) {
      for (const sourceItem of row.sources) {
        if (!sourceItem || typeof sourceItem !== "object") continue;
        const source = sourceItem as Record<string, unknown>;
        const code = normalizeSourceFileCode(source.file);
        if (code) codes.add(code);
      }
      continue;
    }

    for (const legacyKey of ["file1", "file2", "file3"]) {
      const code = normalizeSourceFileCode(row[legacyKey]);
      if (code) codes.add(code);
    }
  }

  return codes;
}

function collectSourceConstraintsForFileFromRuleDefinition(
  ruleDefinition: Record<string, unknown> | null,
  targetFileCode: string,
): { metrics: Set<string>; fuentes: Set<string> } {
  const metrics = new Set<string>();
  const fuentes = new Set<string>();
  const rules = Array.isArray(ruleDefinition?.rules) ? ruleDefinition.rules : [];

  for (const item of rules) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    if (Array.isArray(row.sources)) {
      for (const sourceItem of row.sources) {
        if (!sourceItem || typeof sourceItem !== "object") continue;
        const source = sourceItem as Record<string, unknown>;
        const fileCode = normalizeSourceFileCode(source.file);
        if (fileCode !== targetFileCode) continue;

        const metric = normalizeUpperText(source.metric);
        if (metric) metrics.add(metric);
        for (const fuente of splitFuenteValues(source.fuente)) {
          fuentes.add(fuente);
        }
      }
      continue;
    }

    for (let index = 1; index <= 8; index += 1) {
      const fileCode = normalizeSourceFileCode(row[`file${index}`]);
      if (fileCode !== targetFileCode) continue;

      const metric = normalizeUpperText(row[`metric${index}`]);
      if (metric) metrics.add(metric);
      for (const fuente of splitFuenteValues(row[`fuente${index}`])) {
        fuentes.add(fuente);
      }
    }
  }

  return { metrics, fuentes };
}

type SourceRequirement = {
  metric: string | null;
  fuentes: string[];
  molecules: string[];
};

function splitFuenteValues(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  return Array.from(
    new Set(
      raw
        .split(/[\/,;|]+/g)
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0),
    ),
  );
}

function splitMoleculeValues(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  return Array.from(
    new Set(
      raw
        .split(/[\/,;|]+/g)
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0),
    ),
  );
}

function toRequirementKey(requirement: SourceRequirement): string {
  return [
    requirement.metric ?? "",
    requirement.fuentes.slice().sort().join("|"),
    requirement.molecules.slice().sort().join("|"),
  ].join("::");
}

function collectRequirementsByTeamFromRuleDefinition(
  ruleDefinition: Record<string, unknown> | null,
  targetFileCode: string,
): Map<string, SourceRequirement[]> {
  const result = new Map<string, SourceRequirement[]>();
  const rules = Array.isArray(ruleDefinition?.rules) ? ruleDefinition.rules : [];

  for (const item of rules) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const meta =
      ruleDefinition && typeof ruleDefinition.meta === "object" && ruleDefinition.meta
        ? (ruleDefinition.meta as Record<string, unknown>)
        : null;
    const teamId = String(row.team_id ?? meta?.team_id ?? "")
      .trim()
      .toUpperCase();
    if (!teamId) continue;

    const addRequirement = (metric: unknown, fuente: unknown, molecule: unknown) => {
      const metricValue = normalizeUpperText(metric);
      const fuenteValues = splitFuenteValues(fuente);
      const moleculeValues = splitMoleculeValues(molecule);
      const current = result.get(teamId) ?? [];
      if (moleculeValues.length === 0) {
        current.push({
          metric: metricValue,
          fuentes: fuenteValues,
          molecules: [],
        });
      } else {
        // "JAKAVI / SCEMBLIX" debe evaluarse como dos requerimientos (uno por molecula).
        for (const moleculeValue of moleculeValues) {
          current.push({
            metric: metricValue,
            fuentes: fuenteValues,
            molecules: [moleculeValue],
          });
        }
      }
      result.set(teamId, current);
    };

    if (Array.isArray(row.sources)) {
      for (const sourceItem of row.sources) {
        if (!sourceItem || typeof sourceItem !== "object") continue;
        const source = sourceItem as Record<string, unknown>;
        const fileCode = normalizeSourceFileCode(source.file);
        if (fileCode !== targetFileCode) continue;
        addRequirement(source.metric, source.fuente, source.molecula_producto);
      }
      continue;
    }

    for (let index = 1; index <= 8; index += 1) {
      const fileCode = normalizeSourceFileCode(row[`file${index}`]);
      if (fileCode !== targetFileCode) continue;
      addRequirement(row[`metric${index}`], row[`fuente${index}`], row[`molecula_producto${index}`]);
    }
  }

  return result;
}

function doesRowMeetRequirement(row: NormalizedSourceRow, requirement: SourceRequirement): boolean {
  const rowMetric = normalizeUpperText(row.metric);
  const rowFuentes = splitFuenteValues(row.fuente);
  const rowMolecule = normalizeUpperText(row.molecula_producto);

  if (requirement.metric && rowMetric !== requirement.metric) {
    return false;
  }
  if (requirement.fuentes.length > 0) {
    if (rowFuentes.length === 0) return false;
    const hasMatchingFuente = rowFuentes.some((fuente) => requirement.fuentes.includes(fuente));
    if (!hasMatchingFuente) return false;
  }
  if (requirement.molecules.length > 0) {
    if (!rowMolecule) return false;
    const matched = requirement.molecules.some((molecule) => rowMolecule.includes(molecule));
    if (!matched) return false;
  }

  return true;
}

function buildRequirementLabel(requirement: SourceRequirement): string {
  const conditions: string[] = [];
  if (requirement.fuentes.length === 1) {
    conditions.push(`fuente "${requirement.fuentes[0]}"`);
  } else if (requirement.fuentes.length > 1) {
    conditions.push(`fuente "${requirement.fuentes.join('" o "')}"`);
  }
  if (requirement.metric) conditions.push(`metrica "${requirement.metric}"`);
  if (requirement.molecules.length > 0) {
    conditions.push(`molecula que contenga "${requirement.molecules.join('" o "')}"`);
  }

  if (conditions.length === 0) {
    return "No se encontro una fila que cumpla una condicion requerida.";
  }

  return `No se encontro ninguna fila con ${conditions.join(", ")}.`;
}

function normalizePeriodMonthOrFail(rawInput: string): string | null {
  const normalized = normalizePeriodMonthInput(rawInput);
  return normalized;
}

function cloneRuleDefinitionWithNewPeriod(
  ruleDefinition: Record<string, unknown> | null,
  targetPeriod: string,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    ruleDefinition && typeof ruleDefinition === "object" && !Array.isArray(ruleDefinition)
      ? { ...ruleDefinition }
      : {};

  const meta =
    base.meta && typeof base.meta === "object" && !Array.isArray(base.meta)
      ? { ...(base.meta as Record<string, unknown>) }
      : {};

  meta.period_month = targetPeriod;
  meta.cloned_at = new Date().toISOString();
  base.meta = meta;

  return base;
}

async function loadLatestRuleDefinitionsByTeamForPeriod(
  supabase: SupabaseClient,
  periodMonth: string,
): Promise<
  | {
      ok: true;
      latestByTeam: Map<
        string,
        {
          versionNo: number;
          ruleDefinitionId: string;
          ruleDefinition: Record<string, unknown> | null;
        }
      >;
      rows: Array<{
        team_id: string;
        version_no: number;
        rule_definition_id: string;
      }>;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const rowsResult = await supabase
    .from("team_incentive_rule_versions")
    .select("team_id, version_no, rule_definition_id")
    .eq("period_month", periodMonth)
    .order("team_id", { ascending: true })
    .order("version_no", { ascending: false });

  if (rowsResult.error) {
    if (isMissingRelationError(rowsResult.error)) {
      const tableName =
        getMissingRelationName(rowsResult.error) ?? "team_incentive_rule_versions";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-rules-schema.sql para crearla.`,
      };
    }
    return {
      ok: false,
      message: rowsResult.error.message,
    };
  }

  const rows = (rowsResult.data ?? []) as Array<{
    team_id: string;
    version_no: number;
    rule_definition_id: string;
  }>;

  const definitionIds = rows
    .map((row) => String(row.rule_definition_id ?? "").trim())
    .filter((value) => value.length > 0);

  let definitionsById: Map<string, Record<string, unknown>>;
  try {
    definitionsById = await loadRuleDefinitionsByIds({
      supabase,
      definitionIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer definiciones.";
    const tableName =
      getMissingRelationName({ message }) ?? "team_rule_definitions / team_rule_definition_items";
    return {
      ok: false,
      message: `No existe la tabla ${tableName}. Revisa docs/team-rule-definitions-normalized-schema.sql para crearla.`,
    };
  }

  const latestByTeam = new Map<
    string,
    {
      versionNo: number;
      ruleDefinitionId: string;
      ruleDefinition: Record<string, unknown> | null;
    }
  >();

  for (const row of rows) {
    const teamId = String(row.team_id ?? "").trim();
    const definitionId = String(row.rule_definition_id ?? "").trim();
    if (!teamId || !definitionId || latestByTeam.has(teamId)) continue;

    latestByTeam.set(teamId, {
      versionNo: Number(row.version_no ?? 0),
      ruleDefinitionId: definitionId,
      ruleDefinition: definitionsById.get(definitionId) ?? null,
    });
  }

  return {
    ok: true,
    latestByTeam,
    rows,
  };
}

function getEmptySourceConstraint(): SourceConstraint {
  return { metrics: new Set<string>(), fuentes: new Set<string>() };
}

function mergeRequirements(
  target: SourceRequirement[],
  source: SourceRequirement[],
): SourceRequirement[] {
  if (source.length === 0) return target;
  target.push(...source);
  return target;
}

async function getSourceValidationSnapshotForPeriod(
  supabase: SupabaseClient,
  periodMonth: string,
): Promise<
  | { ok: true; snapshot: SourceValidationSnapshot }
  | { ok: false; message: string }
> {
  const now = Date.now();
  const cached = sourceValidationSnapshotCache.get(periodMonth);
  if (cached && cached.expiresAt > now) {
    return { ok: true, snapshot: cached.snapshot };
  }

  const rulesLoad = await loadLatestRuleDefinitionsByTeamForPeriod(supabase, periodMonth);
  if (!rulesLoad.ok) {
    return { ok: false, message: rulesLoad.message };
  }

  const requiredCodes = new Set<string>();
  const constraintsByFile = new Map<string, SourceConstraint>();
  const requirementsByFileAndTeam = new Map<string, Map<string, SourceRequirement[]>>();

  for (const [, value] of rulesLoad.latestByTeam.entries()) {
    const definition = value.ruleDefinition;
    if (!definition) continue;

    const definitionCodes = collectSourceFileCodesFromRuleDefinition(definition);
    for (const code of definitionCodes) {
      requiredCodes.add(code);

      const fileConstraints = collectSourceConstraintsForFileFromRuleDefinition(definition, code);
      const currentConstraint = constraintsByFile.get(code) ?? getEmptySourceConstraint();
      for (const metric of fileConstraints.metrics) currentConstraint.metrics.add(metric);
      for (const fuente of fileConstraints.fuentes) currentConstraint.fuentes.add(fuente);
      constraintsByFile.set(code, currentConstraint);

      const teamRequirements = collectRequirementsByTeamFromRuleDefinition(definition, code);
      const currentByTeam = requirementsByFileAndTeam.get(code) ?? new Map<string, SourceRequirement[]>();
      for (const [teamId, reqs] of teamRequirements.entries()) {
        const currentReqs = currentByTeam.get(teamId) ?? [];
        currentByTeam.set(teamId, mergeRequirements(currentReqs, reqs));
      }
      requirementsByFileAndTeam.set(code, currentByTeam);
    }
  }

  const snapshot: SourceValidationSnapshot = {
    requiredCodes,
    constraintsByFile,
    requirementsByFileAndTeam,
  };

  sourceValidationSnapshotCache.set(periodMonth, {
    expiresAt: now + SOURCE_VALIDATION_CACHE_TTL_MS,
    snapshot,
  });

  return { ok: true, snapshot };
}

async function ensureStorageBucketReady(
  supabase: SupabaseClient,
  bucketName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (readyStorageBuckets.has(bucketName)) {
    return { ok: true };
  }

  const bucketCheckResult = await supabase.storage.getBucket(bucketName);
  if (bucketCheckResult.error) {
    const message = String(bucketCheckResult.error.message ?? "").toLowerCase();
    const notFound =
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("bucket");

    if (notFound) {
      const createBucketResult = await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: "50MB",
      });

      if (createBucketResult.error) {
        return {
          ok: false,
          message: `No existe el bucket "${bucketName}" y no se pudo crear automaticamente: ${createBucketResult.error.message}`,
        };
      }
      readyStorageBuckets.add(bucketName);
      return { ok: true };
    }

    return {
      ok: false,
      message: `No se pudo validar bucket "${bucketName}": ${bucketCheckResult.error.message}`,
    };
  }

  readyStorageBuckets.add(bucketName);
  return { ok: true };
}

async function ensureBigQueryTableHealthCached(datasetId: string, tableId: string): Promise<void> {
  const cacheKey = `${datasetId}.${tableId}`;
  const now = Date.now();
  if (bigQueryHealthCache && bigQueryHealthCache.key === cacheKey && bigQueryHealthCache.expiresAt > now) {
    return;
  }

  await validateBigQueryTableConnection({ datasetId, tableId });
  bigQueryHealthCache = {
    key: cacheKey,
    expiresAt: now + BIGQUERY_HEALTH_CACHE_TTL_MS,
  };
}

export async function cloneTeamRulesPeriodAction(
  _prevState: CloneTeamRulesPeriodResult | null,
  formData: FormData,
): Promise<CloneTeamRulesPeriodResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const sourcePeriodInput = String(formData.get("source_period") ?? "").trim();
  const targetPeriodInput = String(formData.get("target_period") ?? "").trim();

  const sourcePeriodMonth = normalizePeriodMonthOrFail(sourcePeriodInput);
  const targetPeriodMonth = normalizePeriodMonthOrFail(targetPeriodInput);

  if (!sourcePeriodMonth || !targetPeriodMonth) {
    return {
      ok: false,
      message: "Periodos invalidos. Usa formato YYYY-MM.",
    };
  }

  if (sourcePeriodMonth === targetPeriodMonth) {
    return {
      ok: false,
      message: "El periodo origen y destino no pueden ser iguales.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const targetPeriodStatusValidation = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", targetPeriodMonth)
    .eq("is_deleted", false);

  if (targetPeriodStatusValidation.error) {
    return {
      ok: false,
      message: `No se pudo validar periodo destino en status: ${targetPeriodStatusValidation.error.message}`,
    };
  }

  if ((targetPeriodStatusValidation.count ?? 0) <= 0) {
    return {
      ok: false,
      message: "El periodo destino no existe en Status y no se puede actualizar.",
    };
  }

  const sourceRowsLoad = await loadLatestRuleDefinitionsByTeamForPeriod(
    supabase,
    sourcePeriodMonth,
  );
  if (!sourceRowsLoad.ok) {
    return {
      ok: false,
      message: `No se pudo leer el periodo origen: ${sourceRowsLoad.message}`,
    };
  }

  const sourceRows = sourceRowsLoad.rows;
  if (sourceRows.length === 0) {
    return {
      ok: false,
      message: "El periodo origen no tiene datos para clonar.",
    };
  }
  const latestByTeam = sourceRowsLoad.latestByTeam;

  const teamIds = Array.from(latestByTeam.keys());
  if (teamIds.length === 0) {
    return {
      ok: false,
      message: "No se encontraron team_id validos en el periodo origen.",
    };
  }

  const targetExistingResult = await supabase
    .from("team_incentive_rule_versions")
    .select("team_id")
    .eq("period_month", targetPeriodMonth)
    .in("team_id", teamIds);

  if (targetExistingResult.error) {
    return {
      ok: false,
      message: `No se pudo validar el periodo destino: ${targetExistingResult.error.message}`,
    };
  }

  const targetExistingCount = (targetExistingResult.data ?? []).length;
  if (targetExistingCount > 0) {
    return {
      ok: false,
      message: "El periodo destino ya tiene reglas para uno o mas teams.",
    };
  }

  const insertPayload: Array<{
    period_month: string;
    team_id: string;
    version_no: number;
    change_note: string;
    source_type: string;
    created_by: string;
    rule_definition_id: string;
  }> = [];

  for (const teamId of teamIds) {
    const sourceVersion = latestByTeam.get(teamId);
    const clonedDefinition = cloneRuleDefinitionWithNewPeriod(
      sourceVersion?.ruleDefinition ?? null,
      targetPeriodMonth,
    );
    let definitionId: string;
    try {
      definitionId = await createNormalizedRuleDefinition({
        supabase,
        teamId,
        periodMonth: targetPeriodMonth,
        sourceType: "period_clone",
        createdBy: user.id,
        ruleDefinition: clonedDefinition,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear definicion.";
      const tableName =
        getMissingRelationName({ message }) ?? "team_rule_definitions / team_rule_definition_items";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-rule-definitions-normalized-schema.sql para crearla.`,
      };
    }

    insertPayload.push({
      period_month: targetPeriodMonth,
      team_id: teamId,
      version_no: 1,
      change_note: `Clonado desde ${sourcePeriodMonth}`,
      source_type: "period_clone",
      created_by: user.id,
      rule_definition_id: definitionId,
    });
  }

  const insertResult = await supabase.from("team_incentive_rule_versions").insert(insertPayload);
  if (insertResult.error) {
    return {
      ok: false,
      message: `No se pudo clonar el periodo: ${insertResult.error.message}`,
    };
  }

  revalidatePath("/admin/incentive-rules");
  revalidatePath("/admin/data-sources");
  revalidateTag("admin-incentive-rules", "max");

  return {
    ok: true,
    message: `Se clonaron ${insertPayload.length} teams desde ${sourcePeriodMonth.slice(0, 7)} a ${targetPeriodMonth.slice(0, 7)}.`,
  };
}

export async function uploadTeamRulesFromExcelAction(
  _prevState: UploadTeamRulesFromExcelResult | null,
  formData: FormData,
): Promise<UploadTeamRulesFromExcelResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const file = formData.get("file");
  const periodInput = String(formData.get("period_month") ?? "").trim();
  const selectedSheetName = String(formData.get("sheet_name") ?? "").trim();
  const changeNote = String(formData.get("change_note") ?? "").trim();

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return {
      ok: false,
      message: "Periodo invalido. Usa formato YYYY-MM.",
    };
  }

  if (!(file instanceof File)) {
    return {
      ok: false,
      message: "Debes seleccionar un archivo Excel.",
    };
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    return {
      ok: false,
      message: "El archivo debe ser Excel (.xlsx o .xls).",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const targetPeriodStatusValidation = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (targetPeriodStatusValidation.error) {
    return {
      ok: false,
      message: `No se pudo validar periodo en status: ${targetPeriodStatusValidation.error.message}`,
    };
  }

  if ((targetPeriodStatusValidation.count ?? 0) <= 0) {
    return {
      ok: false,
      message: "El periodo seleccionado no existe en Status.",
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const { read, utils } = await import("xlsx");
  const workbook = read(Buffer.from(arrayBuffer), { type: "buffer" });
  const finalSheetName = selectedSheetName || workbook.SheetNames[0];

  if (!finalSheetName || !workbook.Sheets[finalSheetName]) {
    return {
      ok: false,
      message: "No se encontro la pestaña seleccionada en el archivo.",
    };
  }

  const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[finalSheetName], {
    defval: "",
  });

  if (rows.length === 0) {
    return {
      ok: false,
      message: "La hoja no contiene filas con datos.",
    };
  }

  const firstRowHeaders = Object.keys(rows[0] ?? {});
  const headerMap = new Map<string, string>();
  for (const header of firstRowHeaders) {
    headerMap.set(normalizeHeader(header), header);
  }

  const resolveHeader = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const found = headerMap.get(normalizeHeader(candidate));
      if (found) return found;
    }
    return null;
  };

  const requiredHeaderKeys = {
    teamId: resolveHeader(["team_id", "team id", "teamid"]),
    planTypeName: resolveHeader(["plan_type_name", "plan type name", "plan type"]),
    productName: resolveHeader(["product_name", "product name"]),
    prodWeight: resolveHeader(["prod_weight", "prod weight"]),
    agrupador: resolveHeader(["agrupador"]),
    curvaPago: resolveHeader(["curva_pago", "curva pago"]),
    elemento: resolveHeader(["elemento"]),
  };

  const missingRequiredHeaders = Object.entries(requiredHeaderKeys)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingRequiredHeaders.length > 0) {
    return {
      ok: false,
      message: "Faltan columnas requeridas en el Excel.",
      validationErrors: missingRequiredHeaders.map((key) => `Header faltante: ${key}`),
    };
  }

  const optionalHeaderKeys = {
    candado: resolveHeader(["candado"]),
    coberturaCandado: resolveHeader(["cobertura_candado", "cobertura candado"]),
    distribucionNoAsignada: resolveHeader([
      "distribucion no asignada",
      "distribucion_no_asignada",
    ]),
    ranking: resolveHeader(["ranking"]),
    puntosRankingLvu: resolveHeader([
      "puntos_ranking_lvu",
      "puntos ranking lvu",
      "puntos_ranking",
      "puntos ranking",
    ]),
    precioPromedio: resolveHeader([
      "precio promedio",
      "precio-promedio",
      "precio",
    ]),
  };

  const payCurvesResult = await supabase
    .from("team_incentive_pay_curves")
    .select("id, curve_code, curve_name")
    .eq("is_hidden", false);

  if (payCurvesResult.error) {
    if (isMissingRelationError(payCurvesResult.error)) {
      const tableName =
        getMissingRelationName(payCurvesResult.error) ?? "team_incentive_pay_curves";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }
    return {
      ok: false,
      message: `No se pudieron cargar curvas de pago: ${payCurvesResult.error.message}`,
    };
  }

  const payCurveAliasToId = new Map<string, string>();
  for (const item of payCurvesResult.data ?? []) {
    const row = item as {
      id?: string | null;
      curve_code?: string | null;
      curve_name?: string | null;
    };
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    payCurveAliasToId.set(id.toLowerCase(), id);

    const code = String(row.curve_code ?? "").trim();
    if (code) payCurveAliasToId.set(code.toLowerCase(), id);

    const name = String(row.curve_name ?? "").trim();
    if (name) payCurveAliasToId.set(name.toLowerCase(), id);
  }

  const fileHeaders: Array<{ file: string | null; fuente: string | null; molecula: string | null; metric: string | null }> = [];
  for (let index = 1; index <= 8; index += 1) {
    const fileHeader = resolveHeader([`file${index}`]);
    const fuenteHeader = resolveHeader([`fuente${index}`]);
    const moleculaHeader = resolveHeader([`molecula_producto${index}`]);
    const metricHeader = resolveHeader([`metric${index}`]);

    if (!fileHeader && !fuenteHeader && !moleculaHeader && !metricHeader) continue;

    fileHeaders.push({
      file: fileHeader,
      fuente: fuenteHeader,
      molecula: moleculaHeader,
      metric: metricHeader,
    });
  }

  const reservedNormalizedHeaders = new Set<string>([
    ...Object.values(requiredHeaderKeys).filter((value): value is string => Boolean(value)).map(
      (value) => normalizeHeader(value),
    ),
    ...Object.values(optionalHeaderKeys).filter((value): value is string => Boolean(value)).map(
      (value) => normalizeHeader(value),
    ),
  ]);

  for (const sourceHeader of fileHeaders) {
    if (sourceHeader.file) reservedNormalizedHeaders.add(normalizeHeader(sourceHeader.file));
    if (sourceHeader.fuente) reservedNormalizedHeaders.add(normalizeHeader(sourceHeader.fuente));
    if (sourceHeader.molecula) reservedNormalizedHeaders.add(normalizeHeader(sourceHeader.molecula));
    if (sourceHeader.metric) reservedNormalizedHeaders.add(normalizeHeader(sourceHeader.metric));
  }

  const validationErrors: string[] = [];
  const parsedRows: Array<{
    rowNumber: number;
    teamId: string;
    rule: Record<string, unknown>;
  }> = [];
  let skippedEmptyRows = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const excelRow = rows[index];
    const rowNumber = index + 2;

    const teamId = String(excelRow[requiredHeaderKeys.teamId as string] ?? "").trim();
    const productName = String(excelRow[requiredHeaderKeys.productName as string] ?? "").trim();
    const planTypeName = String(excelRow[requiredHeaderKeys.planTypeName as string] ?? "").trim();
    const agrupador = String(excelRow[requiredHeaderKeys.agrupador as string] ?? "").trim();
    const curvaPagoRaw = String(excelRow[requiredHeaderKeys.curvaPago as string] ?? "").trim();
    const curvaPagoResolvedId = payCurveAliasToId.get(curvaPagoRaw.toLowerCase()) ?? "";
    const elemento = String(excelRow[requiredHeaderKeys.elemento as string] ?? "").trim();
    const prodWeight = parseOptionalNumber(excelRow[requiredHeaderKeys.prodWeight as string]);
    const precioPromedioValue = optionalHeaderKeys.precioPromedio
      ? parseOptionalNumber(excelRow[optionalHeaderKeys.precioPromedio])
      : null;
    const calcularEnValores = precioPromedioValue !== null && precioPromedioValue > 1;

    const isTotallyEmpty =
      !teamId &&
      !productName &&
      !planTypeName &&
      !agrupador &&
      !curvaPagoRaw &&
      !elemento &&
      prodWeight === null;

    if (isTotallyEmpty) {
      skippedEmptyRows += 1;
      continue;
    }

    if (!teamId) validationErrors.push(`Fila ${rowNumber}: team_id requerido.`);
    if (!productName) validationErrors.push(`Fila ${rowNumber}: product_name requerido.`);
    if (!planTypeName) validationErrors.push(`Fila ${rowNumber}: plan_type_name requerido.`);
    if (!agrupador) validationErrors.push(`Fila ${rowNumber}: agrupador requerido.`);
    if (!curvaPagoRaw) {
      validationErrors.push(`Fila ${rowNumber}: curva_pago requerido.`);
    } else if (!curvaPagoResolvedId) {
      validationErrors.push(
        `Fila ${rowNumber}: curva_pago "${curvaPagoRaw}" no coincide con ninguna curva registrada (usa nombre, codigo o id existente).`,
      );
    }
    if (!elemento) validationErrors.push(`Fila ${rowNumber}: elemento requerido.`);
    if (prodWeight === null) validationErrors.push(`Fila ${rowNumber}: prod_weight numerico requerido.`);

    if (validationErrors.length > 60) {
      return {
        ok: false,
        message: "Se detectaron demasiados errores de validacion.",
        validationErrors: validationErrors.slice(0, 60),
      };
    }

    const sources = fileHeaders
      .map((headers, sourceIndex) => {
        const fileValue = headers.file ? String(excelRow[headers.file] ?? "").trim() : "";
        const fuenteValue = headers.fuente ? String(excelRow[headers.fuente] ?? "").trim() : "";
        const moleculaValue = headers.molecula
          ? String(excelRow[headers.molecula] ?? "").trim()
          : "";
        const metricValue = headers.metric ? String(excelRow[headers.metric] ?? "").trim() : "";

        const hasData = fileValue || fuenteValue || moleculaValue || metricValue;
        if (!hasData) return null;

        return {
          file: fileValue,
          fuente: fuenteValue,
          molecula_producto: moleculaValue,
          metric: metricValue,
          order: sourceIndex + 1,
        };
      })
      .filter((source): source is { file: string; fuente: string; molecula_producto: string; metric: string; order: number } => Boolean(source));

    const extraFields: Record<string, unknown> = {};
    for (const header of firstRowHeaders) {
      if (reservedNormalizedHeaders.has(normalizeHeader(header))) continue;
      const rawValue = excelRow[header];
      if (rawValue === null || rawValue === undefined) continue;
      const textValue = String(rawValue).trim();
      if (!textValue) continue;
      extraFields[header] = rawValue;
    }

    const rule = {
      rule_id: `${teamId}-${rowNumber}`,
      team_id: teamId,
      product_name: productName,
      plan_type_name: planTypeName,
      candado: optionalHeaderKeys.candado
        ? String(excelRow[optionalHeaderKeys.candado] ?? "").trim()
        : "",
      cobertura_candado: optionalHeaderKeys.coberturaCandado
        ? parseOptionalNumber(excelRow[optionalHeaderKeys.coberturaCandado])
        : null,
      distribucion_no_asignada: optionalHeaderKeys.distribucionNoAsignada
        ? parseBooleanLike(excelRow[optionalHeaderKeys.distribucionNoAsignada])
        : false,
      ranking: optionalHeaderKeys.ranking
        ? String(excelRow[optionalHeaderKeys.ranking] ?? "").trim()
        : "",
      puntos_ranking_lvu: optionalHeaderKeys.puntosRankingLvu
        ? parseOptionalNumber(excelRow[optionalHeaderKeys.puntosRankingLvu])
        : null,
      prod_weight: prodWeight,
      calcular_en_valores: calcularEnValores,
      precio_promedio: calcularEnValores ? precioPromedioValue : null,
      agrupador,
      curva_pago: curvaPagoResolvedId,
      curva_pago_id: curvaPagoResolvedId,
      elemento,
      file1: sources[0]?.file ?? "",
      fuente1: sources[0]?.fuente ?? "",
      molecula_producto1: sources[0]?.molecula_producto ?? "",
      metric1: sources[0]?.metric ?? "",
      file2: sources[1]?.file ?? "",
      fuente2: sources[1]?.fuente ?? "",
      molecula_producto2: sources[1]?.molecula_producto ?? "",
      metric2: sources[1]?.metric ?? "",
      file3: sources[2]?.file ?? "",
      fuente3: sources[2]?.fuente ?? "",
      molecula_producto3: sources[2]?.molecula_producto ?? "",
      metric3: sources[2]?.metric ?? "",
      sources,
      extra_fields: extraFields,
    };

    parsedRows.push({ rowNumber, teamId, rule });
  }

  if (validationErrors.length > 0) {
    return {
      ok: false,
      message: "No se pudo importar por errores de validacion.",
      validationErrors: validationErrors.slice(0, 60),
    };
  }

  if (parsedRows.length === 0) {
    return {
      ok: false,
      message: "No se encontraron filas validas para importar.",
    };
  }

  const importedTeamIds = Array.from(new Set(parsedRows.map((row) => row.teamId)));

  const { data: validTeamsData, error: validTeamsError } = await supabase
    .from("sales_force_status")
    .select("team_id")
    .eq("period_month", periodMonth)
    .eq("is_deleted", false)
    .in("team_id", importedTeamIds);

  if (validTeamsError) {
    return {
      ok: false,
      message: `No se pudo validar team_id contra status: ${validTeamsError.message}`,
    };
  }

  const validTeams = new Set(
    (validTeamsData ?? [])
      .map((row) => String(row.team_id ?? "").trim())
      .filter((value) => value.length > 0),
  );

  const ignoredTeams = importedTeamIds.filter((teamId) => !validTeams.has(teamId));
  const validParsedRows = parsedRows.filter((row) => validTeams.has(row.teamId));
  const validImportedTeamIds = Array.from(new Set(validParsedRows.map((row) => row.teamId)));

  if (validImportedTeamIds.length === 0) {
    return {
      ok: false,
      message: "No hay team_id validos para importar en el periodo seleccionado.",
      validationErrors: ignoredTeams.map((teamId) => `team_id ignorado por no existir en status: ${teamId}`),
    };
  }

  const allStatusTeamsResult = await supabase
    .from("sales_force_status")
    .select("team_id")
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (allStatusTeamsResult.error) {
    return {
      ok: false,
      message: `No se pudo validar cobertura contra status: ${allStatusTeamsResult.error.message}`,
    };
  }

  const allStatusTeams = new Set(
    (allStatusTeamsResult.data ?? [])
      .map((row) => String(row.team_id ?? "").trim())
      .filter((value) => value.length > 0),
  );

  const missingTeamsFromFile = Array.from(allStatusTeams).filter(
    (teamId) => !validImportedTeamIds.includes(teamId),
  );

  const latestVersionsResult = await supabase
    .from("team_incentive_rule_versions")
    .select("team_id, version_no")
    .eq("period_month", periodMonth)
    .in("team_id", validImportedTeamIds)
    .order("version_no", { ascending: false });

  if (latestVersionsResult.error) {
    if (isMissingRelationError(latestVersionsResult.error)) {
      const tableName =
        getMissingRelationName(latestVersionsResult.error) ?? "team_incentive_rule_versions";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-rules-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo leer versiones actuales: ${latestVersionsResult.error.message}`,
    };
  }

  const latestVersionByTeam = new Map<string, number>();
  for (const row of latestVersionsResult.data ?? []) {
    const teamId = String(row.team_id ?? "").trim();
    const versionNo = Number(row.version_no ?? 0);
    if (!teamId || !Number.isFinite(versionNo)) continue;
    if (!latestVersionByTeam.has(teamId) || versionNo > (latestVersionByTeam.get(teamId) ?? 0)) {
      latestVersionByTeam.set(teamId, versionNo);
    }
  }

  const rulesByTeam = new Map<string, Record<string, unknown>[]>();
  for (const row of validParsedRows) {
    const current = rulesByTeam.get(row.teamId) ?? [];
    current.push(row.rule);
    rulesByTeam.set(row.teamId, current);
  }

  const insertPayload: Array<{
    period_month: string;
    team_id: string;
    version_no: number;
    change_note: string;
    source_type: string;
    created_by: string;
    rule_definition_id: string;
  }> = [];

  for (const [teamId, rules] of rulesByTeam.entries()) {
    const nextVersion = (latestVersionByTeam.get(teamId) ?? 0) + 1;
    const definition = {
      schema_version: "team_rules_v2_excel_import",
      meta: {
        team_id: teamId,
        period_month: periodMonth,
        import_file_name: file.name,
        import_sheet_name: finalSheetName,
        imported_at: new Date().toISOString(),
        extra_headers: firstRowHeaders.filter(
          (header) => !reservedNormalizedHeaders.has(normalizeHeader(header)),
        ),
      },
      reference_values: TEAM_RULE_REFERENCE_VALUES,
      rules,
    };
    let definitionId: string;
    try {
      definitionId = await createNormalizedRuleDefinition({
        supabase,
        teamId,
        periodMonth,
        sourceType: "excel_import",
        createdBy: user.id,
        ruleDefinition: definition,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear definicion.";
      const tableName =
        getMissingRelationName({ message }) ?? "team_rule_definitions / team_rule_definition_items";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-rule-definitions-normalized-schema.sql para crearla.`,
      };
    }

    insertPayload.push({
      period_month: periodMonth,
      team_id: teamId,
      version_no: nextVersion,
      change_note:
        changeNote ||
        `Importado desde Excel: ${file.name} (${finalSheetName}) - ${new Date().toISOString()}`,
      source_type: "excel_import",
      created_by: user.id,
      rule_definition_id: definitionId,
    });
  }

  const insertResult = await supabase.from("team_incentive_rule_versions").insert(insertPayload);
  if (insertResult.error) {
    if (isMissingRelationError(insertResult.error)) {
      const tableName =
        getMissingRelationName(insertResult.error) ?? "team_incentive_rule_versions";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-rules-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo guardar la importacion: ${insertResult.error.message}`,
    };
  }

  revalidatePath("/admin/incentive-rules");
  revalidateTag("admin-incentive-rules", "max");
  for (const teamId of validImportedTeamIds) {
    revalidatePath(`/admin/incentive-rules/${encodeURIComponent(teamId)}`);
  }

  const warnings: string[] = [];
  if (ignoredTeams.length > 0) {
    warnings.push(
      `Se ignoraron ${ignoredTeams.length} team_id no existentes en status: ${ignoredTeams.join(", ")}`,
    );
  }
  if (missingTeamsFromFile.length > 0) {
    warnings.push(
      `Faltan ${missingTeamsFromFile.length} team_id de status en el archivo (importacion parcial).`,
    );
  }

  return {
    ok: true,
    message: "Importacion de reglas completada.",
    periodMonth,
    sheetName: finalSheetName,
    processedRows: validParsedRows.length,
    createdTeams: insertPayload.length,
    skippedEmptyRows,
    ignoredTeams,
    missingTeamsFromFile,
    warnings,
  };
}

export async function uploadTeamSourceFileAction(
  _prevState: UploadTeamSourceFileResult | null,
  formData: FormData,
): Promise<UploadTeamSourceFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const fileCodeInput = String(formData.get("file_code") ?? "").trim();
  const displayNameInput = String(formData.get("display_name") ?? "").trim();
  const sheetNameInput = String(formData.get("sheet_name") ?? "").trim();
  const uploadedFile = formData.get("file");

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido. Usa formato YYYY-MM." };
  }

  const fileCode = normalizeSourceFileCode(fileCodeInput);
  if (!fileCode) {
    return { ok: false, message: "Falta la clave de archivo a cargar." };
  }

  if (!(uploadedFile instanceof File)) {
    return { ok: false, message: "Debes seleccionar un archivo." };
  }

  if (uploadedFile.size <= 0) {
    return { ok: false, message: "El archivo seleccionado esta vacio." };
  }

  if (uploadedFile.size > MAX_SOURCE_FILE_SIZE_BYTES) {
    return { ok: false, message: "El archivo supera el limite de 50MB." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const statusPeriodValidation = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (statusPeriodValidation.error) {
    return {
      ok: false,
      message: `No se pudo validar el periodo destino en Status: ${statusPeriodValidation.error.message}`,
    };
  }

  if ((statusPeriodValidation.count ?? 0) <= 0) {
    return {
      ok: false,
      message: "El periodo seleccionado no existe en Status.",
    };
  }

  const snapshotResult = await getSourceValidationSnapshotForPeriod(supabase, periodMonth);
  if (!snapshotResult.ok) {
    return {
      ok: false,
      message: `No se pudo validar archivos requeridos desde reglas: ${snapshotResult.message}`,
    };
  }
  const requiredCodes = snapshotResult.snapshot.requiredCodes;
  const sourceConstraint = snapshotResult.snapshot.constraintsByFile.get(fileCode) ?? getEmptySourceConstraint();
  const allowedMetrics = sourceConstraint.metrics;
  const allowedFuentes = sourceConstraint.fuentes;

  if (requiredCodes.size === 0) {
    return {
      ok: false,
      message: "No hay archivos fuente requeridos para este periodo segun las reglas.",
    };
  }

  if (!requiredCodes.has(fileCode)) {
    return {
      ok: false,
      message:
        "La clave de archivo no existe en las reglas del periodo. Refresca la vista y selecciona un archivo requerido.",
    };
  }

  const bucketName =
    process.env.SUPABASE_TEAM_SOURCE_FILES_BUCKET ??
    process.env.NEXT_PUBLIC_SUPABASE_TEAM_SOURCE_FILES_BUCKET ??
    "team-incentive-source-files";

  const bucketReadyResult = await ensureStorageBucketReady(supabase, bucketName);
  if (!bucketReadyResult.ok) {
    return {
      ok: false,
      message: bucketReadyResult.message,
    };
  }

  const safeFileName = sanitizeUploadedFileName(uploadedFile.name);
  const safeCodeChunk = sanitizeStoragePathChunk(fileCode) || "source-file";
  const targetPath = `${periodMonth.slice(0, 7)}/${safeCodeChunk}/${Date.now()}-${safeFileName}`;
  const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());

  const uploadResult = await supabase.storage.from(bucketName).upload(targetPath, fileBuffer, {
    cacheControl: "3600",
    upsert: true,
    contentType: uploadedFile.type || undefined,
  });

  if (uploadResult.error) {
    return {
      ok: false,
      message: `No se pudo subir el archivo a storage: ${uploadResult.error.message}`,
    };
  }

  const metadataResult = await supabase.from("team_incentive_source_files").upsert(
    {
      period_month: periodMonth,
      file_code: fileCode,
      display_name: displayNameInput || fileCodeInput || fileCode,
      original_file_name: uploadedFile.name,
      storage_bucket: bucketName,
      storage_path: targetPath,
      content_type: uploadedFile.type || null,
      size_bytes: uploadedFile.size,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
    },
    {
      onConflict: "period_month,file_code",
    },
  );

  if (metadataResult.error) {
    if (isMissingRelationError(metadataResult.error)) {
      const tableName =
        getMissingRelationName(metadataResult.error) ?? "team_incentive_source_files";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-source-files-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo guardar metadata del archivo: ${metadataResult.error.message}`,
    };
  }

  let normalizedRowsCount = 0;
  let bigQueryStatus: "uploaded" | "skipped" = "skipped";
  let postMessage = `Archivo cargado para ${fileCode}.`;

  try {
    const { read, utils } = await import("xlsx");
    const workbook = read(fileBuffer, { type: "buffer" });
    const sheetName = sheetNameInput || workbook.SheetNames[0] || "";

    if (!sheetName || !workbook.Sheets[sheetName]) {
      return {
        ok: false,
        message: "No se encontro la pestaña seleccionada en el archivo.",
      };
    }

    const sheetRows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: "",
    });

    const normalizedRows = normalizeRowsForBigQuery({
      rows: sheetRows,
      periodMonth,
      fileCode,
      displayName: displayNameInput || fileCodeInput || fileCode,
      allowedMetrics,
      allowedFuentes,
    });
    const normalizedForBigQuery = mapNormalizedRowsToBigQuerySchema(normalizedRows);
    normalizedRowsCount = normalizedForBigQuery.rows.length;

    if (normalizedForBigQuery.rows.length === 0) {
      postMessage =
        normalizedForBigQuery.droppedRows > 0
          ? `Archivo cargado en storage, pero todas las filas normalizadas (${normalizedForBigQuery.droppedRows}) se omitieron por no cumplir schema minimo (archivo/periodo).`
          : "Archivo cargado en storage, pero no se detectaron filas utiles para normalizar.";
    } else if (isBigQueryConfigured()) {
      const projectId = process.env.GCP_PROJECT_ID;
      const datasetId = process.env.BQ_DATASET_ID ?? "incentivos";
      const tableId = process.env.BQ_TABLE_FILES_NORMALIZADOS ?? "filesNormalizados";

      if (!projectId) {
        postMessage =
          "Archivo cargado y normalizado, pero falta GCP_PROJECT_ID para subir a BigQuery.";
      } else {
        await ensureBigQueryTableHealthCached(datasetId, tableId);

        await runBigQueryQuery({
          query: `DELETE FROM \`${projectId}.${datasetId}.${tableId}\` WHERE periodo = @periodo AND archivo = @archivo`,
          parameters: [
            { name: "periodo", type: "STRING", value: periodMonth.slice(0, 7) },
            {
              name: "archivo",
              type: "STRING",
              value: displayNameInput || fileCodeInput || fileCode,
            },
          ],
        });

        await insertBigQueryRows({
          datasetId,
          tableId,
          rows: normalizedForBigQuery.rows.map((row, index) => ({
            rowId: `${fileCode}-${periodMonth}-${index + 1}`,
            json: row,
          })),
        });

        bigQueryStatus = "uploaded";
        postMessage = `Archivo procesado: ${normalizedForBigQuery.rows.length} filas normalizadas y subidas a BigQuery (reemplazo por periodo+archivo).`;
        if (normalizedForBigQuery.droppedRows > 0) {
          postMessage += ` Se omitieron ${normalizedForBigQuery.droppedRows} filas por no cumplir schema minimo (archivo/periodo).`;
        }
      }
    } else {
      postMessage =
        "Archivo cargado y normalizado, pero BigQuery no esta configurado en variables de entorno.";
    }
  } catch (error) {
    if (isBigQueryStreamingBufferMutationError(error)) {
      return {
        ok: false,
        message:
          "BigQuery aun esta finalizando la transmision de datos de este archivo. Reintenta en unos minutos.",
      };
    }

    return {
      ok: false,
      message:
        error instanceof Error
          ? `No se pudo normalizar/subir a BigQuery: ${error.message}`
          : "No se pudo normalizar/subir a BigQuery.",
    };
  }

  revalidatePath("/admin/incentive-rules");
  revalidatePath("/admin/data-sources");
  revalidateTag("admin-incentive-rules", "max");

  return {
    ok: true,
    message: postMessage,
    fileCode,
    periodMonth,
    uploadedPath: targetPath,
    normalizedRows: normalizedRowsCount,
    bigQueryStatus,
  };
}

export async function reprocessTeamSourceFileFromStorageAction(
  _prevState: UploadTeamSourceFileResult | null,
  formData: FormData,
): Promise<UploadTeamSourceFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const fileCodeInput = String(formData.get("file_code") ?? "").trim();
  const sheetNameInput = String(formData.get("sheet_name") ?? "").trim();

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido. Usa formato YYYY-MM." };
  }

  const fileCode = normalizeSourceFileCode(fileCodeInput);
  if (!fileCode) {
    return { ok: false, message: "Falta la clave de archivo a reprocesar." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const snapshotResult = await getSourceValidationSnapshotForPeriod(supabase, periodMonth);
  if (!snapshotResult.ok) {
    return {
      ok: false,
      message: `No se pudo validar archivos requeridos desde reglas: ${snapshotResult.message}`,
    };
  }
  const requiredCodes = snapshotResult.snapshot.requiredCodes;
  const sourceConstraint = snapshotResult.snapshot.constraintsByFile.get(fileCode) ?? getEmptySourceConstraint();
  const allowedMetrics = sourceConstraint.metrics;
  const allowedFuentes = sourceConstraint.fuentes;

  if (requiredCodes.size === 0) {
    return {
      ok: false,
      message: "No hay archivos fuente requeridos para este periodo segun las reglas.",
    };
  }

  if (!requiredCodes.has(fileCode)) {
    return {
      ok: false,
      message:
        "La clave de archivo no existe en las reglas del periodo. Refresca la vista y selecciona un archivo requerido.",
    };
  }

  const metadataResult = await supabase
    .from("team_incentive_source_files")
    .select("display_name, storage_bucket, storage_path")
    .eq("period_month", periodMonth)
    .eq("file_code", fileCode)
    .maybeSingle();

  if (metadataResult.error) {
    if (isMissingRelationError(metadataResult.error)) {
      const tableName =
        getMissingRelationName(metadataResult.error) ?? "team_incentive_source_files";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-source-files-schema.sql para crearla.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo leer metadata del archivo: ${metadataResult.error.message}`,
    };
  }

  const storageBucket = String(metadataResult.data?.storage_bucket ?? "").trim();
  const storagePath = String(metadataResult.data?.storage_path ?? "").trim();
  const displayName = String(metadataResult.data?.display_name ?? fileCode).trim() || fileCode;

  if (!storageBucket || !storagePath) {
    return {
      ok: false,
      message: "No existe archivo en storage para este periodo/file_code. Sube el archivo primero.",
    };
  }

  const downloadResult = await supabase.storage.from(storageBucket).download(storagePath);
  if (downloadResult.error || !downloadResult.data) {
    return {
      ok: false,
      message: `No se pudo descargar archivo desde storage: ${downloadResult.error?.message ?? "archivo no disponible"}`,
    };
  }

  let normalizedRowsCount = 0;
  let bigQueryStatus: "uploaded" | "skipped" = "skipped";
  let postMessage = `Archivo reprocesado desde storage para ${fileCode}.`;

  try {
    const fileBuffer = Buffer.from(await downloadResult.data.arrayBuffer());
    const { read, utils } = await import("xlsx");
    const workbook = read(fileBuffer, { type: "buffer" });
    const resolvedSheetName = sheetNameInput || workbook.SheetNames[0] || "";

    if (!resolvedSheetName || !workbook.Sheets[resolvedSheetName]) {
      return {
        ok: false,
        message: "No se encontro una pestana valida en el archivo almacenado.",
      };
    }

    const sheetRows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[resolvedSheetName], {
      defval: "",
    });

    const normalizedRows = normalizeRowsForBigQuery({
      rows: sheetRows,
      periodMonth,
      fileCode,
      displayName,
      allowedMetrics,
      allowedFuentes,
    });
    const normalizedForBigQuery = mapNormalizedRowsToBigQuerySchema(normalizedRows);
    normalizedRowsCount = normalizedForBigQuery.rows.length;

    if (normalizedForBigQuery.rows.length === 0) {
      postMessage =
        normalizedForBigQuery.droppedRows > 0
          ? `Reproceso desde storage completo, pero todas las filas normalizadas (${normalizedForBigQuery.droppedRows}) se omitieron por no cumplir schema minimo (archivo/periodo).`
          : "Reproceso desde storage completo, pero no se detectaron filas utiles para normalizar.";
    } else if (isBigQueryConfigured()) {
      const projectId = process.env.GCP_PROJECT_ID;
      const datasetId = process.env.BQ_DATASET_ID ?? "incentivos";
      const tableId = process.env.BQ_TABLE_FILES_NORMALIZADOS ?? "filesNormalizados";

      if (!projectId) {
        postMessage =
          "Archivo reprocesado desde storage, pero falta GCP_PROJECT_ID para subir a BigQuery.";
      } else {
        await ensureBigQueryTableHealthCached(datasetId, tableId);

        await runBigQueryQuery({
          query: `DELETE FROM \`${projectId}.${datasetId}.${tableId}\` WHERE periodo = @periodo AND archivo = @archivo`,
          parameters: [
            { name: "periodo", type: "STRING", value: periodMonth.slice(0, 7) },
            { name: "archivo", type: "STRING", value: displayName },
          ],
        });

        await insertBigQueryRows({
          datasetId,
          tableId,
          rows: normalizedForBigQuery.rows.map((row, index) => ({
            rowId: `${fileCode}-${periodMonth}-reprocess-${index + 1}`,
            json: row,
          })),
        });

        bigQueryStatus = "uploaded";
        postMessage = `Reproceso desde storage completado: ${normalizedForBigQuery.rows.length} filas normalizadas y subidas a BigQuery (reemplazo por periodo+archivo).`;
        if (normalizedForBigQuery.droppedRows > 0) {
          postMessage += ` Se omitieron ${normalizedForBigQuery.droppedRows} filas por no cumplir schema minimo (archivo/periodo).`;
        }
      }
    } else {
      postMessage =
        "Archivo reprocesado desde storage, pero BigQuery no esta configurado en variables de entorno.";
    }
  } catch (error) {
    if (isBigQueryStreamingBufferMutationError(error)) {
      return {
        ok: false,
        message:
          "BigQuery aun esta finalizando la transmision de datos de este archivo. Reintenta en unos minutos.",
      };
    }

    return {
      ok: false,
      message:
        error instanceof Error
          ? `No se pudo reprocesar/subir a BigQuery: ${error.message}`
          : "No se pudo reprocesar/subir a BigQuery.",
    };
  }

  revalidatePath("/admin/incentive-rules");
  revalidatePath("/admin/data-sources");
  revalidateTag("admin-incentive-rules", "max");

  return {
    ok: true,
    message: postMessage,
    fileCode,
    periodMonth,
    uploadedPath: storagePath,
    normalizedRows: normalizedRowsCount,
    bigQueryStatus,
  };
}

export async function previewTeamSourceFileAction(
  _prevState: PreviewTeamSourceFileResult | null,
  formData: FormData,
): Promise<PreviewTeamSourceFileResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const fileCodeInput = String(formData.get("file_code") ?? "").trim();
  const displayNameInput = String(formData.get("display_name") ?? "").trim();
  const sheetNameInput = String(formData.get("sheet_name") ?? "").trim();
  const uploadedFile = formData.get("file");

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido. Usa formato YYYY-MM." };
  }

  const fileCode = normalizeSourceFileCode(fileCodeInput);
  if (!fileCode) {
    return { ok: false, message: "Falta la clave de archivo a validar." };
  }

  if (!(uploadedFile instanceof File)) {
    return { ok: false, message: "Debes seleccionar un archivo." };
  }

  if (uploadedFile.size <= 0) {
    return { ok: false, message: "El archivo seleccionado esta vacio." };
  }

  if (uploadedFile.size > MAX_SOURCE_FILE_SIZE_BYTES) {
    return { ok: false, message: "El archivo supera el limite de 50MB." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const snapshotResult = await getSourceValidationSnapshotForPeriod(supabase, periodMonth);
  if (!snapshotResult.ok) {
    return {
      ok: false,
      message: `No se pudieron leer reglas para validar: ${snapshotResult.message}`,
    };
  }
  const sourceConstraint = snapshotResult.snapshot.constraintsByFile.get(fileCode) ?? getEmptySourceConstraint();
  const allowedMetrics = sourceConstraint.metrics;
  const allowedFuentes = sourceConstraint.fuentes;
  const requirementsByTeam =
    snapshotResult.snapshot.requirementsByFileAndTeam.get(fileCode) ??
    new Map<string, SourceRequirement[]>();

  if (requirementsByTeam.size === 0) {
    return {
      ok: false,
      message: "Este archivo no tiene reglas asociadas en el periodo seleccionado.",
    };
  }

  try {
    const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
    const { read, utils } = await import("xlsx");
    const workbook = read(fileBuffer, { type: "buffer" });
    const sheetName = sheetNameInput || workbook.SheetNames[0] || "";

    if (!sheetName || !workbook.Sheets[sheetName]) {
      return {
        ok: false,
        message: "No se encontro la pestaña seleccionada en el archivo.",
      };
    }

    const sheetRows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: "",
    });

    const normalizedRows = normalizeRowsForBigQuery({
      rows: sheetRows,
      periodMonth,
      fileCode,
      displayName: displayNameInput || fileCodeInput || fileCode,
      allowedMetrics,
      allowedFuentes,
    });
    const normalizedForBigQuery = mapNormalizedRowsToBigQuerySchema(normalizedRows);

    const teamAlerts: Array<{ teamId: string; missingCount: number; missingExamples: string[] }> = [];
    let teamsFullyCovered = 0;

    for (const [teamId, requirements] of requirementsByTeam.entries()) {
      const uniqueRequirements = Array.from(
        new Map(requirements.map((requirement) => [toRequirementKey(requirement), requirement])).values(),
      );

      const missing = uniqueRequirements.filter(
        (requirement) =>
          !normalizedRows.some((row) => doesRowMeetRequirement(row, requirement)),
      );

      if (missing.length === 0) {
        teamsFullyCovered += 1;
      } else {
        teamAlerts.push({
          teamId,
          missingCount: missing.length,
          missingExamples: missing.slice(0, 5).map(buildRequirementLabel),
        });
      }
    }

    const distinctMetrics = Array.from(
      new Set(
        normalizedRows
          .map((row) => normalizeUpperText(row.metric))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();

    const distinctFuentes = Array.from(
      new Set(
        normalizedRows
          .map((row) => normalizeUpperText(row.fuente))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();

    const distinctMoleculas = Array.from(
      new Set(
        normalizedRows
          .map((row) => normalizeUpperText(row.molecula_producto))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort();

    return {
      ok: true,
      message:
        teamAlerts.length === 0
          ? "Validacion completa. El archivo cumple con los requerimientos detectados."
          : "Validacion con alertas. Revisa requisitos faltantes antes de subir a BigQuery.",
      summary: {
        normalizedRows: normalizedRows.length,
        rowsEligibleForBigQuery: normalizedForBigQuery.rows.length,
        droppedRowsBySchema: normalizedForBigQuery.droppedRows,
        teamsWithRequirements: requirementsByTeam.size,
        teamsFullyCovered,
        distinctMetrics,
        distinctFuentes,
        distinctMoleculas,
        teamAlerts,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? `No se pudo validar archivo: ${error.message}` : "No se pudo validar archivo.",
    };
  }
}

export async function saveTeamIncentiveRuleVersionAction(
  _prevState: SaveTeamRuleResult | null,
  formData: FormData,
): Promise<SaveTeamRuleResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const periodInput = String(formData.get("period_month") ?? "").trim();
  const changeNote = String(formData.get("change_note") ?? "").trim();
  const ruleDefinitionInput = String(formData.get("rule_definition") ?? "").trim();

  if (!teamId) {
    return {
      ok: false,
      message: "Falta team_id.",
    };
  }

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return {
      ok: false,
      message: "Periodo invalido. Usa formato YYYY-MM.",
    };
  }

  if (!ruleDefinitionInput) {
    return {
      ok: false,
      message: "Debes ingresar una definicion JSON para las reglas.",
    };
  }

  let parsedDefinition: unknown;
  try {
    parsedDefinition = JSON.parse(ruleDefinitionInput);
  } catch {
    return {
      ok: false,
      message: "El JSON de reglas no es valido.",
    };
  }

  if (!parsedDefinition || typeof parsedDefinition !== "object" || Array.isArray(parsedDefinition)) {
    return {
      ok: false,
      message: "La definicion de reglas debe ser un objeto JSON.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const teamValidationResult = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false)
    .eq("team_id", teamId);

  if (teamValidationResult.error) {
    return {
      ok: false,
      message: `No se pudo validar el team en status: ${teamValidationResult.error.message}`,
    };
  }

  if ((teamValidationResult.count ?? 0) <= 0) {
    return {
      ok: false,
      message: "Ese team_id no existe en Status para el periodo seleccionado.",
    };
  }

  const latestVersionResult = await supabase
    .from("team_incentive_rule_versions")
    .select("version_no")
    .eq("period_month", periodMonth)
    .eq("team_id", teamId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionResult.error) {
    if (isMissingRelationError(latestVersionResult.error)) {
      const tableName =
        getMissingRelationName(latestVersionResult.error) ?? "team_incentive_rule_versions";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-rules-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo leer la version actual: ${latestVersionResult.error.message}`,
    };
  }

  const currentVersionNo = Number(latestVersionResult.data?.version_no ?? 0);
  const nextVersionNo = Number.isFinite(currentVersionNo) ? currentVersionNo + 1 : 1;

  let ruleDefinitionId: string;
  try {
    ruleDefinitionId = await createNormalizedRuleDefinition({
      supabase,
      teamId,
      periodMonth,
      sourceType: "manual",
      createdBy: user.id,
      ruleDefinition: parsedDefinition as Record<string, unknown>,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear definicion.";
    const tableName =
      getMissingRelationName({ message }) ?? "team_rule_definitions / team_rule_definition_items";
    return {
      ok: false,
      message: `No existe la tabla ${tableName}. Revisa docs/team-rule-definitions-normalized-schema.sql para crearla.`,
    };
  }

  const insertResult = await supabase.from("team_incentive_rule_versions").insert({
    period_month: periodMonth,
    team_id: teamId,
    version_no: nextVersionNo,
    change_note: changeNote || null,
    source_type: "manual",
    created_by: user.id,
    rule_definition_id: ruleDefinitionId,
  });

  if (insertResult.error) {
    if (isMissingRelationError(insertResult.error)) {
      const tableName =
        getMissingRelationName(insertResult.error) ?? "team_incentive_rule_versions";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-rules-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudo guardar la nueva version: ${insertResult.error.message}`,
    };
  }

  revalidatePath("/admin/incentive-rules");
  revalidateTag("admin-incentive-rules", "max");
  revalidatePath(`/admin/incentive-rules/${encodeURIComponent(teamId)}`);

  return {
    ok: true,
    message: `Version ${nextVersionNo} guardada correctamente.`,
    versionNo: nextVersionNo,
  };
}
