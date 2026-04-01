import { getObjetivosPageData } from "@/lib/admin/objetivos/get-objetivos-page-data";
import { ObjetivosManagementCard } from "@/components/admin/objetivos-management-card";
import { Suspense } from "react";

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function AdminObjetivosPage({ searchParams }: PageProps) {
  // Admin auth check already happens in app/admin/layout.tsx.

  const params = searchParams ? await searchParams : {};
  const selectedPeriodInput = params?.period ?? null;

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Objetivos</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Gestion de objetivos individuales
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Importa objetivos por ruta y producto, con versionado y alertas de cobertura para detectar faltantes
            antes del calculo de incentivos.
          </p>
        </header>

        <Suspense fallback={<ObjetivosSectionFallback />}>
          <ObjetivosSection periodInput={selectedPeriodInput} />
        </Suspense>
      </div>
    </main>
  );
}

function ObjetivosSectionFallback() {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-44 animate-pulse rounded bg-neutral-200" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
    </section>
  );
}

async function ObjetivosSection({ periodInput }: { periodInput: string | null }) {
  const data = await getObjetivosPageData(periodInput);

  return (
    <>
      {!data.storageReady && data.storageMessage ? (
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-amber-900">Storage pendiente</h2>
          <p className="mt-1 text-sm text-amber-800">{data.storageMessage}</p>
        </section>
      ) : null}

      <ObjetivosManagementCard
        periodMonth={data.periodMonth}
        availablePeriods={data.availableStatusPeriods}
        latestVersion={data.latestVersion}
        versions={data.versions}
      />
    </>
  );
}
