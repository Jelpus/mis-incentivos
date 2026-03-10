"use client";

import { useActionState } from "react";
import { cloneSalesForcePeriodAction } from "../../app/admin/status/actions";

type CloneContext = {
  latest_period: string | null;
  suggested_next_period: string | null;
  latest_count: number;
  target_count: number;
  can_clone: boolean;
  message: string;
};

type Props = {
  cloneContext: CloneContext | null;
};

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

function formatPeriodLabel(value: string | null) {
  if (!value) return "—";
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

export function ClonePeriodCard({ cloneContext }: Props) {
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(cloneSalesForcePeriodAction, null);

  if (!cloneContext) {
    return (
      <div className="h-full rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">
          Crear siguiente período
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          No fue posible cargar el contexto de clonación.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">
        Crear siguiente período
      </h2>

      <p className="mt-1 text-sm leading-6 text-neutral-600">
        Crea el nuevo mes a partir del último período cargado para evitar subir
        toda la estructura desde cero.
      </p>

      <div className="mt-4 space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Último período</span>
          <span className="font-medium text-neutral-900">
            {formatPeriodLabel(cloneContext.latest_period)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Siguiente sugerido</span>
          <span className="font-medium text-neutral-900">
            {formatPeriodLabel(cloneContext.suggested_next_period)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Registros origen</span>
          <span className="font-medium text-neutral-900">
            {cloneContext.latest_count}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Registros ya en destino</span>
          <span className="font-medium text-neutral-900">
            {cloneContext.target_count}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-600">{cloneContext.message}</p>

      <form action={formAction} className="mt-5 space-y-4">
        <input
          type="hidden"
          name="source_period"
          value={cloneContext.latest_period?.slice(0, 7) ?? ""}
        />
        <input
          type="hidden"
          name="target_period"
          value={cloneContext.suggested_next_period?.slice(0, 7) ?? ""}
        />
        <input type="hidden" name="active_only" value="true" />

        <button
          type="submit"
          disabled={!cloneContext.can_clone || isPending}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Copiando..." : "Copiar al siguiente mes"}
        </button>

        {state ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              state.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        ) : null}
      </form>
    </div>
  );
}