import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { TeamIncentiveRuleEditor } from "@/components/admin/team-incentive-rule-editor";
import { getTeamRuleDetailData } from "@/lib/admin/incentive-rules/get-team-rule-detail-data";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";

type PageProps = {
  params: Promise<{
    teamId: string;
  }>;
  searchParams?: Promise<{
    period?: string;
  }>;
};

function buildDefaultRuleDefinition(
  currentDefinition: Record<string, unknown> | null,
  teamId: string,
  periodMonth: string,
): string {
  const base = currentDefinition ?? {
    meta: {
      team_id: teamId,
      period_month: periodMonth,
      model_name: "draft-v1",
      description: "Estructura inicial de reglas por team y periodo.",
    },
    kpis: [],
    gates: [],
    payouts: [],
  };

  return JSON.stringify(base, null, 2);
}

export default async function IncentiveRuleTeamDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin;

  if (!isAdmin) {
    redirect("/");
  }

  const { teamId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedPeriodInput = resolvedSearchParams?.period ?? null;

  const data = await getTeamRuleDetailData({
    teamId,
    periodMonthInput: selectedPeriodInput,
  });

  const periodInputValue = formatPeriodMonthForInput(data.periodMonth);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-500">
                Admin / Incentive Rules / Team
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                Team ID: {data.teamId}
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                Versionado de reglas de incentivos para el periodo seleccionado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/incentive-rules?period=${periodInputValue}`}
                className="inline-flex items-center rounded-2xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Volver a listado
              </Link>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Contexto del team</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Validacion contra status para evitar reglas huérfanas.
              </p>
            </div>
            <StatusPeriodPicker value={periodInputValue} />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Periodo</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">{periodInputValue}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">SVA total</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">{data.salesForceTotal}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">SVA activos</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">{data.salesForceActive}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">SVA vacantes</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">{data.salesForceVacant}</p>
            </div>
          </div>

          {!data.teamExistsInPeriod ? (
            <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Este team_id no existe en sales_force_status para el periodo seleccionado.
            </p>
          ) : null}
        </section>

        {!data.storageReady && data.storageMessage ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">Storage pendiente</h2>
            <p className="mt-1 text-sm text-amber-800">{data.storageMessage}</p>
            <p className="mt-2 text-sm text-amber-800">
              Referencia: <code>docs/team-incentive-rules-schema.sql</code>
            </p>
          </section>
        ) : null}

        {data.storageReady && data.teamExistsInPeriod ? (
          <TeamIncentiveRuleEditor
            teamId={data.teamId}
            periodMonthInput={periodInputValue}
            defaultRuleDefinition={buildDefaultRuleDefinition(
              (data.currentVersion?.rule_definition ?? null) as Record<string, unknown> | null,
              data.teamId,
              data.periodMonth,
            )}
          />
        ) : null}

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Historial de versiones</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Versiones guardadas para team_id + periodo.
          </p>

          {data.versions.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              No hay versiones registradas aun.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Creada</th>
                    <th className="px-4 py-3">Creada por</th>
                    <th className="px-4 py-3">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {data.versions.map((version) => (
                    <tr key={version.id} className="border-b border-neutral-100">
                      <td className="px-4 py-3 font-medium text-neutral-900">v{version.version_no}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {new Intl.DateTimeFormat("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(version.created_at))}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{version.created_by ?? "-"}</td>
                      <td className="px-4 py-3 text-neutral-700">{version.change_note ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
