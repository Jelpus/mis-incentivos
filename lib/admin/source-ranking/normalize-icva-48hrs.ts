import { read, utils } from "xlsx";

type SalesForceStatusRow = {
  territorio_individual: string | null;
  nombre_completo: string | null;
  no_empleado: number | string | null;
};

type FlatRow = Record<string, unknown>;

export type Icva48RawRow = {
  period_month: string;
  source_nombre: string;
  matched_territorio_individual: string | null;
  matched_empleado: number | null;
  matched_nombre: string | null;
  matched_by: "name" | "unmatched";
  name_match_score: number | null;
  total_calls: number;
  icva_calls: number;
  on_time_call: number;
  on_time_icva: number;
  pct_48h: number;
  pct_icva: number;
};

export type Icva48AggRow = {
  period_month: string;
  territorio_individual: string;
  empleado: number | null;
  nombre: string;
  total_calls: number;
  icva_calls: number;
  on_time_call: number;
  on_time_icva: number;
  pct_48h: number;
  pct_icva: number;
};

type NormalizeResult = {
  rows: Icva48RawRow[];
  summary: {
    sourceRows: number;
    normalizedRows: number;
    nameMatchedRows: number;
    unmatchedRows: number;
    unmatchedFileNames: string[];
    statusWithoutDataNames: string[];
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
  const raw = String(value ?? "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
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

export function normalizeIcva48hrsRaw(params: {
  fileBuffer: Buffer;
  periodMonth: string;
  salesForceRows: SalesForceStatusRow[];
  minimumNameMatchScore?: number;
}): NormalizeResult {
  const minimumNameMatchScore = params.minimumNameMatchScore ?? 80;
  const softThreshold = 45;
  const minGapForSoftMatch = 12;
  const workbook = read(params.fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error("No se detectaron pestanas en el archivo.");

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("No se pudo leer la primera pestana del archivo.");

  const sourceRows = utils.sheet_to_json<FlatRow>(sheet, { defval: null, raw: false });

  const normalizedStatus = params.salesForceRows
    .map((row) => ({
      nombre: String(row.nombre_completo ?? "").trim(),
      territorio: String(row.territorio_individual ?? "").trim(),
      empleado: parseInteger(row.no_empleado),
      raw: row,
    }))
    .filter((row) => row.nombre.length > 0);

  const matchedStatusNames = new Set<string>();
  const unmatchedFileNames = new Set<string>();
  const rawRows: Icva48RawRow[] = [];
  let nameMatchedRows = 0;
  let unmatchedRows = 0;

  for (const row of sourceRows) {
    const sourceNombre = String(getValueByKeys(row, ["Row Labels", "Nombre", "Name"]) ?? "").trim();
    if (!sourceNombre) continue;
    if (/^grand\s*total$/i.test(sourceNombre)) continue;

    const totalCalls = parseNumber(getValueByKeys(row, ["Sum of Actual Calls", "Actual Calls"]));
    const icvaCalls = parseNumber(
      getValueByKeys(row, ["Sum of Actual Calls for iCVA", "Actual Calls for iCVA"]),
    );
    const onTimeCall = parseNumber(
      getValueByKeys(row, ["Sum of Call Doc in 48 Hours", "Call Doc in 48 Hours"]),
    );
    const onTimeIcva = parseNumber(getValueByKeys(row, ["Sum of ICVA Calls", "ICVA Calls"]));

    let bestScore: number | null = null;
    let secondBestScore: number | null = null;
    let selected: SalesForceStatusRow | null = null;
    for (const candidate of normalizedStatus) {
      const score = nameSimilarityScore(sourceNombre, candidate.nombre);
      if (bestScore === null || score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        selected = candidate.raw;
      } else if (secondBestScore === null || score > secondBestScore) {
        secondBestScore = score;
      }
    }

    const strictMatch = Boolean(selected && (bestScore ?? 0) >= minimumNameMatchScore);
    const scoreGap = (bestScore ?? 0) - (secondBestScore ?? 0);
    const softMatch = Boolean(
      selected &&
      !strictMatch &&
      (bestScore ?? 0) >= softThreshold &&
      scoreGap >= minGapForSoftMatch,
    );
    const matched = strictMatch || softMatch;
    const matchedBy: "name" | "unmatched" = matched ? "name" : "unmatched";
    if (matched && selected) {
      nameMatchedRows += 1;
      matchedStatusNames.add(normalizeText(selected.nombre_completo));
    } else {
      unmatchedRows += 1;
      unmatchedFileNames.add(sourceNombre);
    }

    const pct48h = totalCalls > 0 ? onTimeCall / totalCalls : 0;
    const pctIcva = icvaCalls > 0 ? onTimeIcva / icvaCalls : 0;

    rawRows.push({
      period_month: params.periodMonth,
      source_nombre: sourceNombre,
      matched_territorio_individual: matched ? String(selected?.territorio_individual ?? "").trim() || null : null,
      matched_empleado: matched ? parseInteger(selected?.no_empleado) : null,
      matched_nombre: matched ? String(selected?.nombre_completo ?? "").trim() || null : null,
      matched_by: matchedBy,
      name_match_score: bestScore,
      total_calls: Number(totalCalls.toFixed(6)),
      icva_calls: Number(icvaCalls.toFixed(6)),
      on_time_call: Number(onTimeCall.toFixed(6)),
      on_time_icva: Number(onTimeIcva.toFixed(6)),
      pct_48h: Number(pct48h.toFixed(6)),
      pct_icva: Number(pctIcva.toFixed(6)),
    });
  }

  const statusWithoutDataNames = normalizedStatus
    .filter((row) => !matchedStatusNames.has(normalizeText(row.nombre)))
    .map((row) => row.nombre)
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "es"));

  return {
    rows: rawRows,
    summary: {
      sourceRows: sourceRows.length,
      normalizedRows: rawRows.length,
      nameMatchedRows,
      unmatchedRows,
      unmatchedFileNames: Array.from(unmatchedFileNames).sort((a, b) => a.localeCompare(b, "es")),
      statusWithoutDataNames,
    },
  };
}

export function aggregateIcva48hrsRawRows(rows: Icva48RawRow[]): Icva48AggRow[] {
  const grouped = new Map<string, Icva48AggRow>();

  for (const row of rows) {
    const territorio = row.matched_territorio_individual ?? "";
    const empleado = row.matched_empleado ?? null;
    const nombre = row.matched_nombre ?? row.source_nombre;
    const key = `${row.period_month}|${territorio.toUpperCase()}|${empleado ?? "na"}|${nombre.toUpperCase()}`;

    const current = grouped.get(key) ?? {
      period_month: row.period_month,
      territorio_individual: territorio,
      empleado,
      nombre,
      total_calls: 0,
      icva_calls: 0,
      on_time_call: 0,
      on_time_icva: 0,
      pct_48h: 0,
      pct_icva: 0,
    };

    current.total_calls += row.total_calls;
    current.icva_calls += row.icva_calls;
    current.on_time_call += row.on_time_call;
    current.on_time_icva += row.on_time_icva;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((row) => {
      const pct48h = row.total_calls > 0 ? row.on_time_call / row.total_calls : 0;
      const pctIcva = row.icva_calls > 0 ? row.on_time_icva / row.icva_calls : 0;
      return {
        ...row,
        total_calls: Number(row.total_calls.toFixed(6)),
        icva_calls: Number(row.icva_calls.toFixed(6)),
        on_time_call: Number(row.on_time_call.toFixed(6)),
        on_time_icva: Number(row.on_time_icva.toFixed(6)),
        pct_48h: Number(pct48h.toFixed(6)),
        pct_icva: Number(pctIcva.toFixed(6)),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
