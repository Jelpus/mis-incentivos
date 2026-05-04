import type { ProfileRole } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatPeriodMonthLabel,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import {
  getRankingContestsData,
  type RankingContestsData,
} from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { getRankingContestData } from "@/lib/ranking-contests/getRankingContestData";
import type { RankingContestData } from "@/lib/ranking-contests/types";

type PeriodRow = {
  period_month: string | null;
  file_code?: string | null;
};

type RelationRow = {
  sales_force_status_id: string | null;
  manager_status_id: string | null;
};

type SalesStatusAnchor = {
  period_month: string | null;
  team_id: string | null;
  territorio_individual: string | null;
  territorio_padre: string | null;
  no_empleado: number | null;
  nombre_completo: string | null;
};

type ManagerStatusAnchor = {
  period_month: string | null;
  team_id: string | null;
  territorio_manager: string | null;
  no_empleado_manager: number | null;
  nombre_manager: string | null;
};

type KpiAggRow = {
  period_month: string | null;
  territorio_individual: string | null;
  empleado: number | null;
  nombre: string | null;
  tier: string | null;
  total_visitas_top: number | null;
  total_objetivos: number | null;
  total_visitas: number | null;
  garantia: boolean | null;
};

type IcvaAggRow = {
  period_month: string | null;
  territorio_individual: string | null;
  empleado: number | null;
  nombre: string | null;
  total_calls: number | null;
  icva_calls: number | null;
  on_time_call: number | null;
  on_time_icva: number | null;
};

type TeamMemberRow = {
  territorio_individual: string | null;
  no_empleado: number | null;
};

export type RankingScope = "self" | "manager_team" | "all";

export type RankingMetricDetail = {
  numerator: number;
  denominator: number;
  coverage: number;
  threshold: number;
};

export type RankingPerformanceRow = {
  id: string;
  nombre: string;
  territorio: string;
  empleado: number | null;
  callPlanAdherence: RankingMetricDetail;
  ayudasVisuales: RankingMetricDetail;
  documentacion48h: RankingMetricDetail;
  metCount: number;
  averageCoverage: number;
  meet: boolean;
};

export type PerfilRankingData = {
  ok: boolean;
  scope: RankingScope;
  role: ProfileRole | null;
  periodMonth: string | null;
  periodLabel: string;
  availablePeriods: string[];
  contestsData: RankingContestsData;
  contestRankingData: RankingContestData;
  performanceRows: RankingPerformanceRow[];
  message: string | null;
  canAudit: boolean;
};

function resolveScope(role: ProfileRole | null): RankingScope {
  if (role === "admin" || role === "super_admin" || role === "viewer") return "all";
  if (role === "manager") return "manager_team";
  return "self";
}

function toPositiveNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function safeCoverage(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeTerritory(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function makeEntityKey(params: {
  empleado: number | null;
  territorio: string;
  nombre: string;
}) {
  if (params.empleado && params.empleado > 0) return `emp:${params.empleado}`;
  const territory = params.territorio.trim().toUpperCase();
  if (territory) return `terr:${territory}`;
  return `name:${params.nombre.trim().toUpperCase()}`;
}

async function getAvailableRankingPeriods() {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const sourceFilesResult = await supabase
    .from("ranking_source_files")
    .select("period_month, file_code")
    .in("file_code", ["kpi_local_ytd", "icva_48hrs"])
    .order("period_month", { ascending: false })
    .limit(100);

  if (!sourceFilesResult.error) {
    const filesByPeriod = new Map<string, Set<string>>();
    for (const row of (sourceFilesResult.data ?? []) as PeriodRow[]) {
      const period = normalizePeriodMonthInput(String(row.period_month ?? "").trim());
      const fileCode = String(row.file_code ?? "").trim();
      if (!period || !fileCode) continue;
      const current = filesByPeriod.get(period) ?? new Set<string>();
      current.add(fileCode);
      filesByPeriod.set(period, current);
    }

    const completePeriods = Array.from(filesByPeriod.entries())
      .filter(([, files]) => files.has("kpi_local_ytd") && files.has("icva_48hrs"))
      .map(([period]) => period)
      .sort((a, b) => b.localeCompare(a));

    if (completePeriods.length > 0) return completePeriods;
  }

  const [kpiResult, icvaResult] = await Promise.all([
    supabase.from("ranking_kpi_local_ytd_agg").select("period_month").order("period_month", { ascending: false }).limit(24),
    supabase.from("ranking_icva_48hrs_agg").select("period_month").order("period_month", { ascending: false }).limit(24),
  ]);

  if (kpiResult.error || icvaResult.error) return [];
  const kpiPeriods = new Set(
    ((kpiResult.data ?? []) as PeriodRow[])
      .map((row) => normalizePeriodMonthInput(String(row.period_month ?? "")))
      .filter((value): value is string => Boolean(value)),
  );
  const icvaPeriods = new Set(
    ((icvaResult.data ?? []) as PeriodRow[])
      .map((row) => normalizePeriodMonthInput(String(row.period_month ?? "")))
      .filter((value): value is string => Boolean(value)),
  );

  return Array.from(kpiPeriods)
    .filter((period) => icvaPeriods.has(period))
    .sort((a, b) => b.localeCompare(a));
}

async function getSalesAnchor(userId: string): Promise<SalesStatusAnchor | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const relation = await supabase
    .from("profile_relations")
    .select("sales_force_status_id")
    .eq("user_id", userId)
    .eq("relation_type", "sales_force")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RelationRow>();

  if (!relation.data?.sales_force_status_id) return null;

  const status = await supabase
    .from("sales_force_status")
    .select("period_month, team_id, territorio_individual, territorio_padre, no_empleado, nombre_completo")
    .eq("id", relation.data.sales_force_status_id)
    .eq("is_deleted", false)
    .maybeSingle<SalesStatusAnchor>();

  return status.data ?? null;
}

async function getManagerAnchor(userId: string): Promise<ManagerStatusAnchor | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const relation = await supabase
    .from("profile_relations")
    .select("manager_status_id")
    .eq("user_id", userId)
    .eq("relation_type", "manager")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RelationRow>();

  if (!relation.data?.manager_status_id) return null;

  const status = await supabase
    .from("manager_status")
    .select("period_month, team_id, territorio_manager, no_empleado_manager, nombre_manager")
    .eq("id", relation.data.manager_status_id)
    .eq("is_deleted", false)
    .maybeSingle<ManagerStatusAnchor>();

  return status.data ?? null;
}

async function getLatestStatusPeriod(periodMonth: string): Promise<string | null> {
  const supabase = createAdminClient();
  const normalized = normalizePeriodMonthInput(periodMonth);
  if (!supabase || !normalized) return null;

  const result = await supabase
    .from("sales_force_status")
    .select("period_month")
    .lte("period_month", normalized)
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle<PeriodRow>();

  if (result.error) return null;
  return normalizePeriodMonthInput(String(result.data?.period_month ?? ""));
}

async function getManagerTeamMembers(params: {
  periodMonth: string;
  managerTerritory: string | null;
  teamId: string | null;
}) {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const statusPeriod = await getLatestStatusPeriod(params.periodMonth);
  if (!statusPeriod) return [];

  let query = supabase
    .from("sales_force_status")
    .select("territorio_individual, no_empleado")
    .eq("period_month", statusPeriod)
    .eq("is_deleted", false)
    .eq("is_active", true);

  const managerTerritory = String(params.managerTerritory ?? "").trim();
  const teamId = String(params.teamId ?? "").trim();
  if (managerTerritory) {
    query = query.ilike("territorio_padre", managerTerritory);
  } else if (teamId) {
    query = query.eq("team_id", teamId);
  } else {
    return [];
  }

  const result = await query;
  if (result.error) return [];
  return (result.data ?? []) as TeamMemberRow[];
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function loadRankingAggRows(params: {
  periodMonth: string;
  scope: RankingScope;
  employeeIds: number[];
  territories: string[];
}) {
  const supabase = createAdminClient();
  const kpiRows: KpiAggRow[] = [];
  const icvaRows: IcvaAggRow[] = [];
  if (!supabase) return { kpiRows, icvaRows, error: "Admin client no disponible." };
  const adminClient = supabase;

  async function collectByEmployees(employeeIds: number[]) {
    for (const chunk of chunkArray(employeeIds, 200)) {
      const [kpiResult, icvaResult] = await Promise.all([
        adminClient
          .from("ranking_kpi_local_ytd_agg")
          .select("period_month, territorio_individual, empleado, nombre, tier, total_visitas_top, total_objetivos, total_visitas, garantia")
          .eq("period_month", params.periodMonth)
          .in("empleado", chunk),
        adminClient
          .from("ranking_icva_48hrs_agg")
          .select("period_month, territorio_individual, empleado, nombre, total_calls, icva_calls, on_time_call, on_time_icva")
          .eq("period_month", params.periodMonth)
          .in("empleado", chunk),
      ]);
      if (kpiResult.error || icvaResult.error) return kpiResult.error?.message ?? icvaResult.error?.message ?? "Error ranking.";
      kpiRows.push(...((kpiResult.data ?? []) as KpiAggRow[]));
      icvaRows.push(...((icvaResult.data ?? []) as IcvaAggRow[]));
    }
    return null;
  }

  async function collectByTerritories(territories: string[]) {
    for (const chunk of chunkArray(territories, 200)) {
      const [kpiResult, icvaResult] = await Promise.all([
        adminClient
          .from("ranking_kpi_local_ytd_agg")
          .select("period_month, territorio_individual, empleado, nombre, tier, total_visitas_top, total_objetivos, total_visitas, garantia")
          .eq("period_month", params.periodMonth)
          .in("territorio_individual", chunk),
        adminClient
          .from("ranking_icva_48hrs_agg")
          .select("period_month, territorio_individual, empleado, nombre, total_calls, icva_calls, on_time_call, on_time_icva")
          .eq("period_month", params.periodMonth)
          .in("territorio_individual", chunk),
      ]);
      if (kpiResult.error || icvaResult.error) return kpiResult.error?.message ?? icvaResult.error?.message ?? "Error ranking.";
      kpiRows.push(...((kpiResult.data ?? []) as KpiAggRow[]));
      icvaRows.push(...((icvaResult.data ?? []) as IcvaAggRow[]));
    }
    return null;
  }

  if (params.scope === "all") {
    const [kpiResult, icvaResult] = await Promise.all([
      adminClient
        .from("ranking_kpi_local_ytd_agg")
        .select("period_month, territorio_individual, empleado, nombre, tier, total_visitas_top, total_objetivos, total_visitas, garantia")
        .eq("period_month", params.periodMonth)
        .limit(2000),
      adminClient
        .from("ranking_icva_48hrs_agg")
        .select("period_month, territorio_individual, empleado, nombre, total_calls, icva_calls, on_time_call, on_time_icva")
        .eq("period_month", params.periodMonth)
        .limit(2000),
    ]);
    if (kpiResult.error || icvaResult.error) {
      return { kpiRows, icvaRows, error: kpiResult.error?.message ?? icvaResult.error?.message ?? "Error ranking." };
    }
    kpiRows.push(...((kpiResult.data ?? []) as KpiAggRow[]));
    icvaRows.push(...((icvaResult.data ?? []) as IcvaAggRow[]));
  } else if (params.employeeIds.length > 0) {
    const error = await collectByEmployees(params.employeeIds);
    if (error) return { kpiRows, icvaRows, error };
    if (kpiRows.length === 0 && icvaRows.length === 0 && params.territories.length > 0) {
      const territoryError = await collectByTerritories(params.territories);
      if (territoryError) return { kpiRows, icvaRows, error: territoryError };
    }
  } else if (params.territories.length > 0) {
    const error = await collectByTerritories(params.territories);
    if (error) return { kpiRows, icvaRows, error };
  }

  return { kpiRows, icvaRows, error: null };
}

function buildPerformanceRows(kpiRows: KpiAggRow[], icvaRows: IcvaAggRow[]): RankingPerformanceRow[] {
  type Group = {
    nombre: string;
    territorio: string;
    empleado: number | null;
    visitasTop: number;
    objetivos: number;
    icvaCalls: number;
    onTimeIcva: number;
    totalCalls: number;
    onTimeCall: number;
  };

  const groups = new Map<string, Group>();

  function getGroup(row: { empleado: number | null; territorio_individual: string | null; nombre: string | null }) {
    const nombre = String(row.nombre ?? "").trim() || "Sin nombre";
    const territorio = normalizeTerritory(row.territorio_individual);
    const empleado = row.empleado ?? null;
    const key = makeEntityKey({ empleado, territorio, nombre });
    const current = groups.get(key) ?? {
      nombre,
      territorio,
      empleado,
      visitasTop: 0,
      objetivos: 0,
      icvaCalls: 0,
      onTimeIcva: 0,
      totalCalls: 0,
      onTimeCall: 0,
    };
    if (!current.territorio && territorio) current.territorio = territorio;
    if ((!current.nombre || current.nombre === "Sin nombre") && nombre) current.nombre = nombre;
    groups.set(key, current);
    return current;
  }

  for (const row of kpiRows) {
    if (String(row.tier ?? "").trim().toUpperCase() !== "T1") continue;
    const group = getGroup(row);
    group.visitasTop += toPositiveNumber(row.total_visitas_top);
    group.objetivos += toPositiveNumber(row.total_objetivos);
  }

  for (const row of icvaRows) {
    const group = getGroup(row);
    group.icvaCalls += toPositiveNumber(row.icva_calls);
    group.onTimeIcva += toPositiveNumber(row.on_time_icva);
    group.totalCalls += toPositiveNumber(row.total_calls);
    group.onTimeCall += toPositiveNumber(row.on_time_call);
  }

  return Array.from(groups.entries())
    .map(([id, group]) => {
      const callPlanCoverage = safeCoverage(group.visitasTop, group.objetivos);
      const visualCoverage = safeCoverage(group.onTimeIcva, group.icvaCalls);
      const docCoverage = safeCoverage(group.onTimeCall, group.totalCalls);
      const metCount =
        (callPlanCoverage >= 0.9 ? 1 : 0) +
        (visualCoverage >= 0.65 ? 1 : 0) +
        (docCoverage >= 0.9 ? 1 : 0);
      return {
        id,
        nombre: group.nombre,
        territorio: group.territorio || "-",
        empleado: group.empleado,
        callPlanAdherence: {
          numerator: group.visitasTop,
          denominator: group.objetivos,
          coverage: callPlanCoverage,
          threshold: 0.9,
        },
        ayudasVisuales: {
          numerator: group.onTimeIcva,
          denominator: group.icvaCalls,
          coverage: visualCoverage,
          threshold: 0.65,
        },
        documentacion48h: {
          numerator: group.onTimeCall,
          denominator: group.totalCalls,
          coverage: docCoverage,
          threshold: 0.9,
        },
        metCount,
        averageCoverage: (callPlanCoverage + visualCoverage + docCoverage) / 3,
        meet: metCount === 3,
      };
    })
    .sort((a, b) => {
      if (b.metCount !== a.metCount) return b.metCount - a.metCount;
      if (b.averageCoverage !== a.averageCoverage) return b.averageCoverage - a.averageCoverage;
      return a.nombre.localeCompare(b.nombre, "es");
    });
}

export async function getPerfilRankingData(params: {
  role: ProfileRole | null;
  profileUserId: string;
  requestedPeriod?: string | null;
}): Promise<PerfilRankingData> {
  const scope = resolveScope(params.role);
  const canAudit = params.role === "admin" || params.role === "super_admin";
  const [contestsData, availablePeriods, contestRankingData] = await Promise.all([
    getRankingContestsData(),
    getAvailableRankingPeriods(),
    getRankingContestData(),
  ]);

  const requestedPeriod = normalizePeriodMonthInput(params.requestedPeriod ?? "");
  const periodMonth = requestedPeriod && availablePeriods.includes(requestedPeriod)
    ? requestedPeriod
    : availablePeriods[0] ?? null;

  if (!periodMonth) {
    return {
      ok: true,
      scope,
      role: params.role,
      periodMonth: null,
      periodLabel: "Periodo no disponible",
      availablePeriods,
      contestsData,
      contestRankingData,
      performanceRows: [],
      message: "No hay periodos completos de source-ranking disponibles.",
      canAudit,
    };
  }

  let employeeIds: number[] = [];
  let territories: string[] = [];

  if (scope === "self") {
    const anchor = await getSalesAnchor(params.profileUserId);
    if (anchor?.no_empleado) employeeIds = [anchor.no_empleado];
    if (anchor?.territorio_individual) territories = [anchor.territorio_individual];
  } else if (scope === "manager_team") {
    const anchor = await getManagerAnchor(params.profileUserId);
    const members = await getManagerTeamMembers({
      periodMonth,
      managerTerritory: anchor?.territorio_manager ?? null,
      teamId: anchor?.team_id ?? null,
    });
    employeeIds = Array.from(
      new Set(
        members
          .map((row) => Number(row.no_empleado ?? 0))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    );
    territories = Array.from(
      new Set(
        members
          .map((row) => normalizeTerritory(row.territorio_individual))
          .filter((value) => value.length > 0),
      ),
    );
  }

  if (scope !== "all" && employeeIds.length === 0 && territories.length === 0) {
    return {
      ok: true,
      scope,
      role: params.role,
      periodMonth,
      periodLabel: formatPeriodMonthLabel(periodMonth),
      availablePeriods,
      contestsData,
      contestRankingData,
      performanceRows: [],
      message: "No hay relacion operativa para construir el ranking de este perfil.",
      canAudit,
    };
  }

  const { kpiRows, icvaRows, error } = await loadRankingAggRows({
    periodMonth,
    scope,
    employeeIds,
    territories,
  });
  const performanceRows = buildPerformanceRows(kpiRows, icvaRows);

  return {
    ok: !error,
    scope,
    role: params.role,
    periodMonth,
    periodLabel: formatPeriodMonthLabel(periodMonth),
    availablePeriods,
    contestsData,
    contestRankingData,
    performanceRows,
    message: error,
    canAudit,
  };
}
