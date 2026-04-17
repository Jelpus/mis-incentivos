import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";
import { getReglasRankingPageData } from "@/lib/admin/reglas-ranking/get-reglas-ranking-page-data";
import { getRankingContestsData } from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { getRankingParticipationData } from "@/lib/admin/reglas-ranking/get-ranking-participation-data";
import { ReglasRankingTabs } from "@/components/admin/reglas-ranking-tabs";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminReglasRankingPage({ searchParams }: PageProps) {
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
  const data = await getReglasRankingPageData(selectedPeriodInput);
  const contestsData = await getRankingContestsData();
  const participationData = await getRankingParticipationData();

  const periodInput = formatPeriodMonthForInput(data.periodMonth);
  const availableStatusPeriodInputs = Array.from(
    new Set(data.availableStatusPeriods.map((period) => formatPeriodMonthForInput(period))),
  );

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <ReglasRankingTabs
          periodInput={periodInput}
          availableStatusPeriodInputs={availableStatusPeriodInputs}
          puntosData={data}
          contestsData={contestsData}
          participationData={participationData}
        />
      </div>
    </main>
  );
}
