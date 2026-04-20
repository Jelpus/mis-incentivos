import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getPerformanceReportData } from "@/lib/performance/get-performance-report-data";
import { PerformanceReportClient } from "@/components/performance/performance-report-client";
import { ExportReportButton } from "@/components/profile/export-report-button";

type PerformanceReportPageProps = {
  searchParams?: Promise<{
    periodos?: string;
  }>;
};

function parsePeriodCodes(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{6}$/.test(item));
}

export default async function PerformanceReportPage({ searchParams }: PerformanceReportPageProps) {
  const auth = await getCurrentAuthContext();
  const { user, role, actorRole, isActive } = auth;

  if (!user || isActive === false) {
    redirect("/");
  }

  const hasAdminAccess =
    role === "admin" || role === "super_admin" || actorRole === "admin" || actorRole === "super_admin";
  if (!hasAdminAccess) {
    redirect("/perfil/resultados");
  }

  const params = searchParams ? await searchParams : {};
  const periodCodes = parsePeriodCodes(params?.periodos);
  const initialData = await getPerformanceReportData({
    periodCodes,
  });

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="print-report-surface rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">
              Perfil
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
              Performance Report
            </h1>
          </div>
          <ExportReportButton />
        </div>
        <p className="mt-3 text-sm text-[#4b5f86]">
          Analiza payout distribution por periodos y detecta comportamientos de low performers.
        </p>

        <PerformanceReportClient initialData={initialData} />
      </div>
    </section>
  );
}
