import { getMissingRelationName, isMissingRelationError, normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import {
  getRankingContestsData,
  type RankingContestRow,
} from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCoveragePeriods,
  calculateCoveragePoints,
  fetchCoverageRowsForPeriods,
  isLvuRankingContestId,
} from "@/lib/ranking-contests/coverage";
import {
  EMPTY_RANKING_PRODUCT_KEY,
  applyRankingPointAdjustment,
  getActiveRankingPointAdjustmentsForPeriods,
  normalizeAdjustmentProduct,
  periodCodeToMonth,
  periodMonthToCode,
} from "@/lib/ranking-contests/pointAdjustments";
import {
  getLatestRankingComplementsByTeamIds,
  normalizeTeamKey,
} from "@/lib/ranking-contests/rankingGroups";
import type {
  BigQueryCoverageRow,
  ContestParticipant,
  CoveragePointDetail,
  RankingComplement,
  RankingContest,
} from "@/lib/ranking-contests/types";

type PeriodRow = {
  period_month: string | null;
};

type AdjustmentRow = {
  id: string | null;
  period_month: string | null;
  territory: string | null;
  product_name: string | null;
  delta_points: number | string | null;
  reason: string | null;
  is_active: boolean | null;
  updated_at: string | null;
  updated_by: string | null;
};

type AuditRow = {
  id: string | null;
  adjustment_id: string | null;
  action: string | null;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string | null;
};

export type RankingAdjustmentPointRow = {
  id: string;
  participantId: string;
  participantName: string;
  employeeNumber: string | number | null;
  territory: string;
  rankingGroup: string | null;
  periodCode: string;
  periodMonth: string;
  productKey: string;
  productName: string;
  formula: string;
  basePoints: number;
  adjustmentDelta: number;
  currentPoints: number;
  rawCoverage: number;
  cappedCoverage: number;
  weight: number;
  affectedContestCount: number;
};

export type RankingAdjustmentListItem = {
  id: string;
  periodCode: string;
  periodMonth: string;
  territory: string;
  productKey: string;
  productName: string;
  deltaPoints: number;
  reason: string | null;
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type RankingAdjustmentAuditItem = {
  id: string;
  adjustmentId: string | null;
  action: string;
  periodCode: string | null;
  territory: string | null;
  productName: string | null;
  previousDelta: number | null;
  newDelta: number | null;
  previousActive: boolean | null;
  newActive: boolean | null;
  changedAt: string | null;
  changedBy: string | null;
};

export type RankingAdjustmentsPageData = {
  periodMonth: string | null;
  periodInput: string;
  availablePeriodInputs: string[];
  pointRows: RankingAdjustmentPointRow[];
  adjustments: RankingAdjustmentListItem[];
  auditItems: RankingAdjustmentAuditItem[];
  messages: string[];
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function displayProductName(value: unknown): string {
  const productName = normalizeAdjustmentProduct(value);
  return productName === EMPTY_RANKING_PRODUCT_KEY ? "-" : productName;
}

function normalizeMonth(value: unknown): string | null {
  return normalizePeriodMonthInput(normalizeText(value));
}

function buildParticipantFromCoverageRow(row: BigQueryCoverageRow): ContestParticipant {
  const employeeNumber = normalizeText(row.empleado) || null;
  const territory = normalizeText(row.representante);
  const participantName = normalizeText(row.nombre) || territory || "Representante sin nombre";

  return {
    id: `rep:${employeeNumber || territory || participantName}`,
    scope: "rep",
    employeeNumber,
    name: participantName,
    territory: territory || null,
    teamId: normalizeText(row.team_id) || null,
    rankingGroup: null,
    raw: {},
  };
}

function toRankingContest(contest: RankingContestRow): RankingContest {
  return {
    id: contest.id,
    contestName: contest.contestName,
    scope: contest.scope,
    participationScope: contest.participationScope,
    paymentDate: normalizeMonth(contest.paymentDate),
    coveragePeriodStart: normalizeMonth(contest.coveragePeriodStart),
    coveragePeriodEnd: normalizeMonth(contest.coveragePeriodEnd),
    notes: contest.notes || null,
    isActive: contest.isActive,
    components: contest.components
      .filter((component) => component.isActive)
      .map((component) => ({
        id: component.id,
        contestId: contest.id,
        componentName: component.name,
        thresholdValue: component.threshold,
        periodStart: normalizeMonth(component.periodStart),
        periodEnd: normalizeMonth(component.periodEnd),
        isActive: component.isActive,
        sortOrder: component.sortOrder,
      })),
  };
}

function contestsCoveringPeriod(params: {
  contests: RankingContest[];
  periodMonth: string;
  periodCode: string;
}): RankingContest[] {
  return params.contests.filter((contest) =>
    buildCoveragePeriods({
      coveragePeriodStart: contest.coveragePeriodStart,
      coveragePeriodEnd: contest.coveragePeriodEnd,
      maxCoveragePeriodMonth: params.periodMonth,
    }).includes(params.periodCode),
  );
}

function buildFormulaContest(coveringContests: RankingContest[], periodMonth: string): RankingContest {
  const sourceContest = coveringContests.find((contest) => isLvuRankingContestId(contest.id)) ?? coveringContests[0];

  return {
    id: sourceContest?.id ?? "__admin_ranking_adjustment_standard__",
    contestName: sourceContest?.contestName ?? "Ajustes Ranking",
    scope: "rep",
    participationScope: "all_fdv",
    paymentDate: null,
    coveragePeriodStart: periodMonth,
    coveragePeriodEnd: periodMonth,
    notes: null,
    isActive: true,
    components: [],
  };
}

function rankingGroupFromComplements(complements: RankingComplement[] | undefined): string | null {
  return complements?.find((item) => item.ranking)?.ranking ?? null;
}

function pointRowFromDetail(params: {
  participant: ContestParticipant;
  detail: CoveragePointDetail;
  affectedContestCount: number;
  rankingGroup: string | null;
}): RankingAdjustmentPointRow | null {
  const periodCode = periodMonthToCode(params.detail.period);
  const periodMonth = periodCodeToMonth(params.detail.period);
  const territory = normalizeText(params.participant.territory);
  if (!periodCode || !periodMonth || !territory) return null;

  const productKey = normalizeAdjustmentProduct(params.detail.productName);
  const adjustmentDelta = toNumber(params.detail.adjustmentDelta);
  const currentPoints = toNumber(params.detail.points);
  const basePoints = toNumber(params.detail.basePoints ?? currentPoints - adjustmentDelta);
  const id = [
    params.participant.employeeNumber ?? params.participant.id,
    territory,
    periodCode,
    productKey,
  ].join("|");

  return {
    id,
    participantId: params.participant.id,
    participantName: params.participant.name,
    employeeNumber: params.participant.employeeNumber ?? null,
    territory,
    rankingGroup: params.rankingGroup,
    periodCode,
    periodMonth,
    productKey,
    productName: displayProductName(params.detail.productName),
    formula: params.detail.formula,
    basePoints,
    adjustmentDelta,
    currentPoints,
    rawCoverage: toNumber(params.detail.rawCoverage),
    cappedCoverage: toNumber(params.detail.cappedCoverage),
    weight: toNumber(params.detail.weight),
    affectedContestCount: params.affectedContestCount,
  };
}

async function getAvailablePublishedPeriods(): Promise<string[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const result = await supabase
    .from("team_incentive_calculation_periods")
    .select("period_month")
    .in("status", ["final", "publicado"])
    .order("period_month", { ascending: false })
    .limit(36);

  if (result.error) return [];

  return Array.from(
    new Set(
      ((result.data ?? []) as PeriodRow[])
        .map((row) => normalizePeriodMonthInput(String(row.period_month ?? "")))
        .filter((period): period is string => Boolean(period)),
    ),
  );
}

async function loadAdjustments(periodMonths: string[]): Promise<{
  rows: RankingAdjustmentListItem[];
  message: string | null;
}> {
  const supabase = createAdminClient();
  if (!supabase) return { rows: [], message: "Admin client no disponible para ajustes ranking." };

  let query = supabase
    .from("ranking_point_adjustments")
    .select("id, period_month, territory, product_name, delta_points, reason, is_active, updated_at, updated_by")
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (periodMonths.length > 0) {
    query = query.in("period_month", periodMonths);
  }

  const result = await query;
  if (result.error) {
    if (isMissingRelationError(result.error)) {
      const tableName = getMissingRelationName(result.error) ?? "ranking_point_adjustments";
      return { rows: [], message: `Tabla ${tableName} no creada. Ejecuta docs/ranking-point-adjustments-schema.sql.` };
    }
    return { rows: [], message: `No se pudieron cargar ajustes ranking: ${result.error.message}` };
  }

  return {
    rows: ((result.data ?? []) as AdjustmentRow[])
      .map((row) => {
        const periodMonth = normalizePeriodMonthInput(String(row.period_month ?? ""));
        const periodCode = periodMonthToCode(periodMonth);
        return {
          id: String(row.id ?? "").trim(),
          periodCode: periodCode ?? "",
          periodMonth: periodMonth ?? "",
          territory: String(row.territory ?? "").trim(),
          productKey: normalizeAdjustmentProduct(row.product_name),
          productName: displayProductName(row.product_name),
          deltaPoints: toNumber(row.delta_points),
          reason: row.reason ?? null,
          isActive: row.is_active !== false,
          updatedAt: row.updated_at ?? null,
          updatedBy: row.updated_by ?? null,
        };
      })
      .filter((row) => row.id && row.periodCode && row.territory),
    message: null,
  };
}

function getSnapshotValue(snapshot: Record<string, unknown> | null, key: string): unknown {
  return snapshot && typeof snapshot === "object" ? snapshot[key] : null;
}

function normalizeAuditAction(row: AuditRow): string {
  const action = String(row.action ?? "").trim().toLowerCase();
  const previousActive = getSnapshotValue(row.previous_data, "is_active");
  const newActive = getSnapshotValue(row.new_data, "is_active");

  if (action === "insert") return "create";
  if (action === "delete") return "hard_delete";
  if (action === "update" && previousActive !== false && newActive === false) return "delete";
  if (action === "update" && previousActive === false && newActive !== false) return "restore";
  return action || "update";
}

async function loadAuditItems(): Promise<{
  rows: RankingAdjustmentAuditItem[];
  message: string | null;
}> {
  const supabase = createAdminClient();
  if (!supabase) return { rows: [], message: "Admin client no disponible para auditoria ranking." };

  const result = await supabase
    .from("ranking_point_adjustment_audit")
    .select("id, adjustment_id, action, previous_data, new_data, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .limit(120);

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      const tableName = getMissingRelationName(result.error) ?? "ranking_point_adjustment_audit";
      return { rows: [], message: `Tabla ${tableName} no creada. Ejecuta docs/ranking-point-adjustments-schema.sql.` };
    }
    return { rows: [], message: `No se pudo cargar auditoria ranking: ${result.error.message}` };
  }

  return {
    rows: ((result.data ?? []) as AuditRow[]).map((row) => {
      const newSnapshot = row.new_data;
      const previousSnapshot = row.previous_data;
      const effectiveSnapshot = newSnapshot ?? previousSnapshot;
      const periodMonth = normalizePeriodMonthInput(String(getSnapshotValue(effectiveSnapshot, "period_month") ?? ""));
      return {
        id: String(row.id ?? "").trim(),
        adjustmentId: row.adjustment_id ? String(row.adjustment_id) : null,
        action: normalizeAuditAction(row),
        periodCode: periodMonthToCode(periodMonth),
        territory: String(getSnapshotValue(effectiveSnapshot, "territory") ?? "").trim() || null,
        productName: displayProductName(getSnapshotValue(effectiveSnapshot, "product_name")),
        previousDelta: previousSnapshot ? toNumber(getSnapshotValue(previousSnapshot, "delta_points")) : null,
        newDelta: newSnapshot ? toNumber(getSnapshotValue(newSnapshot, "delta_points")) : null,
        previousActive: previousSnapshot ? getSnapshotValue(previousSnapshot, "is_active") !== false : null,
        newActive: newSnapshot ? getSnapshotValue(newSnapshot, "is_active") !== false : null,
        changedAt: row.changed_at ?? null,
        changedBy: row.changed_by ?? null,
      };
    }).filter((row) => row.id),
    message: null,
  };
}

async function buildPointRows(params: {
  periodMonth: string | null;
  messages: string[];
}): Promise<RankingAdjustmentPointRow[]> {
  const supabase = createAdminClient();
  if (!supabase) {
    params.messages.push("Admin client de Supabase no disponible.");
    return [];
  }

  const periodCode = periodMonthToCode(params.periodMonth);
  if (!params.periodMonth || !periodCode) return [];

  const contestsData = await getRankingContestsData();
  if (contestsData.contestsStorageMessage) params.messages.push(contestsData.contestsStorageMessage);

  const contests = contestsData.contests
    .filter((contest) => contest.isActive)
    .map(toRankingContest);
  const coveringContests = contestsCoveringPeriod({
    contests,
    periodMonth: params.periodMonth,
    periodCode,
  });
  const formulaContest = buildFormulaContest(coveringContests, params.periodMonth);

  const [coverageResult, pointAdjustmentsResult] = await Promise.all([
    fetchCoverageRowsForPeriods([periodCode]),
    getActiveRankingPointAdjustmentsForPeriods({
      supabase,
      periodCodes: [periodCode],
    }),
  ]);

  if (coverageResult.message) params.messages.push(coverageResult.message);
  if (pointAdjustmentsResult.message) params.messages.push(pointAdjustmentsResult.message);

  const teamIds = coverageResult.rows
    .map((row) => normalizeText(row.team_id))
    .filter(Boolean);
  let complementsByTeamId = new Map<string, RankingComplement[]>();
  try {
    complementsByTeamId = await getLatestRankingComplementsByTeamIds({ supabase, teamIds });
  } catch (error) {
    params.messages.push(error instanceof Error ? error.message : "No se pudieron cargar complementos ranking.");
  }

  const rowsByKey = new Map<string, RankingAdjustmentPointRow>();
  for (const coverageRow of coverageResult.rows) {
    const participant = buildParticipantFromCoverageRow(coverageRow);
    const complements = complementsByTeamId.get(normalizeTeamKey(coverageRow.team_id));
    const detail = applyRankingPointAdjustment({
      detail: calculateCoveragePoints({
        result: coverageRow,
        contest: formulaContest,
        rankingComplementsForTeam: complements,
      }),
      participant,
      adjustments: pointAdjustmentsResult.adjustments,
    });
    const pointRow = pointRowFromDetail({
      participant,
      detail,
      affectedContestCount: coveringContests.length,
      rankingGroup: rankingGroupFromComplements(complements),
    });
    if (!pointRow) continue;

    const current = rowsByKey.get(pointRow.id);
    if (!current) {
      rowsByKey.set(pointRow.id, pointRow);
      continue;
    }

    rowsByKey.set(pointRow.id, {
      ...current,
      basePoints: current.basePoints + pointRow.basePoints,
      adjustmentDelta: current.adjustmentDelta + pointRow.adjustmentDelta,
      currentPoints: current.currentPoints + pointRow.currentPoints,
      rawCoverage: pointRow.rawCoverage,
      cappedCoverage: pointRow.cappedCoverage,
      weight: current.weight + pointRow.weight,
    });
  }

  return Array.from(rowsByKey.values()).sort((a, b) =>
    a.periodCode.localeCompare(b.periodCode) ||
    a.territory.localeCompare(b.territory, "es") ||
    a.productName.localeCompare(b.productName, "es") ||
    a.participantName.localeCompare(b.participantName, "es"),
  );
}

export async function getRankingAdjustmentsPageData(requestedPeriod?: string | null): Promise<RankingAdjustmentsPageData> {
  const messages: string[] = [];
  const availablePeriods = await getAvailablePublishedPeriods();
  const normalizedRequested = normalizePeriodMonthInput(requestedPeriod ?? "");
  const periodMonth = normalizedRequested && (availablePeriods.length === 0 || availablePeriods.includes(normalizedRequested))
    ? normalizedRequested
    : availablePeriods[0] ?? normalizedRequested ?? null;

  const pointRows = await buildPointRows({ periodMonth, messages });
  const adjustmentPeriodMonths = periodMonth ? [periodMonth] : [];
  const [adjustmentsData, auditData] = await Promise.all([
    loadAdjustments(adjustmentPeriodMonths),
    loadAuditItems(),
  ]);

  return {
    periodMonth,
    periodInput: (periodMonth ?? "").slice(0, 7),
    availablePeriodInputs: availablePeriods.map((period) => period.slice(0, 7)),
    pointRows,
    adjustments: adjustmentsData.rows,
    auditItems: auditData.rows,
    messages: [
      ...messages,
      adjustmentsData.message,
      auditData.message,
    ].filter((message): message is string => Boolean(message)),
  };
}
