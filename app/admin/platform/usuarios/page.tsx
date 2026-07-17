import { getPlatformUsersPageData } from "@/lib/admin/platform/get-platform-page-data";
import { PlatformOverviewClient } from "@/components/admin/platform-overview-client";

function formatPeriod(periodMonth: string | null) {
  if (!periodMonth) return "-";
  const [year, month] = periodMonth.slice(0, 7).split("-");
  if (!year || !month) return periodMonth;
  return `${month}/${year}`;
}

export default async function AdminPlatformUsuariosPage() {
  const data = await getPlatformUsersPageData();

  return (
    <>
      <section className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#0f172a]">Registro de usuarios de plataforma</h2>
        <p className="mt-1 max-w-4xl text-sm text-neutral-600">
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
      </section>

      <PlatformOverviewClient users={data.users} kpi={data.kpi} />
    </>
  );
}
