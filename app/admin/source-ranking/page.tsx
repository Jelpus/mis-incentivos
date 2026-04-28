import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";
import { getSourceRankingPageData } from "@/lib/admin/source-ranking/get-source-ranking-page-data";
import { SourceRankingFilesCard } from "@/components/admin/source-ranking-files-card";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminSourceRankingPage({ searchParams }: PageProps) {
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
  const data = await getSourceRankingPageData(selectedPeriodInput);

  const periodInput = formatPeriodMonthForInput(data.periodMonth);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Source Ranking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Data Source Ranking
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Carga de fuentes base para ranking. El admin define libremente el periodo de trabajo.
          </p>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Periodo de trabajo</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Este periodo aplica por igual para ambos archivos del ranking.
              </p>
            </div>
            <StatusPeriodPicker
              value={periodInput}
              paramName="period"
            />
          </div>
        </section>

        <SourceRankingFilesCard periodMonthInput={periodInput} sourceFiles={data.sourceFiles} />
      </div>
    </main>
  );
}
