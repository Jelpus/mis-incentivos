import { Suspense } from "react";
import { CalculationDebuggerCard } from "@/components/admin/calculation-debugger-card";
import { getCalculationDebuggerPageData } from "@/lib/admin/calculation-debugger/get-page-data";

function Fallback() {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 h-5 w-48 animate-pulse rounded bg-neutral-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
    </section>
  );
}

async function CalculationDebuggerSection() {
  const data = await getCalculationDebuggerPageData();
  return <CalculationDebuggerCard data={data} />;
}

export default function AdminCalculationDebuggerPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Configuracion</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Calculation Debugger
          </h1>
        </header>

        <Suspense fallback={<Fallback />}>
          <CalculationDebuggerSection />
        </Suspense>
      </div>
    </main>
  );
}
