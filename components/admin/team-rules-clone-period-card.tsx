"use client";

import { useActionState, useMemo, useState } from "react";
import { cloneTeamRulesPeriodAction } from "@/app/admin/incentive-rules/actions";
import {
  formatPeriodMonthForInput,
  formatPeriodMonthLabel,
} from "@/lib/admin/incentive-rules/shared";

type CloneContext = {
  latest_period: string | null;
  available_source_periods: string[];
  latest_count: number;
  target_count: number;
  can_clone: boolean;
  message: string;
};

type Props = {
  cloneContext: CloneContext | null;
  targetPeriodMonthInput: string; // YYYY-MM
};

type ActionState = { ok: true; message: string } | { ok: false; message: string } | null;

export function TeamRulesClonePeriodCard({ cloneContext, targetPeriodMonthInput }: Props) {
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(cloneTeamRulesPeriodAction, null);
  const sourcePeriodOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (cloneContext?.available_source_periods ?? [])
            .map((value) => formatPeriodMonthForInput(value))
            .filter((value) => value.length > 0),
        ),
      ),
    [cloneContext?.available_source_periods],
  );
  const [sourcePeriodInput, setSourcePeriodInput] = useState(
    (cloneContext?.latest_period ? formatPeriodMonthForInput(cloneContext.latest_period) : null) ??
      sourcePeriodOptions[0] ??
      "",
  );

  if (!cloneContext) {
    return (
      <div className="h-full rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Crear siguiente mes</h2>
        <p className="mt-2 text-sm text-neutral-600">
          No fue posible cargar el contexto de clonacion.
        </p>
      </div>
    );
  }

  const targetPeriodDisplay = targetPeriodMonthInput;
  const targetPeriodDate = `${targetPeriodMonthInput}-01`;
  const canCloneForTarget =
    cloneContext.can_clone &&
    Boolean(sourcePeriodInput) &&
    `${sourcePeriodInput}-01` !== targetPeriodDate &&
    cloneContext.target_count === 0;

  return (
    <div className="h-full rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">Crear siguiente mes</h2>
      <p className="mt-1 text-sm leading-6 text-neutral-600">
        Genera PayComponents del siguiente periodo copiando la ultima version con datos.
      </p>

      <div className="mt-4 space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Ultimo periodo con datos</span>
          <span className="font-medium text-neutral-900">
            {formatPeriodMonthLabel(cloneContext.latest_period)}
          </span>
        </div>
        <div>
          <label
            htmlFor="team_rules_clone_source_period"
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            Periodo origen
          </label>
          <select
            id="team_rules_clone_source_period"
            value={sourcePeriodInput}
            onChange={(event) => setSourcePeriodInput(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
          >
            {sourcePeriodOptions.map((period) => (
              <option key={period} value={period}>
                {formatPeriodMonthLabel(period)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Periodo destino</span>
          <span className="font-medium text-neutral-900">
            {formatPeriodMonthLabel(targetPeriodDisplay)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Teams origen</span>
          <span className="font-medium text-neutral-900">{cloneContext.latest_count}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-500">Teams ya en destino</span>
          <span className="font-medium text-neutral-900">{cloneContext.target_count}</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-600">{cloneContext.message}</p>

      <form action={formAction} className="mt-5 space-y-4">
        <input
          type="hidden"
          name="source_period"
          value={sourcePeriodInput}
        />
        <input
          type="hidden"
          name="target_period"
          value={targetPeriodMonthInput}
        />

        <button
          type="submit"
          disabled={!canCloneForTarget || isPending}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Clonando..." : "Copiar al siguiente mes"}
        </button>

        {state ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        ) : null}
      </form>
    </div>
  );
}
