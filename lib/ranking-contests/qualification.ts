import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContestComponentEvaluation,
  ContestParticipant,
  RankingContest,
  RankingContestComponent,
} from "@/lib/ranking-contests/types";

type MetricKey = "cpa_t1" | "documentacion_48h" | "icva";

type TeamMember = {
  empleado: number | null;
  territorio_individual: string | null;
};

type KpiAggRow = {
  empleado: number | null;
  territorio_individual: string | null;
  tier: string | null;
  total_visitas_top: number | string | null;
  total_objetivos: number | string | null;
};

type IcvaAggRow = {
  empleado: number | null;
  territorio_individual: string | null;
  total_calls: number | string | null;
  icva_calls: number | string | null;
  on_time_call: number | string | null;
  on_time_icva: number | string | null;
};

function toNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveNumber(value: unknown): number {
  const numeric = toNumber(value) ?? 0;
  return numeric > 0 ? numeric : 0;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeComponentName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveMetricFromComponentName(value: unknown): MetricKey | null {
  const normalized = normalizeComponentName(value);
  if (normalized.includes("cpa") || normalized.includes("call plan adherence")) return "cpa_t1";
  if (normalized.includes("documentacion") || normalized.includes("48")) return "documentacion_48h";
  if (normalized.includes("icva") || normalized.includes("ayudas visuales")) return "icva";
  return null;
}

function buildPeriodRange(params: {
  periodStart: string | null;
  periodEnd: string | null;
  maxCoveragePeriodMonth: string;
}): string[] {
  const startRaw = params.periodStart ?? params.maxCoveragePeriodMonth;
  const endRaw = params.periodEnd ?? params.maxCoveragePeriodMonth;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) return [];

  const start = new Date(Date.UTC(Number(startRaw.slice(0, 4)), Number(startRaw.slice(5, 7)) - 1, 1));
  const configuredEnd = new Date(Date.UTC(Number(endRaw.slice(0, 4)), Number(endRaw.slice(5, 7)) - 1, 1));
  const maxEnd = new Date(Date.UTC(Number(params.maxCoveragePeriodMonth.slice(0, 4)), Number(params.maxCoveragePeriodMonth.slice(5, 7)) - 1, 1));
  const end = configuredEnd.getTime() < maxEnd.getTime() ? configuredEnd : maxEnd;
  if (start.getTime() > end.getTime()) return [];

  const periods: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    periods.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-01`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

function thresholdAsPercent(value: number | null): number | null {
  if (value === null) return null;
  return value > 1 ? value / 100 : value;
}

function baseEvaluation(component: RankingContestComponent): Omit<ContestComponentEvaluation, "value" | "passed" | "status"> {
  return {
    componentId: component.id,
    componentName: component.componentName,
    thresholdValue: toNumber(component.thresholdValue),
    periodStart: component.periodStart,
    periodEnd: component.periodEnd,
  };
}

async function getParticipantMembers(params: {
  supabase: SupabaseClient;
  participant: ContestParticipant;
  maxCoveragePeriodMonth: string;
}): Promise<TeamMember[]> {
  if (params.participant.scope === "rep") {
    return [{
      empleado: toNumber(params.participant.employeeNumber) ?? null,
      territorio_individual: params.participant.territory ?? null,
    }];
  }

  let query = params.supabase
    .from("sales_force_status")
    .select("no_empleado, territorio_individual")
    .eq("period_month", params.maxCoveragePeriodMonth)
    .eq("is_deleted", false)
    .eq("is_active", true)
    .eq("is_vacant", false);

  const territory = String(params.participant.territory ?? "").trim();
  const teamId = String(params.participant.teamId ?? "").trim();
  if (territory) {
    query = query.ilike("territorio_padre", territory);
  } else if (teamId) {
    query = query.eq("team_id", teamId);
  } else {
    return [];
  }

  const result = await query;
  if (result.error) return [];

  return ((result.data ?? []) as Array<{ no_empleado: number | null; territorio_individual: string | null }>).map((row) => ({
    empleado: row.no_empleado ?? null,
    territorio_individual: row.territorio_individual ?? null,
  }));
}

function makeMemberKey(member: TeamMember): string {
  const empleado = toNumber(member.empleado);
  if (empleado && empleado > 0) return `emp:${empleado}`;
  return `terr:${normalizeKey(member.territorio_individual)}`;
}

function safeCoverage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

async function evaluateCoverageMetric(params: {
  supabase: SupabaseClient;
  component: RankingContestComponent;
  participant: ContestParticipant;
  maxCoveragePeriodMonth: string;
  metric: MetricKey;
}): Promise<ContestComponentEvaluation> {
  const periods = buildPeriodRange({
    periodStart: params.component.periodStart,
    periodEnd: params.component.periodEnd,
    maxCoveragePeriodMonth: params.maxCoveragePeriodMonth,
  });
  const evaluationPeriods = params.metric === "cpa_t1" && periods.length > 0
    ? [periods[periods.length - 1]]
    : periods;
  const thresholdRaw = toNumber(params.component.thresholdValue);
  const threshold = thresholdAsPercent(thresholdRaw);

  if (evaluationPeriods.length === 0) {
    return {
      ...baseEvaluation(params.component),
      value: null,
      passed: true,
      status: "passed",
      reason: "",
    };
  }

  if (threshold === null) {
    return {
      ...baseEvaluation(params.component),
      value: null,
      passed: true,
      status: "passed",
      reason: "El componente no tiene threshold_value numerico.",
    };
  }

  const members = await getParticipantMembers({
    supabase: params.supabase,
    participant: params.participant,
    maxCoveragePeriodMonth: params.maxCoveragePeriodMonth,
  });

  if (members.length === 0) {
    return {
      ...baseEvaluation(params.component),
      value: null,
      passed: true,
      status: "passed",
      reason: "No se encontraron miembros para evaluar este componente.",
    };
  }

  const employeeIds = Array.from(new Set(members.map((member) => toNumber(member.empleado)).filter((value): value is number => Boolean(value && value > 0))));
  const territories = Array.from(new Set(members.map((member) => String(member.territorio_individual ?? "").trim()).filter(Boolean)));
  const memberKeys = new Set(members.map(makeMemberKey));

  const coverageByMember = new Map<string, { numerator: number; denominator: number }>();
  for (const member of members) {
    coverageByMember.set(makeMemberKey(member), { numerator: 0, denominator: 0 });
  }

  if (params.metric === "cpa_t1") {
    let query = params.supabase
      .from("ranking_kpi_local_ytd_agg")
      .select("empleado, territorio_individual, tier, total_visitas_top, total_objetivos")
      .in("period_month", evaluationPeriods);

    if (employeeIds.length > 0) {
      query = query.in("empleado", employeeIds);
    } else if (territories.length > 0) {
      query = query.in("territorio_individual", territories);
    }

    const result = await query;
    if (result.error) {
      return {
        ...baseEvaluation(params.component),
        value: null,
        passed: true,
        status: "passed",
        reason: `No se pudo leer CPA T1 (${result.error.message}).`,
      };
    }

    for (const row of (result.data ?? []) as KpiAggRow[]) {
      if (normalizeKey(row.tier) !== "T1") continue;
      const key = makeMemberKey({ empleado: row.empleado, territorio_individual: row.territorio_individual });
      if (!memberKeys.has(key)) continue;
      const current = coverageByMember.get(key) ?? { numerator: 0, denominator: 0 };
      current.numerator += toPositiveNumber(row.total_visitas_top);
      current.denominator += toPositiveNumber(row.total_objetivos);
      coverageByMember.set(key, current);
    }
  } else {
    let query = params.supabase
      .from("ranking_icva_48hrs_agg")
      .select("empleado, territorio_individual, total_calls, icva_calls, on_time_call, on_time_icva")
      .in("period_month", evaluationPeriods);

    if (employeeIds.length > 0) {
      query = query.in("empleado", employeeIds);
    } else if (territories.length > 0) {
      query = query.in("territorio_individual", territories);
    }

    const result = await query;
    if (result.error) {
      return {
        ...baseEvaluation(params.component),
        value: null,
        passed: true,
        status: "passed",
        reason: `No se pudo leer ${params.metric === "icva" ? "iCVA" : "Documentacion 48h"} (${result.error.message}).`,
      };
    }

    for (const row of (result.data ?? []) as IcvaAggRow[]) {
      const key = makeMemberKey({ empleado: row.empleado, territorio_individual: row.territorio_individual });
      if (!memberKeys.has(key)) continue;
      const current = coverageByMember.get(key) ?? { numerator: 0, denominator: 0 };
      if (params.metric === "icva") {
        current.numerator += toPositiveNumber(row.on_time_icva);
        current.denominator += toPositiveNumber(row.icva_calls);
      } else {
        current.numerator += toPositiveNumber(row.on_time_call);
        current.denominator += toPositiveNumber(row.total_calls);
      }
      coverageByMember.set(key, current);
    }
  }

  const coverages = Array.from(coverageByMember.values())
    .map((item) => safeCoverage(item.numerator, item.denominator))
    .filter((value): value is number => value !== null);

  if (coverages.length === 0) {
    return {
      ...baseEvaluation(params.component),
      value: null,
      passed: true,
      status: "passed",
      reason: "No hubo denominadores validos para calcular cobertura.",
    };
  }

  const averageCoverage = coverages.reduce((sum, value) => sum + value, 0) / coverages.length;
  const valuePercent = averageCoverage * 100;

  return {
    ...baseEvaluation(params.component),
    value: Math.round(valuePercent * 100) / 100,
    passed: averageCoverage >= threshold,
    status: averageCoverage >= threshold ? "passed" : "failed",
    reason: `${params.participant.scope === "manager" ? "Promedio de equipo" : "Cobertura individual"}: ${coverages.length} participante(s) con datos, periodos ${evaluationPeriods.join(", ")}, threshold ${Math.round(threshold * 10000) / 100}%.`,
  };
}

export async function evaluateContestComponent(params: {
  supabase: SupabaseClient;
  component: RankingContestComponent;
  participant: ContestParticipant;
  contest: RankingContest;
  maxCoveragePeriodMonth: string;
}): Promise<ContestComponentEvaluation> {
  const metric = resolveMetricFromComponentName(params.component.componentName);
  if (metric) {
    return evaluateCoverageMetric({
      supabase: params.supabase,
      component: params.component,
      participant: params.participant,
      maxCoveragePeriodMonth: params.maxCoveragePeriodMonth,
      metric,
    });
  }

  return {
    ...baseEvaluation(params.component),
    value: true,
    passed: true,
    status: "passed",
    reason: "Evaluador no implementado todavia para este componente.",
  };
}

export function resolveQualification(evaluations: ContestComponentEvaluation[]): {
  qualificationStatus: "qualified" | "disqualified" | "pending" | "no_components";
  qualificationLabel: string;
  componentsPassed: number;
  componentsTotal: number;
} {
  const componentsTotal = evaluations.length;
  const componentsPassed = evaluations.filter((item) => item.passed).length;

  if (componentsTotal === 0) {
    return {
      qualificationStatus: "no_components",
      qualificationLabel: "Sin componentes",
      componentsPassed,
      componentsTotal,
    };
  }

  if (evaluations.every((item) => item.passed)) {
    return {
      qualificationStatus: "qualified",
      qualificationLabel: "Calificado",
      componentsPassed,
      componentsTotal,
    };
  }

  if (evaluations.some((item) => item.status === "pending" || item.status === "not_implemented")) {
    return {
      qualificationStatus: "pending",
      qualificationLabel: "Evaluacion pendiente",
      componentsPassed,
      componentsTotal,
    };
  }

  return {
    qualificationStatus: "disqualified",
    qualificationLabel: "Descalificado por criterios no cubiertos",
    componentsPassed,
    componentsTotal,
  };
}
