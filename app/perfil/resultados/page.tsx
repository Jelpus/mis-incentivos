import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import {
  getResultadosV2Data,
  getResultadosV2PeriodSummary,
} from "@/lib/results/get-resultados-v2-data";
import { PerfilResultadosClient } from "@/components/results/perfil-resultados-client";

type ResultadosPageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function PerfilResultadosPage({ searchParams }: ResultadosPageProps) {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveUserId } = auth;

  if (!user || isActive === false) {
    redirect("/");
  }

  const profileUserId = effectiveUserId ?? user.id;
  const params = searchParams ? await searchParams : {};
  const requestedPeriod = params?.periodo ?? null;

  const [data, periodSummaryData] = await Promise.all([
    getResultadosV2Data({
      role,
      profileUserId,
      periodCode: requestedPeriod,
      maxRows: role === "user" ? 120 : 250,
    }),
    getResultadosV2PeriodSummary({
      role,
      profileUserId,
      maxPeriods: 12,
    }),
  ]);

  const detailLevel =
    role === "admin" || role === "super_admin" || role === "viewer"
      ? "full"
      : role === "manager"
        ? "team"
        : "basic";

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">
          Perfil
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
          Resultados
        </h1>
        <p className="mt-3 text-sm text-[#4b5f86]">
          Vista completa de resultados con alcance por rol y periodo.
        </p>

        <PerfilResultadosClient
          initialData={data}
          initialPeriodSummaries={periodSummaryData.periods}
          detailLevel={detailLevel}
        />
      </div>
    </section>
  );
}
