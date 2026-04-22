import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getPlatformPageData } from "@/lib/admin/platform/get-platform-page-data";
import { PlatformOverviewClient } from "@/components/admin/platform-overview-client";

function formatPeriod(periodMonth: string | null) {
  if (!periodMonth) return "-";
  const [year, month] = periodMonth.slice(0, 7).split("-");
  if (!year || !month) return periodMonth;
  return `${month}/${year}`;
}

export default async function AdminPlatformPage() {
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

  const data = await getPlatformPageData();

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Platform</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Registro de usuarios de plataforma
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Cruce operativo entre <code>sales_force_status</code>, <code>manager_status</code> y
            <code> profile_relations</code> para detectar registrados y faltantes de invitacion.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
            <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1">
              Sales Force period: {formatPeriod(data.salesForcePeriod)}
            </span>
            <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1">
              Manager period: {formatPeriod(data.managerPeriod)}
            </span>
          </div>
        </header>

        <PlatformOverviewClient users={data.users} kpi={data.kpi} />
      </div>
    </main>
  );
}
