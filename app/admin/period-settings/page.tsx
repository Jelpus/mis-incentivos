import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getPeriodSettingsPageData } from "@/lib/admin/period-settings/get-period-settings-page-data";
import { PeriodSettingsCard } from "@/components/admin/period-settings-card";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminPeriodSettingsPage({ searchParams }: PageProps) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  const isAdmin = role === "admin" || role === "super_admin";
  if (!isAdmin) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : {};
  const data = await getPeriodSettingsPageData(params?.period ?? null);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Period Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Period Settings
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Configuracion global para reglas de elegibilidad y corte operativo del calculo.
          </p>
        </header>

        <PeriodSettingsCard
          key={data.periodMonth}
          periodMonth={data.periodMonth}
          availablePeriods={data.availablePeriods}
          settings={data.settings}
          storageReady={data.storageReady}
          storageMessage={data.storageMessage}
          productOptions={data.productOptions}
          productsMessage={data.productsMessage}
          sampleRows={data.sampleRows}
        />
      </div>
    </main>
  );
}
