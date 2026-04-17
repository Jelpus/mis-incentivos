import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import {
  formatPeriodMonthLabel,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { getResultadosV2Data } from "@/lib/results/get-resultados-v2-data";
import {
  ResumenRankingCard,
  type RankingSummaryCardData,
} from "@/components/results/resumen-ranking-card";
import { ResultadosSummaryCard } from "@/components/results/resultados-summary-card";
import { ResultadosTableCard } from "@/components/results/resultados-table-card";
import { ResultadosGraph } from "@/components/results/resultados-graph";

type SalesForceMatchRow = {
  id: string;
  period_month: string;
  nombre_completo: string;
  team_id: string;
  territorio_individual: string;
  territorio_padre: string;
  correo_electronico: string;
  is_active: boolean;
  is_deleted: boolean;
  nombre_manager?: string | null;
  correo_manager?: string | null;
  manager_status_id?: string | null;
  no_empleado: number | null;
};

type ManagerMatchRow = {
  id: string;
  period_month: string;
  territorio_manager: string;
  nombre_manager: string | null;
  correo_manager: string | null;
  no_empleado_manager?: number | null;
  team_id: string | null;
  is_active: boolean;
  is_deleted: boolean;
};

type TeamAdminAssignmentRow = {
  team_id: string;
  admin_user_id: string;
};

type AdminProfileRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  picture_url?: string | null;
};

type TeamContactData = {
  name: string;
  email: string | null;
  ccEmail: string | null;
  teamId: string;
  pictureUrl: string | null;
};

type RankingKpiLocalYtdAggRow = {
  period_month: string;
  total_visitas_top: number | null;
  total_objetivos: number | null;
  garantia: boolean | null;
};

type RankingIcva48hrsAggRow = {
  period_month: string;
  total_calls: number | null;
  icva_calls: number | null;
  on_time_call: number | null;
  on_time_icva: number | null;
};

type ProfileRelationRow = {
  id: string;
  relation_type: "sales_force" | "manager";
  sales_force_status_id: string | null;
  manager_status_id: string | null;
  period_month: string;
  is_current: boolean;
};

type MatchSource =
  | "relation:sales_force"
  | "relation:manager"
  | "user_id"
  | "email"
  | "none";

function toSafeErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Error inesperado.";
  const message = (error as { message?: string }).message;
  return message ? String(message) : "Error inesperado.";
}

function addMonthsToPeriod(periodInput: string, monthsToAdd: number): string | null {
  const normalized = normalizePeriodMonthInput(periodInput);
  if (!normalized) return null;
  const [yearRaw, monthRaw] = normalized.slice(0, 7).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  const outYear = date.getUTCFullYear();
  const outMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${outYear}-${outMonth}-01`;
}

async function getManagerNameByTerritory(periodMonth: string, territorioPadre: string) {
  const adminClient = createAdminClient();
  if (!adminClient) return null;

  const targetTerritory = String(territorioPadre ?? "").trim();
  if (!targetTerritory) return null;
  const normalizedPeriod = normalizePeriodMonthInput(periodMonth);
  if (!normalizedPeriod) return null;

  const byPeriod = await adminClient
    .from("manager_status")
    .select("nombre_manager")
    .eq("period_month", normalizedPeriod)
    .eq("territorio_manager", targetTerritory)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ nombre_manager: string | null }>();

  if (!byPeriod.error && byPeriod.data?.nombre_manager) {
    return byPeriod.data.nombre_manager;
  }

  const fallback = await adminClient
    .from("manager_status")
    .select("nombre_manager")
    .eq("territorio_manager", targetTerritory)
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ nombre_manager: string | null }>();

  if (fallback.error) return null;
  return fallback.data?.nombre_manager ?? null;
}

async function getCarlosCcEmail() {
  const envEmail = (process.env.TEAM_CONTACT_CC_EMAIL ?? "").trim();
  if (envEmail) return envEmail;

  const adminClient = createAdminClient();
  if (!adminClient) return null;

  const result = await adminClient
    .from("profiles")
    .select("email, first_name, last_name")
    .eq("is_active", true)
    .or("first_name.ilike.carlos%,last_name.ilike.carlos%,email.ilike.carlos%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ email: string | null }>();

  if (result.error) return null;
  return result.data?.email ?? null;
}

async function getTeamContactData(teamId: string): Promise<TeamContactData | null> {
  const normalizedTeamId = String(teamId ?? "").trim();
  if (!normalizedTeamId) return null;

  const adminClient = createAdminClient();
  if (!adminClient) return null;

  const assignmentResult = await adminClient
    .from("team_admin_assignments")
    .select("team_id, admin_user_id")
    .eq("team_id", normalizedTeamId)
    .limit(1)
    .maybeSingle<TeamAdminAssignmentRow>();

  if (assignmentResult.error || !assignmentResult.data?.admin_user_id) {
    return null;
  }

  const profileResult = await adminClient
    .from("profiles")
    .select("user_id, email, first_name, last_name, picture_url")
    .eq("user_id", assignmentResult.data.admin_user_id)
    .limit(1)
    .maybeSingle<AdminProfileRow>();

  if (profileResult.error || !profileResult.data) {
    return null;
  }

  const firstName = String(profileResult.data.first_name ?? "").trim();
  const lastName = String(profileResult.data.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const email = profileResult.data.email;
  const ccEmail = await getCarlosCcEmail();
  const pictureUrl = String(profileResult.data.picture_url ?? "").trim() || null;

  return {
    name: fullName || email || profileResult.data.user_id,
    email: email ?? null,
    ccEmail,
    teamId: normalizedTeamId,
    pictureUrl,
  };
}

function getInitials(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "--";
  return normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function buildContactMailto(contact: TeamContactData): string | null {
  if (!contact.email) return null;

  const subject = "Duda sobre pago de incentivos";
  const body =
    "Hola, tengo una duda respecto al pago de incentivos. ¿Me puedes apoyar por favor?";
  const query = new URLSearchParams();
  query.set("subject", subject);
  query.set("body", body);
  if (contact.ccEmail) {
    query.set("cc", contact.ccEmail);
  }
  return `mailto:${contact.email}?${query.toString()}`;
}

function toPositiveNumber(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function safeCoverage(numerator: number, denominator: number) {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

async function getRankingSummaryCardData(params: {
  empleado: number | null;
  periodMonth: string | null;
  territorioIndividual: string | null;
}): Promise<RankingSummaryCardData> {
  const emptyData: RankingSummaryCardData = {
    periodMonth: params.periodMonth,
    callPlanAdherence: {
      visitas: 0,
      objetivo: 0,
      coverage: 0,
      threshold: 0.9,
      hasGarantia: false,
      garantiaPeriod: null,
    },
    ayudasVisuales: {
      total: 0,
      onTime: 0,
      coverage: 0,
      threshold: 0.65,
    },
    documentacion48h: {
      total: 0,
      onTime: 0,
      coverage: 0,
      threshold: 0.9,
    },
    message: null,
  };

  if (!params.empleado) {
    return {
      ...emptyData,
      message: "No se encontró empleado para calcular criterios de ranking.",
    };
  }

  const normalizedPeriod = normalizePeriodMonthInput(params.periodMonth ?? "");
  if (!normalizedPeriod) {
    return {
      ...emptyData,
      message: "No se encontró periodo para calcular criterios de ranking.",
    };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      ...emptyData,
      message: "Admin client no disponible.",
    };
  }

  let [kpiResult, icvaResult] = await Promise.all([
    adminClient
      .from("ranking_kpi_local_ytd_agg")
      .select("period_month, total_visitas_top, total_objetivos, garantia")
      .eq("empleado", params.empleado)
      .eq("tier", "T1")
      .eq("period_month", normalizedPeriod),
    adminClient
      .from("ranking_icva_48hrs_agg")
      .select("period_month, total_calls, icva_calls, on_time_call, on_time_icva")
      .eq("empleado", params.empleado)
      .eq("period_month", normalizedPeriod),
  ]);

  const kpiRowsByEmpleado = (kpiResult.data ?? []) as RankingKpiLocalYtdAggRow[];
  const icvaRowsByEmpleado = (icvaResult.data ?? []) as RankingIcva48hrsAggRow[];
  const hasEmpleadoMatch = kpiRowsByEmpleado.length > 0 || icvaRowsByEmpleado.length > 0;

  const normalizedTerritorio = String(params.territorioIndividual ?? "").trim();
  let usedFallbackByTerritorio = false;

  if (!hasEmpleadoMatch && normalizedTerritorio.length > 0) {
    usedFallbackByTerritorio = true;
    [kpiResult, icvaResult] = await Promise.all([
      adminClient
        .from("ranking_kpi_local_ytd_agg")
        .select("period_month, total_visitas_top, total_objetivos, garantia")
        .eq("tier", "T1")
        .eq("period_month", normalizedPeriod)
        .ilike("territorio_individual", normalizedTerritorio),
      adminClient
        .from("ranking_icva_48hrs_agg")
        .select("period_month, total_calls, icva_calls, on_time_call, on_time_icva")
        .eq("period_month", normalizedPeriod)
        .ilike("territorio_individual", normalizedTerritorio),
    ]);
  }

  if (kpiResult.error || icvaResult.error) {
    return {
      ...emptyData,
      periodMonth: normalizedPeriod,
      message:
        kpiResult.error?.message ??
        icvaResult.error?.message ??
        "No se pudieron cargar agregados de ranking.",
    };
  }

  const kpiRows = (kpiResult.data ?? []) as RankingKpiLocalYtdAggRow[];
  const icvaRows = (icvaResult.data ?? []) as RankingIcva48hrsAggRow[];

  const visitas = kpiRows.reduce((acc, row) => acc + toPositiveNumber(row.total_visitas_top), 0);
  const objetivo = kpiRows.reduce((acc, row) => acc + toPositiveNumber(row.total_objetivos), 0);
  const callPlanCoverage = safeCoverage(visitas, objetivo);
  const hasGarantia = kpiRows.some((row) => row.garantia === true);

  const icvaTotal = icvaRows.reduce((acc, row) => acc + toPositiveNumber(row.icva_calls), 0);
  const icvaOnTime = icvaRows.reduce((acc, row) => acc + toPositiveNumber(row.on_time_icva), 0);
  const icvaCoverage = safeCoverage(icvaOnTime, icvaTotal);

  const docTotal = icvaRows.reduce((acc, row) => acc + toPositiveNumber(row.total_calls), 0);
  const docOnTime = icvaRows.reduce((acc, row) => acc + toPositiveNumber(row.on_time_call), 0);
  const docCoverage = safeCoverage(docOnTime, docTotal);

  return {
    periodMonth: normalizedPeriod,
    callPlanAdherence: {
      visitas,
      objetivo,
      coverage: callPlanCoverage,
      threshold: 0.9,
      hasGarantia,
      garantiaPeriod: hasGarantia ? normalizedPeriod : null,
    },
    ayudasVisuales: {
      total: icvaTotal,
      onTime: icvaOnTime,
      coverage: icvaCoverage,
      threshold: 0.65,
    },
    documentacion48h: {
      total: docTotal,
      onTime: docOnTime,
      coverage: docCoverage,
      threshold: 0.9,
    },
    message: usedFallbackByTerritorio
      ? `No hubo match por empleado; se aplicó fallback por territorio_individual (${normalizedTerritorio}).`
      : null,
  };
}

async function getCurrentProfileRelation(userId: string, role: string | null) {
  const relationType = role === "user" ? "sales_force" : role === "manager" ? "manager" : null;
  if (!relationType) return { row: null as ProfileRelationRow | null, error: null as string | null };

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { row: null as ProfileRelationRow | null, error: "Admin client no disponible." };
  }

  const result = await adminClient
    .from("profile_relations")
    .select(
      `
        id,
        relation_type,
        sales_force_status_id,
        manager_status_id,
        period_month,
        is_current
      `,
    )
    .eq("user_id", userId)
    .eq("relation_type", relationType)
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProfileRelationRow>();

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return { row: null as ProfileRelationRow | null, error: null as string | null };
    }
    return { row: null as ProfileRelationRow | null, error: result.error.message };
  }

  return { row: result.data ?? null, error: null as string | null };
}

async function getSalesForceMatchById(statusId: string) {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      row: null as SalesForceMatchRow | null,
      source: "none" as MatchSource,
      error: "Admin client no disponible.",
    };
  }

  const enrichedResult = await adminClient
    .from("sales_force_status_enriched")
    .select(
      `
        id,
        period_month,
        nombre_completo,
        no_empleado,
        team_id,
        territorio_individual,
        territorio_padre,
        correo_electronico,
        is_active,
        is_deleted,
        nombre_manager,
        correo_manager,
        manager_status_id
      `,
    )
    .eq("id", statusId)
    .eq("is_deleted", false)
    .maybeSingle<SalesForceMatchRow>();

  if (!enrichedResult.error) {
    return {
      row: enrichedResult.data ?? null,
      source: "relation:sales_force" as MatchSource,
      error: null as string | null,
    };
  }

  if (!isMissingRelationError(enrichedResult.error)) {
    return {
      row: null as SalesForceMatchRow | null,
      source: "relation:sales_force" as MatchSource,
      error: enrichedResult.error.message,
    };
  }

  const baseResult = await adminClient
    .from("sales_force_status")
    .select(
      `
        id,
        period_month,
        nombre_completo,
        team_id,
        territorio_individual,
        territorio_padre,
        correo_electronico,
        is_active,
        is_deleted,
        manager_status_id,
        no_empleado
      `,
    )
    .eq("id", statusId)
    .eq("is_deleted", false)
    .maybeSingle<SalesForceMatchRow>();

  if (baseResult.error) {
    return {
      row: null as SalesForceMatchRow | null,
      source: "relation:sales_force" as MatchSource,
      error: baseResult.error.message,
    };
  }

  return {
    row: baseResult.data ?? null,
    source: "relation:sales_force" as MatchSource,
    error: null as string | null,
  };
}

async function getManagerMatchById(statusId: string) {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      row: null as ManagerMatchRow | null,
      source: "none" as MatchSource,
      error: "Admin client no disponible.",
    };
  }

  const result = await adminClient
    .from("manager_status")
    .select(
      `
        id,
        period_month,
        territorio_manager,
        nombre_manager,
        correo_manager,
        no_empleado_manager,
        team_id,
        is_active,
        is_deleted
      `,
    )
    .eq("id", statusId)
    .eq("is_deleted", false)
    .maybeSingle<ManagerMatchRow>();

  if (result.error) {
    return {
      row: null as ManagerMatchRow | null,
      source: "relation:manager" as MatchSource,
      error: result.error.message,
    };
  }

  return {
    row: result.data ?? null,
    source: "relation:manager" as MatchSource,
    error: null as string | null,
  };
}

async function getLatestSalesForceMatch(userId: string) {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      row: null as SalesForceMatchRow | null,
      total: 0,
      source: "none" as MatchSource,
      error: "Admin client no disponible.",
    };
  }

  const enrichedResult = await adminClient
    .from("sales_force_status_enriched")
    .select(
      `
        id,
        period_month,
        nombre_completo,
        team_id,
        territorio_individual,
        territorio_padre,
        correo_electronico,
        is_active,
        is_deleted,
        nombre_manager,
        correo_manager,
        manager_status_id,
        no_empleado
      `,
      { count: "exact" },
    )
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle<SalesForceMatchRow>();

  if (!enrichedResult.error) {
    return {
      row: enrichedResult.data ?? null,
      total: enrichedResult.count ?? (enrichedResult.data ? 1 : 0),
      source: "user_id" as MatchSource,
      error: null as string | null,
    };
  }

  if (!isMissingRelationError(enrichedResult.error)) {
    return {
      row: null as SalesForceMatchRow | null,
      total: 0,
      source: "user_id" as MatchSource,
      error: enrichedResult.error.message,
    };
  }

  const baseResult = await adminClient
    .from("sales_force_status")
    .select(
      `
        id,
        period_month,
        nombre_completo,
        team_id,
        territorio_individual,
        territorio_padre,
        correo_electronico,
        is_active,
        is_deleted,
        manager_status_id,
        no_empleado
      `,
      { count: "exact" },
    )
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle<SalesForceMatchRow>();

  if (baseResult.error) {
    return {
      row: null as SalesForceMatchRow | null,
      total: 0,
      source: "user_id" as MatchSource,
      error: baseResult.error.message,
    };
  }

  return {
    row: baseResult.data ?? null,
    total: baseResult.count ?? (baseResult.data ? 1 : 0),
    source: "user_id" as MatchSource,
    error: null as string | null,
  };
}

async function getLatestManagerMatch(userId: string, email: string | null) {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      row: null as ManagerMatchRow | null,
      total: 0,
      error: "Admin client no disponible.",
      matchedBy: "none" as MatchSource,
    };
  }

  const byUserId = await adminClient
    .from("manager_status")
    .select(
      `
        id,
        period_month,
        territorio_manager,
        nombre_manager,
        correo_manager,
        no_empleado_manager,
        team_id,
        is_active,
        is_deleted
      `,
      { count: "exact" },
    )
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle<ManagerMatchRow>();

  if (!byUserId.error) {
    return {
      row: byUserId.data ?? null,
      total: byUserId.count ?? (byUserId.data ? 1 : 0),
      error: null as string | null,
      matchedBy: "user_id" as MatchSource,
    };
  }

  if (email) {
    const byEmail = await adminClient
      .from("manager_status")
      .select(
        `
          id,
          period_month,
          territorio_manager,
          nombre_manager,
          correo_manager,
          no_empleado_manager,
          team_id,
          is_active,
          is_deleted
        `,
        { count: "exact" },
      )
      .ilike("correo_manager", email)
      .eq("is_deleted", false)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle<ManagerMatchRow>();

    if (!byEmail.error) {
      return {
        row: byEmail.data ?? null,
        total: byEmail.count ?? (byEmail.data ? 1 : 0),
        error: null as string | null,
        matchedBy: "email" as MatchSource,
      };
    }
  }

  return {
    row: null as ManagerMatchRow | null,
    total: 0,
    error: byUserId.error.message,
    matchedBy: "none" as MatchSource,
  };
}

export default async function MiCuentaPage() {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveUserId, effectiveEmail, isImpersonating } = auth;

  if (!user || isActive === false) {
    redirect("/");
  }

  const profileUserId = effectiveUserId ?? user.id;
  const profileEmail = effectiveEmail ?? user.email ?? null;
  const profileResultsTable = process.env.BQ_RESULTS_PROFILE_TABLE?.trim() || "resultados_v2_con_ajustes";

  let userMatch: Awaited<ReturnType<typeof getLatestSalesForceMatch>> | null = null;
  let managerMatch: Awaited<ReturnType<typeof getLatestManagerMatch>> | null = null;
  let fetchError: string | null = null;
  let areaManagerName: string | null = null;
  let teamContact: TeamContactData | null = null;

  try {
    if (role === "user") {
      const relation = await getCurrentProfileRelation(profileUserId, role);
      if (relation.error) fetchError = relation.error;

      if (relation.row?.sales_force_status_id) {
        const linked = await getSalesForceMatchById(relation.row.sales_force_status_id);
        userMatch = {
          row: linked.row,
          total: linked.row ? 1 : 0,
          source: linked.source,
          error: linked.error,
        };
      } else {
        userMatch = await getLatestSalesForceMatch(profileUserId);
      }
    } else if (role === "manager") {
      const relation = await getCurrentProfileRelation(profileUserId, role);
      if (relation.error) fetchError = relation.error;

      if (relation.row?.manager_status_id) {
        const linked = await getManagerMatchById(relation.row.manager_status_id);
        managerMatch = {
          row: linked.row,
          total: linked.row ? 1 : 0,
          error: linked.error,
          matchedBy: linked.source,
        };
      } else {
        managerMatch = await getLatestManagerMatch(profileUserId, profileEmail);
      }
    }
  } catch (error) {
    fetchError = toSafeErrorMessage(error);
  }

  if (role === "user" && userMatch?.row?.territorio_padre) {
    areaManagerName = await getManagerNameByTerritory(
      userMatch.row.period_month,
      userMatch.row.territorio_padre,
    );
  }

  const contactTeamId =
    role === "user"
      ? (userMatch?.row?.team_id ?? "").trim()
      : role === "manager"
        ? (managerMatch?.row?.team_id ?? "").trim()
        : "";

  if (contactTeamId) {
    teamContact = await getTeamContactData(contactTeamId);
  }

  let resultadosData = await getResultadosV2Data({
    role,
    profileUserId,
    maxRows: role === "user" ? 80 : 150,
    readTableId: profileResultsTable,
  });

  if (!resultadosData.ok) {
    resultadosData = {
      ...resultadosData,
      rows: [],
      summary: {
        rowCount: 0,
        totalPagoResultado: 0,
        totalPagoVariable: 0,
        avgCobertura: 0,
      },
    };
  }

  const resultadosDetailLevel =
    role === "admin" || role === "super_admin" || role === "viewer"
      ? "full"
      : role === "manager"
        ? "team"
        : "basic";
  const contactMailto = teamContact ? buildContactMailto(teamContact) : null;
  const rankingEmpleado =
    role === "user"
      ? (userMatch?.row?.no_empleado ?? null)
      : role === "manager"
        ? (managerMatch?.row?.no_empleado_manager ?? null)
        : null;
  const rankingPeriodMonth =
    role === "user"
      ? (userMatch?.row?.period_month ?? null)
      : role === "manager"
        ? (managerMatch?.row?.period_month ?? null)
        : null;
  const rankingSummaryData = await getRankingSummaryCardData({
    empleado: rankingEmpleado,
    periodMonth: rankingPeriodMonth,
    territorioIndividual:
      role === "user"
        ? (userMatch?.row?.territorio_individual ?? null)
        : null,
  });

  return (
    <section>
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">Cuenta</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">Mi cuenta</h1>
        <p className="mt-3 text-sm text-[#4b5f86]">Estado de vinculacion del perfil contra catalogos operativos.</p>

        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
            <p className="text-sm font-semibold text-[#1e3a8a]">Contexto actual</p>
            <p className="mt-2 text-sm text-[#334155]">
              Rol: <span className="font-semibold">{role ?? "sin-definir"}</span> | Usuario:{" "}
              <span className="font-semibold">{profileEmail ?? profileUserId}</span>
            </p>
            {isImpersonating ? (
              <p className="mt-1 text-xs text-[#7a2e0e]">Modo debug activo: estas viendo la cuenta de otro perfil.</p>
            ) : null}
          </div>

          {fetchError ? (
            <div className="rounded-xl border border-[#fecdca] bg-[#fff6f5] p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#b42318]">No se pudo validar el match</p>
              <p className="mt-1 text-sm text-[#7a271a]">{fetchError}</p>
            </div>
          ) : null}

          {role === "user" ? (
            <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#1e3a8a]">Relación actual</p>
              {!userMatch?.row ? (
                <p className="mt-2 text-sm text-[#475467]">
                  No hay registro vinculado para este perfil en <code>sales_force_status</code>.
                </p>
              ) : (
                <div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-[#334155] md:grid-cols-2">
                  <p>
                    Periodo analizado:{" "}
                    <span className="font-semibold">{formatPeriodMonthLabel(userMatch.row.period_month)}</span>
                  </p>
                  <p>
                    Cuando será pagado:{" "}
                    <span className="font-semibold">
                      {formatPeriodMonthLabel(addMonthsToPeriod(userMatch.row.period_month, 3) ?? "")}
                    </span>
                  </p>
                  <p>
                    Nombre: <span className="font-semibold">{userMatch.row.nombre_completo}</span>
                  </p>
                  <p>
                    Team ID: <span className="font-semibold">{userMatch.row.team_id}</span>
                  </p>
                  <p>
                    Territorio: <span className="font-semibold">{userMatch.row.territorio_individual}</span>
                  </p>
                  <p>
                    Estado: <span className="font-semibold">{userMatch.row.is_active ? "activo" : "inactivo"}</span>
                  </p>
                  <p>
                    Empleado: <span className="font-semibold">{userMatch.row.no_empleado}</span>
                  </p>
                  <p>
                    Area Manager:{" "}
                    <span className="font-semibold">
                      {areaManagerName ??
                        userMatch.row.nombre_manager ??
                        userMatch.row.territorio_padre ??
                        "-"}
                    </span>
                  </p>
                  <p className="pt-1 text-xs text-[#667085] md:col-span-2">
                    Fuente: {userMatch.source} | Coincidencias: {userMatch.total}
                  </p>
                </div>
              )}
              {userMatch?.error ? <p className="mt-2 text-xs text-[#b42318]">Detalle: {userMatch.error}</p> : null}
            </div>
          ) : null}

          {role === "manager" ? (
            <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#1e3a8a]">Relación actual</p>
              {!managerMatch?.row ? (
                <p className="mt-2 text-sm text-[#475467]">
                  No hay registro vinculado en <code>manager_status</code> para este perfil.
                </p>
              ) : (
                <div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-[#334155] md:grid-cols-2">
                  <p>
                    Periodo analizado:{" "}
                    <span className="font-semibold">{formatPeriodMonthLabel(managerMatch.row.period_month)}</span>
                  </p>
                  <p>
                    Manager:{" "}
                    <span className="font-semibold">{managerMatch.row.nombre_manager ?? managerMatch.row.territorio_manager}</span>
                  </p>
                  <p>
                    Territorio: <span className="font-semibold">{managerMatch.row.territorio_manager}</span>
                  </p>
                  <p>
                    Team ID: <span className="font-semibold">{managerMatch.row.team_id ?? "-"}</span>
                  </p>
                  <p>
                    Estado: <span className="font-semibold">{managerMatch.row.is_active ? "activo" : "inactivo"}</span>
                  </p>
                  <p>
                    Empleado: <span className="font-semibold">{managerMatch.row.no_empleado_manager}</span>
                  </p>
                  <p className="pt-1 text-xs text-[#667085] md:col-span-2">
                    Fuente: {managerMatch.matchedBy} | Coincidencias: {managerMatch.total}
                  </p>
                </div>
              )}
              {managerMatch?.error ? <p className="mt-2 text-xs text-[#b42318]">Detalle: {managerMatch.error}</p> : null}
            </div>
          ) : null}

          {role === "user" || role === "manager" ? (
            <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#1e3a8a]">Contacto</p>
              {!teamContact ? (
                <p className="mt-2 text-sm text-[#475467]">
                  No hay un contacto asignado para el team actual.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-[#d9e5fb] bg-white p-3 sm:p-4">
                    <p className="text-sm text-[#475467]">
                      Si tienes alguna duda respecto al pago ponte en contacto con tu experto asignado.
                    </p>
                    {contactMailto ? (
                      <a
                        href={contactMailto}
                        className="inline-flex shrink-0 items-center rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#334155] transition hover:bg-[#f8fafc]"
                      >
                        Enviar correo al contacto
                      </a>
                    ) : (
                      <p className="shrink-0 text-xs text-[#b42318]">Sin correo disponible</p>
                    )}
                  </div>
                  <details className="group rounded-xl border border-[#d9e5fb] bg-white">
                    <summary className="list-none cursor-pointer p-3 sm:p-4">
                      <div className="mt-2 flex items-center gap-1 text-xs text-[#667085]">
                        <span className="group-open:hidden">Ver detalles</span>
                        <span className="hidden group-open:inline">Ocultar detalles</span>
                      </div>
                    </summary>
                    <div className="border-t border-[#eef4ff] px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
                      <div className="grid gap-3 text-sm text-[#334155] md:grid-cols-3">
                        <div className="space-y-1">
                          <p>
                            Nombre: <span className="font-semibold">{teamContact.name}</span>
                          </p>
                          <p>
                            Team ID: <span className="font-semibold">{teamContact.teamId}</span>
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p>
                            Correo: <span className="font-semibold">{teamContact.email ?? "-"}</span>
                          </p>
                          <p>
                            CC: <span className="font-semibold">{teamContact.ccEmail ?? "no configurado"}</span>
                          </p>
                        </div>
                        <div className="flex items-start justify-start md:justify-end">
                          {teamContact.pictureUrl ? (
                            <Image
                              src={teamContact.pictureUrl}
                              alt={teamContact.name}
                              width={56}
                              height={56}
                              className="h-14 w-14 rounded-xl border border-[#d9e5fb] object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#d9e5fb] bg-white text-sm font-semibold text-[#334155]">
                              {getInitials(teamContact.name)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
          ) : null}
          {role === "viewer" ? (
            <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#1e3a8a]">Rol viewer</p>
              <p className="mt-2 text-sm text-[#475467]">
                Este rol no requiere match operativo en <code>sales_force_status</code> ni en <code>manager_status</code>.
              </p>
            </div>
          ) : null}

          {resultadosData.message ? (
            <div className="rounded-xl border border-[#d9e5fb] bg-[#f8fbff] p-4 sm:p-5">
              <p className="text-sm text-[#475467]">{resultadosData.message}</p>

            </div>
          ) : null}

          <ResumenRankingCard
            title="Seguimiento Criterios de Ranking"
            data={rankingSummaryData}
          />

          <ResultadosSummaryCard
            title="Resultados de Incentivos"
            summary={resultadosData.summary}
            scope={resultadosData.scope}
            periodCode={resultadosData.periodCode}
          />

          <ResultadosGraph
            title="Visualiza tu pago"
            rows={resultadosData.rows}
            detailLevel={resultadosDetailLevel}
            periodCode={resultadosData.periodCode}
          />

          <ResultadosTableCard
            title="Detalle de resultados"
            rows={resultadosData.rows}
            detailLevel={resultadosDetailLevel}
          />

          <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
            <Link
              href="/perfil/resultados"
              className="inline-flex items-center rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#334155] transition hover:bg-[#f8fafc]"
            >
              Ver vista completa de resultados
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
