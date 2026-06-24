import { fetchBigQueryRows, isBigQueryConfigured } from "@/lib/integrations/bigquery";
import type {
  BigQueryCoverageRow,
  ContestParticipant,
  CoveragePointDetail,
  RankingComplement,
  RankingContest,
} from "@/lib/ranking-contests/types";
import { findComplementForProduct } from "@/lib/ranking-contests/rankingGroups";

const LVU_CONTEST_IDS = new Set([
  "fa9423cd-0760-4f35-9ada-2a47222be53b",
  "efbaea8b-ef99-4994-9dce-9efb6b88f8f9",
]);

export function isLvuRankingContestId(contestId: string): boolean {
  return LVU_CONTEST_IDS.has(contestId);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function toNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBigQueryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("timeout") ||
    normalized.includes("request to https://bigquery.googleapis.com")
  ) {
    return "No se pudieron cargar puntos desde BigQuery por un problema de conexion. Los calificadores se evaluan con las fuentes de ranking locales.";
  }

  return `No se pudieron cargar puntos desde BigQuery: ${message || "error desconocido"}.`;
}

function isGuarantee(value: unknown): boolean {
  if (value === true) return true;
  return String(value ?? "").trim().toLowerCase() === "true";
}

function toMonthDate(value: string): Date | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function toPeriodCode(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sqlStringLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildCoveragePeriods(params: {
  coveragePeriodStart: string | null;
  coveragePeriodEnd: string | null;
  maxCoveragePeriodMonth: string;
}): string[] {
  const start = toMonthDate(params.coveragePeriodStart ?? "");
  const configuredEnd = toMonthDate(params.coveragePeriodEnd ?? "");
  const maxEnd = toMonthDate(params.maxCoveragePeriodMonth);
  if (!start || !configuredEnd || !maxEnd) return [];

  const effectiveEnd = configuredEnd.getTime() < maxEnd.getTime() ? configuredEnd : maxEnd;
  if (start.getTime() > effectiveEnd.getTime()) return [];

  const periods: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= effectiveEnd.getTime()) {
    periods.push(toPeriodCode(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

export function belongsToParticipant(result: BigQueryCoverageRow, participant: ContestParticipant): boolean {
  if (participant.scope === "rep") {
    const employee = normalizeKey(participant.employeeNumber);
    if (employee && normalizeKey(result.empleado) === employee) return true;
    const territory = normalizeKey(participant.territory);
    return Boolean(territory && normalizeKey(result.representante) === territory);
  }

  const territory = normalizeKey(participant.territory);
  return Boolean(territory && normalizeKey(result.manager) === territory);
}

export function calculateCoveragePoints(params: {
  result: BigQueryCoverageRow;
  contest: RankingContest;
  rankingComplementsForTeam?: RankingComplement[];
}): CoveragePointDetail {
  const rawCoverage = toNumber(params.result.cobertura);
  const cappedCoverage = Math.min(rawCoverage, 1.8);
  const teamId = String(params.result.team_id ?? "").trim() || null;
  const productName = String(params.result.product_name ?? "").trim() || null;
  const complement = findComplementForProduct({
    complements: params.rankingComplementsForTeam,
    teamId,
    productName,
  });
  const isLvuContest = isLvuRankingContestId(params.contest.id);
  const resolvedWeight = isLvuContest
    ? complement?.puntosRankingLvu ?? complement?.prodWeight ?? toNumber(params.result.prod_weight)
    : complement?.prodWeight ?? toNumber(params.result.prod_weight);

  if (isGuarantee(params.result.garantia)) {
    const points = resolvedWeight * 100;
    return {
      period: String(params.result.periodo ?? "").trim(),
      teamId,
      productName,
      rawCoverage,
      cappedCoverage: 1,
      weight: resolvedWeight,
      formula: "guarantee",
      basePoints: points,
      adjustmentDelta: 0,
      points,
    };
  }

  if (isLvuContest) {
    const weight = resolvedWeight;
    const points = cappedCoverage * weight * 100;
    return {
      period: String(params.result.periodo ?? "").trim(),
      teamId,
      productName,
      rawCoverage,
      cappedCoverage,
      weight,
      formula: "lvu",
      basePoints: points,
      adjustmentDelta: 0,
      points,
      missingComplement: !complement,
    };
  }

  const weight = resolvedWeight;
  const points = cappedCoverage * weight * 100;
  return {
    period: String(params.result.periodo ?? "").trim(),
    teamId,
    productName,
    rawCoverage,
    cappedCoverage,
    weight,
    formula: "standard",
    basePoints: points,
    adjustmentDelta: 0,
    points,
  };
}

export async function fetchCoverageRowsForPeriods(
  periods: string[],
  filters?: {
    employeeNumbers?: Array<string | number | null | undefined>;
    territories?: Array<string | null | undefined>;
  },
): Promise<{ rows: BigQueryCoverageRow[]; message: string | null }> {
  const uniquePeriods = Array.from(new Set(periods.filter((period) => /^\d{6}$/.test(period))));
  if (uniquePeriods.length === 0) return { rows: [], message: null };
  if (!isBigQueryConfigured()) return { rows: [], message: "BigQuery no esta configurado." };

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const periodList = uniquePeriods.map((period) => sqlStringLiteral(period)).join(", ");
  const employeeList = Array.from(
    new Set(
      (filters?.employeeNumbers ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
  const territoryList = Array.from(
    new Set(
      (filters?.territories ?? [])
        .map((value) => normalizeKey(value))
        .filter(Boolean),
    ),
  );
  const filterClauses: string[] = [];
  if (employeeList.length > 0) {
    filterClauses.push(`CAST(empleado AS STRING) IN (${employeeList.map(sqlStringLiteral).join(", ")})`);
  }
  if (territoryList.length > 0) {
    filterClauses.push(`UPPER(TRIM(CAST(representante AS STRING))) IN (${territoryList.map(sqlStringLiteral).join(", ")})`);
  }
  const participantFilterSql = filterClauses.length > 0
    ? `AND (${filterClauses.join(" OR ")})`
    : "";

  let rows: BigQueryCoverageRow[] = [];
  try {
    rows = await fetchBigQueryRows<BigQueryCoverageRow>({
      query: `
        SELECT team_id, product_name, prod_weight, cobertura, garantia, nombre, empleado, representante, manager, periodo
        FROM ${tableRef}
        WHERE periodo IN (${periodList})
          ${participantFilterSql}
      `,
    });
  } catch (error) {
    return { rows: [], message: formatBigQueryErrorMessage(error) };
  }

  return { rows, message: rows.length === 0 ? "No hay resultados de BigQuery para el rango evaluado." : null };
}
