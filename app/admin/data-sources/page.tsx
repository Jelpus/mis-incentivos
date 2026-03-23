import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { TeamSourceFilesCard } from "@/components/admin/team-source-files-card";
import { BigQueryConnectionIndicator } from "@/components/admin/bigquery-connection-indicator";
import { getTeamRulesPageData } from "@/lib/admin/incentive-rules/get-team-rules-page-data";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminDataSourcesPage({ searchParams }: PageProps) {
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

  const params = searchParams ? await searchParams : {};
  const selectedPeriodInput = params?.period ?? null;
  const data = await getTeamRulesPageData(selectedPeriodInput);

  const periodInput = formatPeriodMonthForInput(data.periodMonth);
  const availableStatusPeriodInputs = Array.from(
    new Set(data.availableStatusPeriods.map((period) => formatPeriodMonthForInput(period))),
  );

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-500">Admin / Data Sources</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                Fuentes de datos por periodo
              </h1>
              <p className="mt-2 max-w-4xl text-sm text-neutral-600">
                Gestiona los archivos de entrada requeridos por las reglas de incentivos del periodo.
                Cada archivo logico se carga una sola vez, aunque aparezca en varias reglas.
              </p>
            </div>
            <BigQueryConnectionIndicator />
          </div>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Periodo de trabajo</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Solo se permiten periodos existentes en <code>sales_force_status</code>.
              </p>
            </div>
            <StatusPeriodPicker
              value={periodInput}
              paramName="period"
              options={availableStatusPeriodInputs}
            />
          </div>
        </section>

        <TeamSourceFilesCard periodMonthInput={periodInput} sourceFiles={data.sourceFiles} />
      </div>
    </main>
  );
}
