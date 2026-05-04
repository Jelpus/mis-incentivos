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

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function toNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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

  if (isGuarantee(params.result.garantia)) {
    return {
      period: String(params.result.periodo ?? "").trim(),
      teamId,
      productName,
      rawCoverage,
      cappedCoverage,
      weight: 1,
      formula: "guarantee",
      points: 100,
    };
  }

  if (LVU_CONTEST_IDS.has(params.contest.id)) {
    const complement = findComplementForProduct({
      complements: params.rankingComplementsForTeam,
      teamId,
      productName,
    });
    const weight = complement?.puntosRankingLvu ?? 0;
    return {
      period: String(params.result.periodo ?? "").trim(),
      teamId,
      productName,
      rawCoverage,
      cappedCoverage,
      weight,
      formula: "lvu",
      points: complement ? cappedCoverage * weight * 100 : 0,
      missingComplement: !complement,
    };
  }

  const weight = toNumber(params.result.prod_weight);
  return {
    period: String(params.result.periodo ?? "").trim(),
    teamId,
    productName,
    rawCoverage,
    cappedCoverage,
    weight,
    formula: "standard",
    points: cappedCoverage * weight * 100,
  };
}

export async function fetchCoverageRowsForPeriods(periods: string[]): Promise<{ rows: BigQueryCoverageRow[]; message: string | null }> {
  const uniquePeriods = Array.from(new Set(periods.filter((period) => /^\d{6}$/.test(period))));
  if (uniquePeriods.length === 0) return { rows: [], message: null };
  if (!isBigQueryConfigured()) return { rows: [], message: "BigQuery no esta configurado." };

  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const datasetId = process.env.BQ_RESULTS_DATASET?.trim() || "incentivos";
  const tableId = process.env.BQ_RESULTS_TABLE?.trim() || "resultados_v2";
  const tableRef = `\`${projectId}.${datasetId}.${tableId}\``;
  const periodList = uniquePeriods.map((period) => `'${period}'`).join(", ");

  const rows = await fetchBigQueryRows<BigQueryCoverageRow>({
    query: `
      SELECT team_id, product_name, prod_weight, cobertura, garantia, nombre, empleado, representante, manager, periodo
      FROM ${tableRef}
      WHERE periodo IN (${periodList})
    `,
  });

  return { rows, message: rows.length === 0 ? "No hay resultados de BigQuery para el rango evaluado." : null };
}
