import Link from "next/link";
import { Suspense } from "react";
import { CalculoProcessRunner } from "@/components/admin/calculo-process-runner";
import { CalculoProcessDiagnosticsCard } from "@/components/admin/calculo-process-diagnostics-card";
import { getCalculoProcessData } from "@/lib/admin/calculo/get-calculo-process-data";
import { normalizeCalculoPeriodParam } from "@/lib/admin/calculo/period";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoProcessPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const periodMonth = normalizeCalculoPeriodParam(params?.periodo ?? null);

  if (!periodMonth) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
          <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-neutral-500">Admin / Calculo / Process</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Calcular periodo</h1>
            <p className="mt-2 max-w-4xl text-sm text-neutral-600">
              Ejecuta el proceso de calculo inicial y mueve el periodo a estatus precalculo.
            </p>
          </header>

          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-800">Periodo invalido</h2>
            <p className="mt-2 text-sm text-red-700">
              Usa la URL con <code>periodo=YYYY-MM</code>, por ejemplo{" "}
              <code>/admin/calculo/process?periodo=2026-01</code>.
            </p>
            <Link
              href="/admin/calculo"
              className="mt-4 inline-flex rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              Volver a calculo
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Calculo / Process</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Calcular periodo</h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Diagnostico previo por miembro: status activo, team, reglas, fuentes y objetivos.
          </p>
        </header>

        <Suspense
          fallback={
            <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-3 h-5 w-48 animate-pulse rounded bg-neutral-200" />
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded bg-neutral-100" />
                ))}
              </div>
            </section>
          }
        >
          <ProcessDiagnosticsSection periodMonth={periodMonth} />
        </Suspense>

        <CalculoProcessRunner periodMonth={periodMonth} />
      </div>
    </main>
  );
}

async function ProcessDiagnosticsSection({ periodMonth }: { periodMonth: string }) {
  const processData = await getCalculoProcessData(periodMonth);
  return <CalculoProcessDiagnosticsCard data={processData} />;
}
