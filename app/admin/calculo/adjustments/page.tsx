import Link from "next/link";
import { CalculoAdjustmentsRunner } from "@/components/admin/calculo-adjustments-runner";
import { normalizeCalculoPeriodParam } from "@/lib/admin/calculo/period";
import { getAdjustmentsOptionsData } from "@/lib/admin/calculo/get-adjustments-options";
import { getAdjustmentsListData } from "@/lib/admin/calculo/get-adjustments-list-data";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoAdjustmentsPage({ searchParams }: PageProps) {
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
              <code>/admin/calculo/adjustments?periodo=2026-01</code>.
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

  const [options, listData] = await Promise.all([
    getAdjustmentsOptionsData(periodMonth),
    getAdjustmentsListData(periodMonth),
  ]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Admin / Calculo / Ajustar</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Ajustes de calculo</h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">
            Sube archivo o aplica ajustes manuales para sumar/ restar `pagoresultado` en `resultados_v2`.
          </p>
        </header>
        <CalculoAdjustmentsRunner
          periodMonth={periodMonth}
          rutas={options.rutas}
          productNames={options.productNames}
          optionsMessage={options.message}
          existingAdjustments={listData.rows}
          existingAdjustmentsMessage={listData.message}
        />
      </div>
    </main>
  );
}
