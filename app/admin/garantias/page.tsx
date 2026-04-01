import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getGarantiasPageData } from "@/lib/admin/garantias/get-garantias-page-data";
import { GarantiasManagementCard } from "@/components/admin/garantias-management-card";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminGarantiasPage({ searchParams }: PageProps) {
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
  const data = await getGarantiasPageData(selectedPeriodInput);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Garantias</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Gestion de garantias
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Configura excepciones para forzar cobertura al 100% por linea, team o representante.
          </p>
        </header>
  
        {!data.storageReady && data.storageMessage ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">Storage pendiente</h2>
            <p className="mt-1 text-sm text-amber-800">{data.storageMessage}</p>
          </section>
        ) : null}

        <GarantiasManagementCard
          periodMonth={data.periodMonth}
          availablePeriods={data.availableStatusPeriods}
          rows={data.rows}
          options={data.options}
        />
      </div>
    </main>
  );
}
