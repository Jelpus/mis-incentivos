import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { TeamIncentiveRuleEditor } from "@/components/admin/team-incentive-rule-editor";
import { getTeamRuleDetailData } from "@/lib/admin/incentive-rules/get-team-rule-detail-data";
import { getPayCurvesListData } from "@/lib/admin/pay-curves/get-pay-curves-data";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";
import { createInitialTeamRuleDefinition } from "@/lib/admin/incentive-rules/rule-catalog";

type PageProps = {
  params: Promise<{
    teamId: string;
    ruleId: string;
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
  const base =
    currentDefinition ??
    createInitialTeamRuleDefinition({
      teamId,
      periodMonth,
    });

  return JSON.stringify(base, null, 2);
}

export default async function IncentiveRuleDetailRulePage({
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

  const { teamId, ruleId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedPeriodInput = resolvedSearchParams?.period ?? null;

  const data = await getTeamRuleDetailData({
    teamId,
    periodMonthInput: selectedPeriodInput,
  });
  const payCurvesData = await getPayCurvesListData();
  const payCurveOptions = payCurvesData.ok
    ? payCurvesData.rows
        .filter((row) => !row.isHidden)
        .map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
        }))
    : [];

  const periodInputValue = formatPeriodMonthForInput(data.periodMonth);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-500">
                Admin / Incentive Rules / Team / Regla
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                Team ID: {data.teamId}
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                Edicion con mas espacio para la regla {ruleId}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/incentive-rules/${encodeURIComponent(data.teamId)}?period=${periodInputValue}`}
                className="inline-flex items-center rounded-2xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Volver a Team
              </Link>
              <Link
                href={`/admin/incentive-rules?period=${periodInputValue}`}
                className="inline-flex items-center rounded-2xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Volver a listado
              </Link>
            </div>
          </div>
        </header>

        {data.storageReady && data.teamExistsInPeriod ? (
          <TeamIncentiveRuleEditor
            teamId={data.teamId}
            periodMonthInput={periodInputValue}
            payCurveOptions={payCurveOptions}
            focusRuleId={ruleId}
            defaultRuleDefinition={buildDefaultRuleDefinition(
              (data.currentVersion?.rule_definition ?? null) as Record<string, unknown> | null,
              data.teamId,
              data.periodMonth,
            )}
          />
        ) : (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">No editable</h2>
            <p className="mt-1 text-sm text-amber-800">
              No es posible editar reglas porque el team no existe en el periodo o falta storage.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
