import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { formatPeriodMonthLabel, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";
import { getResultadosV2Data } from "@/lib/results/get-resultados-v2-data";
import { ResultadosSummaryCard } from "@/components/results/resultados-summary-card";
import { ResultadosTableCard } from "@/components/results/resultados-table-card";

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
  let relationSourceMessage: string | null = null;

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
        relationSourceMessage = "Fuente principal: profile_relations (sales_force_status_id).";
      } else {
        userMatch = await getLatestSalesForceMatch(profileUserId);
        relationSourceMessage = "Sin profile_relations activa. Se aplico fallback por user_id.";
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
        relationSourceMessage = "Fuente principal: profile_relations (manager_status_id).";
      } else {
        managerMatch = await getLatestManagerMatch(profileUserId, profileEmail);
        relationSourceMessage = "Sin profile_relations activa. Se aplico fallback por user_id/email.";
      }
    }
  } catch (error) {
    fetchError = toSafeErrorMessage(error);
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

          {relationSourceMessage ? (
            <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
              <p className="text-sm text-[#334155]">{relationSourceMessage}</p>
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
                <div className="mt-2 grid gap-1 text-sm text-[#334155]">
                  <p>
                    Periodo: <span className="font-semibold">{formatPeriodMonthLabel(userMatch.row.period_month)}</span>
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
                  {userMatch.row.nombre_manager ? (
                    <p>
                      Manager: <span className="font-semibold">{userMatch.row.nombre_manager}</span>
                    </p>
                  ) : null}
                  <p className="pt-1 text-xs text-[#667085]">
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
                <div className="mt-2 grid gap-1 text-sm text-[#334155]">
                  <p>
                    Periodo: <span className="font-semibold">{formatPeriodMonthLabel(managerMatch.row.period_month)}</span>
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
                  <p className="pt-1 text-xs text-[#667085]">
                    Fuente: {managerMatch.matchedBy} | Coincidencias: {managerMatch.total}
                  </p>
                </div>
              )}
              {managerMatch?.error ? <p className="mt-2 text-xs text-[#b42318]">Detalle: {managerMatch.error}</p> : null}
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

          <ResultadosSummaryCard
            title="Resultados"
            summary={resultadosData.summary}
            scope={resultadosData.scope}
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
