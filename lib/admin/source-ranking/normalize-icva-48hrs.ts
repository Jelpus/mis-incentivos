import { read, utils } from "xlsx";

type SalesForceStatusRow = {
  territorio_individual: string | null;
  nombre_completo: string | null;
  no_empleado: number | string | null;
};

export type IcvaKpiReferenceRow = {
  territory_source: string | null;
  status_nombre_source: string | null;
  matched_empleado: number | string | null;
  matched_nombre: string | null;
};

type FlatRow = Record<string, unknown>;

type MatchCandidate = {
  nombre: string;
  territorio: string;
  empleado: number | null;
  source: "kpi" | "status";
};

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
    kpiMatchedRows: number;
    statusFallbackMatchedRows: number;
    statusFallbackMatchedNames: string[];
    statusFallbackKpiCandidateHints: string[];
    unmatchedRows: number;
    unmatchedFileNames: string[];
    kpiReferenceWithoutIcvaNames: string[];
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

const NAME_PARTICLES = new Set(["da", "de", "del", "la", "las", "los", "y"]);

function nameTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function significantNameTokens(value: string): string[] {
  return nameTokens(value).filter((token) => token.length > 2 && !NAME_PARTICLES.has(token));
}

function tokenSignatureFromTokens(tokens: string[]): string {
  return Array.from(new Set(tokens)).sort((a, b) => a.localeCompare(b, "es")).join("|");
}

function tokenSignature(value: string): string {
  return tokenSignatureFromTokens(nameTokens(value));
}

function isTokenSubset(tokensA: string[], tokensB: string[]): boolean {
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const uniqueA = new Set(tokensA);
  const uniqueB = new Set(tokensB);
  const [smaller, larger] = uniqueA.size <= uniqueB.size ? [uniqueA, uniqueB] : [uniqueB, uniqueA];
  if (smaller.size < 2) return false;
  for (const token of smaller) {
    if (!larger.has(token)) return false;
  }
  return true;
}

function tokenOverlapScore(tokensA: string[], tokensB: string[]): number {
  const uniqueA = new Set(tokensA);
  const uniqueB = new Set(tokensB);
  if (uniqueA.size === 0 || uniqueB.size === 0) return 0;

  let intersection = 0;
  for (const token of uniqueA) {
    if (uniqueB.has(token)) intersection += 1;
  }

  const precision = intersection / uniqueA.size;
  const recall = intersection / uniqueB.size;
  const harmonic = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return Math.round(harmonic * 100);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function nearTokenMatch(tokenA: string, tokenB: string): boolean {
  if (tokenA === tokenB) return true;
  if (tokenA.length < 5 || tokenB.length < 5) return false;
  const distance = editDistance(tokenA, tokenB);
  const maxLength = Math.max(tokenA.length, tokenB.length);
  return distance <= 1 || (maxLength >= 8 && distance <= 2);
}

function fuzzyTokenOverlapScore(tokensA: string[], tokensB: string[]): number {
  const uniqueA = Array.from(new Set(tokensA));
  const uniqueB = Array.from(new Set(tokensB));
  if (uniqueA.length === 0 || uniqueB.length === 0) return 0;

  const matchedB = new Set<number>();
  let matches = 0;

  for (const tokenA of uniqueA) {
    const exactIndex = uniqueB.findIndex((tokenB, index) => !matchedB.has(index) && tokenA === tokenB);
    if (exactIndex >= 0) {
      matchedB.add(exactIndex);
      matches += 1;
      continue;
    }

    const fuzzyIndex = uniqueB.findIndex((tokenB, index) => !matchedB.has(index) && nearTokenMatch(tokenA, tokenB));
    if (fuzzyIndex >= 0) {
      matchedB.add(fuzzyIndex);
      matches += 0.85;
    }
  }

  const precision = matches / uniqueA.length;
  const recall = matches / uniqueB.length;
  const harmonic = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return Math.round(harmonic * 100);
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

function candidateMatchScore(sourceNombre: string, candidateNombre: string, allowSubsetBoost = false): number {
  const sourceSignature = tokenSignature(sourceNombre);
  const candidateSignature = tokenSignature(candidateNombre);
  if (sourceSignature && sourceSignature === candidateSignature) return 100;

  const sourceSignificantTokens = significantNameTokens(sourceNombre);
  const candidateSignificantTokens = significantNameTokens(candidateNombre);
  const sourceSignificantSignature = tokenSignatureFromTokens(sourceSignificantTokens);
  const candidateSignificantSignature = tokenSignatureFromTokens(candidateSignificantTokens);
  if (sourceSignificantSignature && sourceSignificantSignature === candidateSignificantSignature) return 100;

  const baseScore = nameSimilarityScore(sourceNombre, candidateNombre);
  const significantOverlapScore = tokenOverlapScore(sourceSignificantTokens, candidateSignificantTokens);
  const fuzzyOverlapScore = fuzzyTokenOverlapScore(sourceSignificantTokens, candidateSignificantTokens);
  const bestScore = Math.max(baseScore, significantOverlapScore, fuzzyOverlapScore);
  if (!allowSubsetBoost) return baseScore;

  if (isTokenSubset(sourceSignificantTokens, candidateSignificantTokens)) {
    return Math.max(bestScore, 94);
  }

  return bestScore;
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
  kpiReferenceRows?: IcvaKpiReferenceRow[];
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

  const normalizedKpiReferences = (params.kpiReferenceRows ?? [])
    .map((row) => ({
      nombre: String(row.status_nombre_source ?? row.matched_nombre ?? "").trim(),
      territorio: String(row.territory_source ?? "").trim(),
      empleado: parseInteger(row.matched_empleado),
      raw: row,
      source: "kpi" as const,
    }))
    .filter((row) => row.nombre.length > 0 && row.territorio.length > 0);

  const normalizedStatus = params.salesForceRows
    .map((row) => ({
      nombre: String(row.nombre_completo ?? "").trim(),
      territorio: String(row.territorio_individual ?? "").trim(),
      empleado: parseInteger(row.no_empleado),
      raw: row,
      source: "status" as const,
    }))
    .filter((row) => row.nombre.length > 0);

  const candidateMap = new Map<
    string,
    MatchCandidate
  >();

  for (const candidate of normalizedKpiReferences) {
    const key = `${normalizeText(candidate.nombre)}|${candidate.territorio.toUpperCase()}`;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        nombre: candidate.nombre,
        territorio: candidate.territorio,
        empleado: candidate.empleado,
        source: candidate.source,
      });
    }
  }

  for (const candidate of normalizedStatus) {
    const key = `${normalizeText(candidate.nombre)}|${candidate.territorio.toUpperCase()}`;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        nombre: candidate.nombre,
        territorio: candidate.territorio,
        empleado: candidate.empleado,
        source: candidate.source,
      });
    }
  }

  const matchCandidates = Array.from(candidateMap.values());
  const kpiCandidates = matchCandidates.filter((candidate) => candidate.source === "kpi");
  const statusCandidates = matchCandidates.filter((candidate) => candidate.source === "status");

  function findNameMatch(
    sourceNombre: string,
    candidates: MatchCandidate[],
    options?: {
      strictThreshold?: number;
      minGapForSoftMatch?: number;
      allowSubsetBoost?: boolean;
    },
  ) {
    const strictThreshold = options?.strictThreshold ?? minimumNameMatchScore;
    const minGap = options?.minGapForSoftMatch ?? minGapForSoftMatch;
    const allowSubsetBoost = options?.allowSubsetBoost ?? false;
    let bestScore: number | null = null;
    let secondBestScore: number | null = null;
    let selected: MatchCandidate | null = null;

    for (const candidate of candidates) {
      const score = candidateMatchScore(sourceNombre, candidate.nombre, allowSubsetBoost);
      if (bestScore === null || score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        selected = candidate;
      } else if (secondBestScore === null || score > secondBestScore) {
        secondBestScore = score;
      }
    }

    const strictMatch = Boolean(selected && (bestScore ?? 0) >= strictThreshold);
    const scoreGap = (bestScore ?? 0) - (secondBestScore ?? 0);
    const softMatch = Boolean(
      selected &&
      !strictMatch &&
      (bestScore ?? 0) >= softThreshold &&
      scoreGap >= minGap,
    );

    return {
      selected,
      bestScore,
      matched: strictMatch || softMatch,
    };
  }

  const matchedKpiReferenceNames = new Set<string>();
  const unmatchedFileNames = new Set<string>();
  const rawRows: Icva48RawRow[] = [];
  const statusFallbackMatchedNames = new Set<string>();
  const statusFallbackKpiCandidateHints = new Set<string>();
  let nameMatchedRows = 0;
  let kpiMatchedRows = 0;
  let statusFallbackMatchedRows = 0;
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

    const kpiMatch = findNameMatch(sourceNombre, kpiCandidates, {
      strictThreshold: 65,
      minGapForSoftMatch: 8,
      allowSubsetBoost: true,
    });
    const fallbackStatusMatch = kpiMatch.matched
      ? { selected: null, bestScore: null, matched: false }
      : findNameMatch(sourceNombre, statusCandidates);
    const selected = kpiMatch.matched ? kpiMatch.selected : fallbackStatusMatch.selected;
    const matched = kpiMatch.matched || fallbackStatusMatch.matched;
    const bestScore = kpiMatch.bestScore ?? fallbackStatusMatch.bestScore;
    const matchedBy: "name" | "unmatched" = matched ? "name" : "unmatched";
    if (matched && selected) {
      nameMatchedRows += 1;
      if (selected.source === "kpi") {
        kpiMatchedRows += 1;
        matchedKpiReferenceNames.add(normalizeText(selected.nombre));
        matchedKpiReferenceNames.add(normalizeText(sourceNombre));
        for (const candidate of kpiCandidates) {
          if (candidateMatchScore(sourceNombre, candidate.nombre, true) >= 80) {
            matchedKpiReferenceNames.add(normalizeText(candidate.nombre));
          }
        }
      } else {
        statusFallbackMatchedRows += 1;
        statusFallbackMatchedNames.add(sourceNombre);
        if (kpiMatch.selected && kpiMatch.bestScore !== null) {
          statusFallbackKpiCandidateHints.add(`${sourceNombre} -> ${kpiMatch.selected.nombre} (${kpiMatch.bestScore})`);
        }
      }
    } else {
      unmatchedRows += 1;
      unmatchedFileNames.add(sourceNombre);
    }

    const pct48h = totalCalls > 0 ? onTimeCall / totalCalls : 0;
    const pctIcva = icvaCalls > 0 ? onTimeIcva / icvaCalls : 0;

    rawRows.push({
      period_month: params.periodMonth,
      source_nombre: sourceNombre,
      matched_territorio_individual: matched ? String(selected?.territorio ?? "").trim() || null : null,
      matched_empleado: matched ? (selected?.empleado ?? null) : null,
      matched_nombre: matched ? String(selected?.nombre ?? "").trim() || null : null,
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

  const kpiReferenceWithoutIcvaNames = kpiCandidates
    .filter((row) => !matchedKpiReferenceNames.has(normalizeText(row.nombre)))
    .map((row) => row.nombre)
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "es"));

  return {
    rows: rawRows,
    summary: {
      sourceRows: sourceRows.length,
      normalizedRows: rawRows.length,
      nameMatchedRows,
      kpiMatchedRows,
      statusFallbackMatchedRows,
      statusFallbackMatchedNames: Array.from(statusFallbackMatchedNames).sort((a, b) => a.localeCompare(b, "es")),
      statusFallbackKpiCandidateHints: Array.from(statusFallbackKpiCandidateHints).sort((a, b) => a.localeCompare(b, "es")),
      unmatchedRows,
      unmatchedFileNames: Array.from(unmatchedFileNames).sort((a, b) => a.localeCompare(b, "es")),
      kpiReferenceWithoutIcvaNames,
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
