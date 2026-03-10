"use client";

import { applyImportBatchAction } from "@/app/admin/status/actions";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";


type Props = {
  batchId: string;
  importTypeCode: string;
  batchStatus: string;
  invalidRows: number;
  insertRows: number;
  updateRows: number;
  noopRows: number;
  nextBatchId?: string | null;
  flowStep?: number | null;
  flowTotal?: number | null;
};

type ActionState =
  | { ok: true; message: string; batchId: string }
  | { ok: false; message: string; batchId?: string }
  | null;

export function ApplyImportBatchCard({
  batchId,
  importTypeCode,
  batchStatus,
  invalidRows,
  insertRows,
  updateRows,
  noopRows,
  nextBatchId = null,
  flowStep = null,
  flowTotal = null,
}: Props) {
  const router = useRouter();
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(applyImportBatchAction, null);

  const canApply = batchStatus === "preview_ready" && invalidRows === 0;
  const displayTotal =
    flowTotal && flowTotal > 0 ? flowTotal : nextBatchId ? 2 : null;
  const displayStep =
    flowStep && flowStep > 0 ? flowStep : displayTotal ? 1 : null;
  const nextFlowStep =
    displayTotal && displayStep
      ? Math.min(displayStep + 1, displayTotal)
      : 2;

  useEffect(() => {
    if (!state?.ok) return;

    const destination = nextBatchId
      ? `/admin/status/imports/${nextBatchId}?flow_step=${nextFlowStep}&flow_total=${displayTotal ?? 2}`
      : "/admin/status";

    const timeout = setTimeout(() => {
      router.push(destination);
    }, 700);

    return () => clearTimeout(timeout);
  }, [displayTotal, nextBatchId, nextFlowStep, router, state]);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">
            Aplicar batch
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Esto insertará y actualizará los registros válidos en la tabla final.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              <p className="text-neutral-500">Insert</p>
              <p className="mt-1 font-medium text-neutral-900">{insertRows}</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              <p className="text-neutral-500">Update</p>
              <p className="mt-1 font-medium text-neutral-900">{updateRows}</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              <p className="text-neutral-500">Sin cambios</p>
              <p className="mt-1 font-medium text-neutral-900">{noopRows}</p>
            </div>
          </div>

          {!canApply ? (
            <p className="mt-4 text-sm text-amber-700">
              {invalidRows > 0
                ? "No puedes aplicar este batch mientras existan filas inválidas."
                : `El batch debe estar en estado "preview_ready". Estado actual: ${batchStatus}.`}
            </p>
          ) : null}
        </div>

        <form action={formAction} className="w-full max-w-sm">
          {displayStep && displayTotal ? (
            <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Progreso del proceso
              </p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                Paso {displayStep} de {displayTotal}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-neutral-900"
                  style={{ width: `${Math.min((displayStep / displayTotal) * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          <input type="hidden" name="batch_id" value={batchId} />
          <input type="hidden" name="import_type_code" value={importTypeCode} />

          <button
            type="submit"
            disabled={!canApply || isPending}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Aplicando batch..." : "Aplicar batch"}
          </button>

          {isPending ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Aplicando cambios del batch en la tabla final. No cierres esta pantalla.
            </div>
          ) : null}

          {state ? (
            <div
              className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                state.ok
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              <p>{state.message}</p>
              {state.ok ? (
                <p className="mt-1">
                  {nextBatchId
                    ? "Redirigiendo al siguiente batch..."
                    : "Redirigiendo a Status..."}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
