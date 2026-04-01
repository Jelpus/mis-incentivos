"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { updateCalculoStatusAction, type CalculoActionResult } from "@/app/admin/calculo/actions";

type Props = {
  periodMonth: string;
  actionKey: "calcular" | "ajustar" | "aprobar" | "publicar" | "despublicar";
  submitLabel: string;
  backHref?: string;
};

export function CalculoActionRunner({ periodMonth, actionKey, submitLabel, backHref = "/admin/calculo" }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CalculoActionResult | null>(null);
  const periodLabel = useMemo(() => periodMonth.slice(0, 7), [periodMonth]);

  function runAction() {
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("period_month", periodMonth);
      formData.append("action", actionKey);
      const response = await updateCalculoStatusAction(null, formData);
      setResult(response);
    });
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-neutral-600">
        Periodo: <span className="font-semibold text-neutral-900">{periodLabel}</span>
      </p>

      {result ? (
        <p className={`mt-3 text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
          {result.message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runAction}
          disabled={isPending}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Procesando..." : submitLabel}
        </button>
        <Link
          href={backHref}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Volver a calculo
        </Link>
      </div>
    </section>
  );
}

