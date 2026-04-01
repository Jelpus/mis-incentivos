import { getCalculoPageData } from "@/lib/admin/calculo/get-calculo-page-data";
import { CalculoManagementCard } from "@/components/admin/calculo-management-card";
import { Suspense } from "react";

function CalculoManagementFallback() {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
    </section>
  );
}

async function CalculoManagementSection() {
  const data = await getCalculoPageData();

  return (
    <>
      {!data.storageReady && data.storageMessage ? (
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-amber-900">Storage pendiente</h2>
          <p className="mt-1 text-sm text-amber-800">{data.storageMessage}</p>
        </section>
      ) : null}

      <CalculoManagementCard
        rows={data.rows}
        bigQueryReady={data.bigQueryReady}
        bigQueryMessage={data.bigQueryMessage}
      />
    </>
  );
}

export default function AdminCalculoPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Calculo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Calculo de incentivos
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Control de estatus por periodo y transiciones operativas del proceso de calculo.
          </p>
        </header>

        <Suspense fallback={<CalculoManagementFallback />}>
          <CalculoManagementSection />
        </Suspense>
      </div>
    </main>
  );
}
