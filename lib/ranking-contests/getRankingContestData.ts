import { getRankingContestsData } from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCoveragePeriods, belongsToParticipant, calculateCoveragePoints, fetchCoverageRowsForPeriods } from "@/lib/ranking-contests/coverage";
import { getContestParticipants } from "@/lib/ranking-contests/participants";
import { evaluateContestComponent, resolveQualification } from "@/lib/ranking-contests/qualification";
import { attachRankingGroupsToParticipants, getLatestRankingComplementsByTeamIds, normalizeTeamKey } from "@/lib/ranking-contests/rankingGroups";
import type {
  BigQueryCoverageRow,
  ContestParticipant,
  ContestRankingRow,
  CoveragePointDetail,
  RankingComplement,
  RankingContest,
  RankingContestData,
} from "@/lib/ranking-contests/types";

function normalizeMonth(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeGroupKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeTextKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

async function getMaxCoveragePeriodMonth(): Promise<string | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const result = await supabase
    .from("team_incentive_calculation_periods")
    .select("period_month")
    .in("status", ["final", "publicado"])
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle<{ period_month: string | null }>();

  if (result.error) return null;
  return normalizeMonth(result.data?.period_month);
}

async function getContestDefinitions(params?: {
  contestId?: string | null;
}): Promise<{ contests: RankingContest[]; message: string | null }> {
  const contestsData = await getRankingContestsData();
  if (!contestsData.contestsStorageReady) {
    return { contests: [], message: contestsData.contestsStorageMessage ?? "No se pudieron cargar concursos." };
  }

  return {
    contests: contestsData.contests
      .filter((contest) => contest.isActive)
      .filter((contest) => !params?.contestId || contest.id === params.contestId)
      .map((contest) => ({
        id: contest.id,
        contestName: contest.contestName,
        scope: contest.scope,
        participationScope: contest.participationScope,
        paymentDate: normalizeMonth(contest.paymentDate),
        coveragePeriodStart: normalizeMonth(contest.coveragePeriodStart),
        coveragePeriodEnd: normalizeMonth(contest.coveragePeriodEnd),
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
      })),
    message: null,
  };
}

async function getAllowedRankingGroupsByContest(params?: {
  contestIds?: string[];
}): Promise<Map<string, Set<string>>> {
  const supabase = createAdminClient();
  const result = new Map<string, Set<string>>();
  if (!supabase) return result;

  let participantsQuery = supabase
    .from("ranking_contest_participants")
    .select("contest_id, ranking_group_id");
  if (params?.contestIds && params.contestIds.length > 0) {
    participantsQuery = participantsQuery.in("contest_id", params.contestIds);
  }
  const participantsResult = await participantsQuery;

  if (participantsResult.error) return result;

  const groupIds = Array.from(
    new Set(
      ((participantsResult.data ?? []) as Array<{ ranking_group_id?: unknown }>)
        .map((row) => String(row.ranking_group_id ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (groupIds.length === 0) return result;

  const groupsResult = await supabase
    .from("ranking_groups")
    .select("id, name")
    .in("id", groupIds);

  if (groupsResult.error) return result;

  const groupNameById = new Map(
    ((groupsResult.data ?? []) as Array<{ id?: unknown; name?: unknown }>)
      .map((row) => [String(row.id ?? "").trim(), normalizeGroupKey(row.name)] as const)
      .filter(([id, name]) => Boolean(id && name)),
  );

  for (const row of (participantsResult.data ?? []) as Array<{ contest_id?: unknown; ranking_group_id?: unknown }>) {
    const contestId = String(row.contest_id ?? "").trim();
    const groupName = groupNameById.get(String(row.ranking_group_id ?? "").trim());
    if (!contestId || !groupName) continue;
    const groups = result.get(contestId) ?? new Set<string>();
    groups.add(groupName);
    result.set(contestId, groups);
  }

  return result;
}

function assignRanks(rows: ContestRankingRow[]): ContestRankingRow[] {
  const grouped = new Map<string, ContestRankingRow[]>();
  for (const row of rows) {
    const groupKey = row.participationScope === "ranking_groups" ? row.rankingGroup || "__sin_grupo__" : "__all__";
    const key = `${row.contestId}|${groupKey}`;
    const arr = grouped.get(key) ?? [];
    arr.push(row);
    grouped.set(key, arr);
  }

  for (const arr of grouped.values()) {
    const qualifiedRows = arr
      .filter((row) => row.qualificationStatus === "qualified" || row.qualificationStatus === "no_components")
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return a.participantName.localeCompare(b.participantName, "es");
      });

    for (let index = 0; index < qualifiedRows.length; index += 1) {
      qualifiedRows[index].rank = index + 1;
    }
  }

  return rows.sort((a, b) => {
    const contestDiff = a.contestName.localeCompare(b.contestName, "es");
    if (contestDiff !== 0) return contestDiff;
    if (a.rank && b.rank && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank && !b.rank) return -1;
    if (!a.rank && b.rank) return 1;
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.participantName.localeCompare(b.participantName, "es");
  });
}

function isSameManagerTeam(params: {
  manager: ContestParticipant;
  member: ContestParticipant;
}): boolean {
  const managerTerritory = normalizeTextKey(params.manager.territory);
  const memberManagerTerritory = normalizeTextKey(params.member.raw.territorio_padre);
  if (managerTerritory && memberManagerTerritory && managerTerritory === memberManagerTerritory) return true;

  const managerTeamId = normalizeTextKey(params.manager.teamId);
  const memberTeamId = normalizeTextKey(params.member.teamId);
  return Boolean(managerTeamId && memberTeamId && managerTeamId === memberTeamId);
}

function getActiveTeamMembersInRanking(params: {
  manager: ContestParticipant;
  participants: ContestParticipant[];
  contest: RankingContest;
}): ContestParticipant[] {
  return params.participants.filter((member) => {
    if (member.scope !== "rep") return false;
    if (!isSameManagerTeam({ manager: params.manager, member })) return false;
    if (params.contest.participationScope !== "ranking_groups") return true;
    return normalizeGroupKey(member.rankingGroup) === normalizeGroupKey(params.manager.rankingGroup);
  });
}

function buildTeamAveragePointDetails(params: {
  manager: ContestParticipant;
  members: ContestParticipant[];
  contest: RankingContest;
  contestCoverageRows: BigQueryCoverageRow[];
  complementsByTeamId: Map<string, RankingComplement[]>;
}): CoveragePointDetail[] {
  const teamMemberPoints: Array<{ period: string; representativeName: string; points: number }> = [];
  const memberSummaries = params.members.map((member) => {
    const memberCoverageRows = params.contestCoverageRows.filter((result) => belongsToParticipant(result, member));
    const complements = params.complementsByTeamId.get(normalizeTeamKey(member.teamId));
    const memberPointDetails = memberCoverageRows.map((result) => calculateCoveragePoints({
      result,
      contest: params.contest,
      rankingComplementsForTeam: complements,
    }));
    const points = memberPointDetails.reduce((sum, detail) => sum + toNumber(detail.points), 0);

    const pointsByPeriod = new Map<string, number>();
    for (const detail of memberPointDetails) {
      const period = String(detail.period || "-");
      pointsByPeriod.set(period, (pointsByPeriod.get(period) ?? 0) + toNumber(detail.points));
    }
    for (const [period, periodPoints] of pointsByPeriod.entries()) {
      teamMemberPoints.push({
        period,
        representativeName: member.name,
        points: periodPoints,
      });
    }

    return { member, points };
  });

  const activeMembersCount = memberSummaries.length;
  if (activeMembersCount === 0) {
    return [{
      period: "equipo",
      teamId: params.manager.teamId ?? null,
      productName: "Sin miembros activos en ranking",
      rawCoverage: 0,
      cappedCoverage: 0,
      weight: 0,
      formula: "team_average",
      points: 0,
    }];
  }

  const teamTotal = memberSummaries.reduce((sum, item) => sum + item.points, 0);
  let cumulativeTotalPoints = 0;
  const teamPeriodSummaries = Array.from(
    teamMemberPoints.reduce((map, item) => {
      const current = map.get(item.period) ?? {
        period: item.period,
        totalPoints: 0,
        averagePoints: 0,
        membersCount: activeMembersCount,
        cumulativeTotalPoints: 0,
        cumulativeAveragePoints: 0,
      };
      current.totalPoints += item.points;
      current.averagePoints = current.totalPoints / activeMembersCount;
      map.set(item.period, current);
      return map;
    }, new Map<string, {
      period: string;
      totalPoints: number;
      averagePoints: number;
      membersCount: number;
      cumulativeTotalPoints: number;
      cumulativeAveragePoints: number;
    }>())
      .values(),
  )
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((summary) => {
      cumulativeTotalPoints += summary.totalPoints;
      return {
        ...summary,
        cumulativeTotalPoints,
        cumulativeAveragePoints: cumulativeTotalPoints / activeMembersCount,
      };
    });

  return [{
    period: "equipo",
    teamId: params.manager.teamId ?? null,
    productName: "Promedio de puntos del equipo",
    rawCoverage: 0,
    cappedCoverage: 0,
    weight: activeMembersCount,
    formula: "team_average",
    points: teamTotal / activeMembersCount,
    teamTotalPoints: teamTotal,
    teamMembersCount: activeMembersCount,
    teamMemberPoints: teamMemberPoints.sort((a, b) => a.period.localeCompare(b.period) || a.representativeName.localeCompare(b.representativeName, "es")),
    teamPeriodSummaries,
  }];
}

export async function getRankingContestData(params?: {
  contestId?: string | null;
}): Promise<RankingContestData> {
  const supabase = createAdminClient();
  const messages: string[] = [];
  if (!supabase) {
    return { ok: false, maxCoveragePeriodMonth: null, contests: [], rows: [], messages: ["Admin client de Supabase no disponible."] };
  }

  const [maxCoveragePeriodMonth, contestDefinitions] = await Promise.all([
    getMaxCoveragePeriodMonth(),
    getContestDefinitions({ contestId: params?.contestId ?? null }),
  ]);

  if (contestDefinitions.message) messages.push(contestDefinitions.message);
  const contests = contestDefinitions.contests;
  const allowedGroupsByContest = await getAllowedRankingGroupsByContest({
    contestIds: contests.map((contest) => contest.id),
  });

  if (!maxCoveragePeriodMonth) {
    return { ok: true, maxCoveragePeriodMonth: null, contests, rows: [], messages: ["No hay periodo final/publicado para calcular cobertura.", ...messages] };
  }

  if (contests.length === 0) {
    return { ok: true, maxCoveragePeriodMonth, contests, rows: [], messages: ["No hay concursos activos configurados.", ...messages] };
  }

  const participantsResult = await getContestParticipants({ supabase, maxCoveragePeriodMonth });
  if (participantsResult.message) messages.push(participantsResult.message);

  if (participantsResult.participants.length === 0) {
    return { ok: true, maxCoveragePeriodMonth, contests, rows: [], messages: ["No hay participantes activos para el periodo maximo.", ...messages] };
  }

  const teamIds = participantsResult.participants.map((participant) => participant.teamId ?? "").filter(Boolean);
  let complementsByTeamId = new Map<string, RankingComplement[]>();
  try {
    complementsByTeamId = await getLatestRankingComplementsByTeamIds({ supabase, teamIds });
  } catch (error) {
    messages.push(error instanceof Error ? error.message : "No se pudieron cargar complementos ranking.");
  }

  const participants = attachRankingGroupsToParticipants({
    participants: participantsResult.participants,
    complementsByTeamId,
  });

  const periods = contests.flatMap((contest) => buildCoveragePeriods({
    coveragePeriodStart: contest.coveragePeriodStart,
    coveragePeriodEnd: contest.coveragePeriodEnd,
    maxCoveragePeriodMonth,
  }));

  let coverageRows: BigQueryCoverageRow[] = [];
  try {
    const coverageResult = await fetchCoverageRowsForPeriods(periods);
    coverageRows = coverageResult.rows;
    if (coverageResult.message) messages.push(coverageResult.message);
  } catch (error) {
    messages.push(error instanceof Error ? error.message : "No se pudieron cargar resultados de BigQuery.");
  }

  const rows: ContestRankingRow[] = [];

  for (const contest of contests) {
    const contestPeriods = new Set(buildCoveragePeriods({
      coveragePeriodStart: contest.coveragePeriodStart,
      coveragePeriodEnd: contest.coveragePeriodEnd,
      maxCoveragePeriodMonth,
    }));

    const contestCoverageRows = coverageRows.filter((row) => contestPeriods.has(String(row.periodo ?? "")));
    const allowedGroups = allowedGroupsByContest.get(contest.id);
    const contestParticipants = participants.filter((participant) => {
      if (participant.scope !== contest.scope) return false;
      if (contest.participationScope !== "ranking_groups" || !allowedGroups || allowedGroups.size === 0) return true;
      return allowedGroups.has(normalizeGroupKey(participant.rankingGroup));
    });

    for (const participant of contestParticipants) {
      const componentEvaluations = [];
      for (const component of contest.components) {
        componentEvaluations.push(await evaluateContestComponent({
          supabase,
          component,
          participant,
          contest,
          maxCoveragePeriodMonth,
        }));
      }
      const qualification = resolveQualification(componentEvaluations);
      const participantCoverageRows = contestCoverageRows.filter((result) => belongsToParticipant(result, participant));
      const complements = complementsByTeamId.get(normalizeTeamKey(participant.teamId));
      const pointDetails = participant.scope === "manager"
        ? buildTeamAveragePointDetails({
          manager: participant,
          members: getActiveTeamMembersInRanking({ manager: participant, participants, contest }),
          contest,
          contestCoverageRows,
          complementsByTeamId,
        })
        : participantCoverageRows.map((result) => calculateCoveragePoints({
          result,
          contest,
          rankingComplementsForTeam: complements,
        }));

      rows.push({
        participantId: participant.id,
        participantName: participant.name,
        scope: participant.scope,
        employeeNumber: participant.employeeNumber ?? null,
        email: participant.email ?? null,
        territory: participant.territory ?? null,
        teamId: participant.teamId ?? null,
        rankingGroup: participant.rankingGroup ?? null,
        contestId: contest.id,
        contestName: contest.contestName,
        participationScope: contest.participationScope,
        ...qualification,
        componentEvaluations,
        totalPoints: pointDetails.reduce((sum, detail) => sum + toNumber(detail.points), 0),
        pointDetails,
        rank: null,
      });
    }
  }

  return {
    ok: messages.length === 0 || rows.length > 0,
    maxCoveragePeriodMonth,
    contests,
    rows: assignRanks(rows),
    messages,
  };
}
