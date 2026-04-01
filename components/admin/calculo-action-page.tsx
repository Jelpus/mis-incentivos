import Link from "next/link";
import { CalculoActionRunner } from "@/components/admin/calculo-action-runner";
import { normalizeCalculoPeriodParam } from "@/lib/admin/calculo/period";

type ActionKey = "calcular" | "ajustar" | "aprobar" | "publicar" | "despublicar";

type Props = {
  breadcrumb: string;
  title: string;
  description: string;
  submitLabel: string;
  actionKey: ActionKey;
  periodParam: string | null | undefined;
};

export function CalculoActionPage({
  breadcrumb,
  title,
  description,
  submitLabel,
  actionKey,
  periodParam,
}: Props) {
  const periodMonth = normalizeCalculoPeriodParam(periodParam);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">{breadcrumb}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{title}</h1>
          <p className="mt-2 max-w-4xl text-sm text-neutral-600">{description}</p>
        </header>

        {!periodMonth ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-800">Periodo invalido</h2>
            <p className="mt-2 text-sm text-red-700">
              Usa la URL con parametro <code>periodo=YYYY-MM</code>. Ejemplo:{" "}
              <code>/admin/calculo/process?periodo=2026-01</code>.
            </p>
            <Link
              href="/admin/calculo"
              className="mt-4 inline-flex rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              Volver a calculo
            </Link>
          </section>
        ) : (
          <CalculoActionRunner
            periodMonth={periodMonth}
            actionKey={actionKey}
            submitLabel={submitLabel}
          />
        )}
      </div>
    </main>
  );
}

