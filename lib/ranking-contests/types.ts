export type ContestScope = "rep" | "manager";
export type ParticipationScope = "all_fdv" | "ranking_groups";

export type ContestParticipant = {
  id: string;
  scope: ContestScope;
  userId?: string | null;
  employeeNumber?: string | number | null;
  email?: string | null;
  name: string;
  territory?: string | null;
  teamId?: string | null;
  rankingGroup?: string | null;
  raw: Record<string, unknown>;
};

export type RankingContest = {
  id: string;
  contestName: string;
  scope: ContestScope;
  participationScope: ParticipationScope;
  paymentDate: string | null;
  coveragePeriodStart: string | null;
  coveragePeriodEnd: string | null;
  isActive: boolean;
  components: RankingContestComponent[];
};

export type RankingContestComponent = {
  id: string;
  contestId: string;
  componentName: string;
  thresholdValue: number | string | null;
  periodStart: string | null;
  periodEnd: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type RankingComplement = {
  periodMonth: string | null;
  teamId: string | null;
  productName: string | null;
  ranking: string | null;
  puntosRankingLvu: number | null;
  prodWeight: number | null;
  isActive: boolean;
};

export type BigQueryCoverageRow = {
  team_id: string | null;
  product_name: string | null;
  prod_weight: number | string | null;
  cobertura: number | string | null;
  garantia: boolean | string | null;
  nombre: string | null;
  empleado: number | string | null;
  representante: string | null;
  manager: string | null;
  periodo: string | null;
};

export type ContestComponentEvaluation = {
  componentId: string;
  componentName: string;
  thresholdValue: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  value: number | string | boolean | null;
  passed: boolean;
  status: "passed" | "failed" | "pending" | "not_implemented";
  reason?: string;
};

export type CoveragePointDetail = {
  period: string;
  teamId: string | null;
  productName: string | null;
  rawCoverage: number;
  cappedCoverage: number;
  weight: number;
  formula: "lvu" | "standard" | "guarantee" | "team_average";
  points: number;
  missingComplement?: boolean;
  teamTotalPoints?: number;
  teamMembersCount?: number;
  teamMemberPoints?: Array<{
    period: string;
    representativeName: string;
    points: number;
  }>;
  teamPeriodSummaries?: Array<{
    period: string;
    totalPoints: number;
    averagePoints: number;
    membersCount: number;
    cumulativeTotalPoints: number;
    cumulativeAveragePoints: number;
  }>;
};

export type ContestRankingRow = {
  participantId: string;
  participantName: string;
  scope: ContestScope;
  employeeNumber?: string | number | null;
  email?: string | null;
  territory?: string | null;
  teamId?: string | null;
  rankingGroup?: string | null;
  contestId: string;
  contestName: string;
  participationScope: ParticipationScope;
  qualificationStatus: "qualified" | "disqualified" | "pending" | "no_components";
  qualificationLabel: string;
  componentsPassed: number;
  componentsTotal: number;
  componentEvaluations: ContestComponentEvaluation[];
  totalPoints: number;
  pointDetails: CoveragePointDetail[];
  rank?: number | null;
};

export type RankingContestData = {
  ok: boolean;
  maxCoveragePeriodMonth: string | null;
  contests: RankingContest[];
  rows: ContestRankingRow[];
  messages: string[];
};
