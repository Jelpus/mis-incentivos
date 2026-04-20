import { read, utils } from "xlsx";

type SalesForceStatusRow = {
  territorio_individual: string | null;
  nombre_completo: string | null;
  no_empleado: number | string | null;
};

type FlatRow = Record<string, unknown>;

export type KpiLocalYtdRawRow = {
  period_month: string;
  annio_mes: string;
  territory_source: string;
  status_nombre_source: string | null;
  salesforce_id: string | null;
  tier_ok: string | null;
  visitas_tot: number;
  visitas_top: number;
  obj_ok: number;
  garantia: boolean;
  matched_territorio_individual: string | null;
  matched_empleado: number | null;
  matched_nombre: string | null;
  matched_by: "name" | "territory" | "unmatched";
  name_match_score: number | null;
};

export type KpiAggregatedRow = {
  period_month: string;
  territorio_individual: string;
  empleado: number | null;
  nombre: string;
  tier: string | null;
  total_hcps: number;
  visited_unique: number;
  no_visited_unique: number;
  total_objetivos: number;
  total_visitas: number;
  total_visitas_top: number;
  call_adherance: number;
  garantia: boolean;
};

type NormalizeResult = {
  rows: KpiLocalYtdRawRow[];
  summary: {
    processedRows: number;
    ytdRows: number;
    rawRows: number;
    nameMatchedRows: number;
    territoryFallbackRows: number;
    unmatchedRows: number;
    garantiaRows: number;
  };
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toYyMmCode(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}$/.test(raw)) {
    const mm = Number(raw.slice(2, 4));
    if (mm >= 1 && mm <= 12) return raw;
  }

  if (/^\d{6}$/.test(raw)) {
    const yyyy = Number(raw.slice(0, 4));
    const mm = Number(raw.slice(4, 6));
    if (yyyy >= 2000 && yyyy <= 2100 && mm >= 1 && mm <= 12) {
      return `${String(yyyy).slice(2, 4)}${String(mm).padStart(2, "0")}`;
    }
  }

  if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) {
    const yyyy = Number(raw.slice(0, 4));
    const mm = Number(raw.slice(5, 7));
    if (yyyy >= 2000 && yyyy <= 2100 && mm >= 1 && mm <= 12) {
      return `${String(yyyy).slice(2, 4)}${String(mm).padStart(2, "0")}`;
    }
  }

  if (/^\d{1,2}\/\d{4}$/.test(raw)) {
    const [mmRaw, yyyyRaw] = raw.split("/");
    const mm = Number(mmRaw);
    const yyyy = Number(yyyyRaw);
    if (yyyy >= 2000 && yyyy <= 2100 && mm >= 1 && mm <= 12) {
      return `${String(yyyy).slice(2, 4)}${String(mm).padStart(2, "0")}`;
    }
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [, mmRaw, yyyyRaw] = raw.split("/");
    const mm = Number(mmRaw);
    const yyyy = Number(yyyyRaw);
    if (yyyy >= 2000 && yyyy <= 2100 && mm >= 1 && mm <= 12) {
      return `${String(yyyy).slice(2, 4)}${String(mm).padStart(2, "0")}`;
    }
  }

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    const rounded = Math.floor(asNumber);
    if (rounded >= 2000 && rounded <= 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + rounded * 24 * 60 * 60 * 1000);
      const yyyy = date.getUTCFullYear();
      const mm = date.getUTCMonth() + 1;
      if (yyyy >= 2000 && yyyy <= 2100) {
        return `${String(yyyy).slice(2, 4)}${String(mm).padStart(2, "0")}`;
      }
    }
  }

  return null;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function diceCoefficient(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  return (2 * intersection) / (tokensA.size + tokensB.size);
}

function nameSimilarityScore(a: string, b: string): number {
  const tokensA = tokenSet(a);
  const tokensB = tokenSet(b);
  const tokenScore = diceCoefficient(tokensA, tokensB);

  const normA = normalizeText(a).replace(/\s+/g, "");
  const normB = normalizeText(b).replace(/\s+/g, "");
  const short = Math.min(normA.length, normB.length);
  const long = Math.max(normA.length, normB.length);
  const lenScore = long > 0 ? short / long : 0;

  return Math.round((tokenScore * 0.85 + lenScore * 0.15) * 100);
}

function findSheet(rowsBySheetName: Map<string, FlatRow[]>, expectedName: string): FlatRow[] | null {
  const normalizedExpected = normalizeHeader(expectedName);
  for (const [sheetName, rows] of rowsBySheetName.entries()) {
    const normalizedSheetName = normalizeHeader(sheetName);
    if (normalizedSheetName === normalizedExpected) return rows;
  }
  return null;
}

function getValueByKeys(row: FlatRow, possibleKeys: string[]): unknown {
  const entries = Object.entries(row);
  const normalizedMap = new Map<string, unknown>();
  for (const [key, value] of entries) {
    normalizedMap.set(normalizeHeader(key), value);
  }

  for (const key of possibleKeys) {
    const found = normalizedMap.get(normalizeHeader(key));
    if (found !== undefined) return found;
  }

  return null;
}

function buildYtdCodes(periodMonth: string, catCalenRows: FlatRow[]): Set<string> {
  const periodYear = Number(periodMonth.slice(0, 4));
  const periodMonthNum = Number(periodMonth.slice(5, 7));
  const yy = String(periodYear).slice(2, 4);

  const codesFromCatalog = Array.from(
    new Set(
      catCalenRows
        .map((row) => toYyMmCode(getValueByKeys(row, ["ANNIO_MES", "ANIO_MES", "FECHA", "MES"])))
        .filter((value): value is string => value !== null && value.startsWith(yy)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (codesFromCatalog.length > 0) {
    const target = `${yy}${String(periodMonthNum).padStart(2, "0")}`;
    return new Set(codesFromCatalog.filter((code) => code <= target));
  }

  return new Set(
    Array.from({ length: periodMonthNum }, (_, index) => `${yy}${String(index + 1).padStart(2, "0")}`),
  );
}

export function normalizeKpiLocalYtdRaw(params: {
  fileBuffer: Buffer;
  periodMonth: string;
  salesForceRows: SalesForceStatusRow[];
  minimumNameMatchScore?: number;
}): NormalizeResult {
  const minimumNameMatchScore = params.minimumNameMatchScore ?? 80;
  const workbook = read(params.fileBuffer, { type: "buffer" });

  const rowsBySheetName = new Map<string, FlatRow[]>();
  for (const sheetName of workbook.SheetNames ?? []) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = utils.sheet_to_json<FlatRow>(sheet, { defval: null, raw: false });
    rowsBySheetName.set(sheetName, rows);
  }

  const baseVisitasRows = findSheet(rowsBySheetName, "BASE VISITAS");
  const catGarantiaRows = findSheet(rowsBySheetName, "CAT_GARANTIA");
  const catCalenRows = findSheet(rowsBySheetName, "CAT CALEN");

  if (!baseVisitasRows) throw new Error('No se encontro la pestana "BASE VISITAS".');
  if (!catGarantiaRows) throw new Error('No se encontro la pestana "CAT_GARANTIA".');
  if (!catCalenRows) throw new Error('No se encontro la pestana "CAT CALEN".');

  const ytdCodes = buildYtdCodes(params.periodMonth, catCalenRows);

  const garantiaSet = new Set<string>();
  for (const row of catGarantiaRows) {
    const territorio = String(getValueByKeys(row, ["TERRITORIO", "STATUS.TERRITORIO"]) ?? "")
      .trim()
      .toUpperCase();
    const fechaCode = toYyMmCode(getValueByKeys(row, ["FECHA", "ANNIO_MES", "ANIO_MES"]));
    if (!territorio || !fechaCode) continue;
    garantiaSet.add(`${territorio}|${fechaCode}`);
  }

  const statusByTerritory = new Map<string, SalesForceStatusRow>();
  const normalizedStatus = params.salesForceRows
    .map((row) => ({
      territorio: String(row.territorio_individual ?? "").trim().toUpperCase(),
      nombre: String(row.nombre_completo ?? "").trim(),
      raw: row,
    }))
    .filter((row) => row.territorio.length > 0 || row.nombre.length > 0);

  for (const row of normalizedStatus) {
    if (row.territorio && !statusByTerritory.has(row.territorio)) {
      statusByTerritory.set(row.territorio, row.raw);
    }
  }

  let ytdRows = 0;
  let nameMatchedRows = 0;
  let territoryFallbackRows = 0;
  let unmatchedRows = 0;
  let garantiaRows = 0;
  const outputRows: KpiLocalYtdRawRow[] = [];

  for (const row of baseVisitasRows) {
    const annioMesCode = toYyMmCode(getValueByKeys(row, ["ANNIO_MES", "ANIO_MES", "FECHA", "MES"]));
    if (!annioMesCode || !ytdCodes.has(annioMesCode)) continue;
    ytdRows += 1;

    const territorio = String(getValueByKeys(row, ["STATUS.TERRITORIO", "TERRITORIO"]) ?? "")
      .trim()
      .toUpperCase();
    const statusNombre = String(getValueByKeys(row, ["STATUS.NOMBRE", "NOMBRE"]) ?? "").trim();
    const salesforceId = String(getValueByKeys(row, ["Salesforce ID", "SALESFORCE_ID"]) ?? "")
      .trim()
      .toUpperCase();
    const tier = String(getValueByKeys(row, ["TIER_OK", "TIER"]) ?? "").trim().toUpperCase();
    const visitasTot = parseNumber(getValueByKeys(row, ["VISITAS_TOT", "VISITAS TOT"]));
    const visitasTop = parseNumber(getValueByKeys(row, ["VISITAS TOP", "VISITAS_TOP"]));
    const objOk = parseNumber(getValueByKeys(row, ["OBJ_OK", "OBJ OK"]));

    let selected: SalesForceStatusRow | null = null;
    let matchedBy: "name" | "territory" | "unmatched" = "unmatched";
    let bestScore: number | null = null;

    if (statusNombre) {
      const nameCandidates =
        territorio.length > 0
          ? normalizedStatus.filter((candidate) => candidate.territorio === territorio)
          : normalizedStatus;

      for (const candidate of nameCandidates) {
        if (!candidate.nombre) continue;
        const score = nameSimilarityScore(statusNombre, candidate.nombre);
        if (bestScore === null || score > bestScore) {
          bestScore = score;
          selected = candidate.raw;
        }
      }

      if ((bestScore ?? 0) >= minimumNameMatchScore) {
        matchedBy = "name";
        nameMatchedRows += 1;
      } else {
        selected = null;
      }
    }

    if (!selected && territorio) {
      const territoryMatch = statusByTerritory.get(territorio);
      if (territoryMatch) {
        selected = territoryMatch;
        matchedBy = "territory";
        territoryFallbackRows += 1;
      }
    }

    if (!selected) {
      unmatchedRows += 1;
    }

    const hasGarantia = garantiaSet.has(`${territorio}|${annioMesCode}`);
    if (hasGarantia) garantiaRows += 1;

    outputRows.push({
      period_month: params.periodMonth,
      annio_mes: annioMesCode,
      territory_source: territorio,
      status_nombre_source: statusNombre || null,
      salesforce_id: salesforceId || null,
      tier_ok: tier || null,
      visitas_tot: Number(visitasTot.toFixed(6)),
      visitas_top: Number(visitasTop.toFixed(6)),
      obj_ok: Number(objOk.toFixed(6)),
      garantia: hasGarantia,
      matched_territorio_individual: String(selected?.territorio_individual ?? "").trim() || null,
      matched_empleado: parseInteger(selected?.no_empleado),
      matched_nombre: String(selected?.nombre_completo ?? "").trim() || null,
      matched_by: matchedBy,
      name_match_score: bestScore,
    });
  }

  return {
    rows: outputRows,
    summary: {
      processedRows: baseVisitasRows.length,
      ytdRows,
      rawRows: outputRows.length,
      nameMatchedRows,
      territoryFallbackRows,
      unmatchedRows,
      garantiaRows,
    },
  };
}

export function aggregateKpiLocalYtdRawRows(rows: KpiLocalYtdRawRow[]): KpiAggregatedRow[] {
  type AggGroup = {
    period_month: string;
    territorio_individual: string;
    empleado: number | null;
    nombre: string;
    tier: string | null;
    hcpIds: Set<string>;
    visitedHcpIds: Set<string>;
    total_objetivos: number;
    total_visitas: number;
    total_visitas_top: number;
    garantia: boolean;
  };

  const grouped = new Map<string, AggGroup>();

  for (const row of rows) {
    const territorio = row.matched_territorio_individual ?? row.territory_source;
    const empleado = row.matched_empleado ?? null;
    const nombre = row.matched_nombre ?? row.status_nombre_source ?? "Sin nombre";
    const tier = String(row.tier_ok ?? "").trim().toUpperCase() || null;
    const key = `${row.period_month}|${territorio.toUpperCase()}|${empleado ?? "na"}|${nombre.toUpperCase()}|${tier ?? "NA"}`;

    const current = grouped.get(key) ?? {
      period_month: row.period_month,
      territorio_individual: territorio,
      empleado,
      nombre,
      tier,
      hcpIds: new Set<string>(),
      visitedHcpIds: new Set<string>(),
      total_objetivos: 0,
      total_visitas: 0,
      total_visitas_top: 0,
      garantia: false,
    };

    const hcpId = String(row.salesforce_id ?? "").trim().toUpperCase();
    if (hcpId) {
      current.hcpIds.add(hcpId);
      if (row.visitas_tot > 0) current.visitedHcpIds.add(hcpId);
    }

    current.total_objetivos += row.obj_ok;
    current.total_visitas += row.visitas_tot;
    current.total_visitas_top += row.visitas_top;
    current.garantia = current.garantia || row.garantia;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((group) => {
      const totalHcps = group.hcpIds.size;
      const visitedUnique = group.visitedHcpIds.size;
      const noVisitedUnique = Math.max(0, totalHcps - visitedUnique);
      const callAdherance =
        group.total_objetivos > 0 ? group.total_visitas_top / group.total_objetivos : 0;

      return {
        period_month: group.period_month,
        territorio_individual: group.territorio_individual,
        empleado: group.empleado,
        nombre: group.nombre,
        tier: group.tier,
        total_hcps: totalHcps,
        visited_unique: visitedUnique,
        no_visited_unique: noVisitedUnique,
        total_objetivos: Number(group.total_objetivos.toFixed(6)),
        total_visitas: Number(group.total_visitas.toFixed(6)),
        total_visitas_top: Number(group.total_visitas_top.toFixed(6)),
        call_adherance: Number(callAdherance.toFixed(6)),
        garantia: group.garantia,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
