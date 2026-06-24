import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getRankingAdjustmentsPageData } from "@/lib/admin/ajustes-ranking/get-ranking-adjustments-page-data";
import { RankingAdjustmentsCard } from "@/components/admin/ranking-adjustments-card";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminRankingAdjustmentsPage({ searchParams }: PageProps) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  if (role !== "admin" && role !== "super_admin") {
    redirect("/");
  }

  const params = searchParams ? await searchParams : {};
  const data = await getRankingAdjustmentsPageData(params?.period ?? null);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <RankingAdjustmentsCard
          periodInput={data.periodInput}
          availablePeriodInputs={data.availablePeriodInputs}
          pointRows={data.pointRows}
          adjustments={data.adjustments}
          auditItems={data.auditItems}
          messages={data.messages}
        />
      </div>
    </main>
  );
}
