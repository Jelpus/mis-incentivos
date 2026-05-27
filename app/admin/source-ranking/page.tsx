import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getSourceRankingPageData } from "@/lib/admin/source-ranking/get-source-ranking-page-data";
import { SourceRankingFilesCard } from "@/components/admin/source-ranking-files-card";

export default async function AdminSourceRankingPage() {
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

  const data = await getSourceRankingPageData();

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Source Ranking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Data Source Ranking
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Carga de fuentes base para ranking. Los periodos se derivan desde la estructura de los archivos.
          </p>
        </header>

        <SourceRankingFilesCard sourceFiles={data.sourceFiles} />
      </div>
    </main>
  );
}
