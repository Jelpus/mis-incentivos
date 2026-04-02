import Link from "next/link";
import { CalculoApproveRunner } from "@/components/admin/calculo-approve-runner";
import { normalizeCalculoPeriodParam } from "@/lib/admin/calculo/period";
import { getAprobarPreviewData } from "@/lib/admin/calculo/get-aprobar-preview-data";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoAprobarPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const periodMonth = normalizeCalculoPeriodParam(params?.periodo ?? null);

  if (!periodMonth) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-800">Periodo invalido</h2>
            <p className="mt-2 text-sm text-red-700">
              Usa la URL con parametro <code>periodo=YYYY-MM</code>. Ejemplo:{" "}
              <code>/admin/calculo/aprobar?periodo=2026-01</code>.
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

  const data = await getAprobarPreviewData(periodMonth);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Calculo / Aprobar</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Aprobar periodo</h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Vista final de resultados (equivalente a 1.2) aplicando ajustes activos antes de aprobar.
          </p>
        </header>

        <CalculoApproveRunner
          periodMonth={periodMonth}
          rows={data.rows}
          adjustments={data.adjustments}
          summary={data.summary}
          message={data.message}
        />
      </div>
    </main>
  );
}
