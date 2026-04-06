import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { formatPeriodMonthForInput } from "@/lib/admin/incentive-rules/shared";
import { getReglasRankingPageData } from "@/lib/admin/reglas-ranking/get-reglas-ranking-page-data";
import { ReglasRankingImportCard } from "@/components/admin/reglas-ranking-import-card";
import { ReglasRankingDetailTable } from "@/components/admin/reglas-ranking-detail-table";

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

  const periodInput = formatPeriodMonthForInput(data.periodMonth);
  const availableStatusPeriodInputs = Array.from(
    new Set(data.availableStatusPeriods.map((period) => formatPeriodMonthForInput(period))),
  );

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Reglas Ranking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Reglas de Ranking
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Rescate de columnas desde el archivo de <code>/admin/incentive-rules</code>:
            <code> product_name</code>, <code>ranking</code>, <code>puntos_ranking_lvu</code> y{" "}
            <code>prod_weight</code>.
          </p>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Periodo de trabajo</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Mostrando ultima version por <code>team_id</code> del periodo seleccionado.
              </p>
            </div>
            <StatusPeriodPicker
              value={periodInput}
              paramName="period"
              options={availableStatusPeriodInputs}
            />
          </div>
        </section>

        <ReglasRankingImportCard
          periodMonthInput={periodInput}
          rankingOptions={data.rankingOptions}
          puntosRankingLvuOptions={data.puntosRankingLvuOptions}
        />

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-950">Detalle</h2>
            <p className="text-sm text-neutral-600">Filas: {data.rows.length}</p>
          </div>

          {!data.complementsStorageReady && data.complementsStorageMessage ? (
            <p className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {data.complementsStorageMessage}
            </p>
          ) : null}

          {data.rows.length === 0 ? (
            <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              No se encontraron columnas de ranking en el periodo seleccionado.
            </p>
          ) : (
            <ReglasRankingDetailTable
              rows={data.rows}
              periodMonthInput={periodInput}
              rankingOptions={data.rankingOptions}
              puntosRankingLvuOptions={data.puntosRankingLvuOptions}
            />
          )}
        </section>
      </div>
    </main>
  );
}
