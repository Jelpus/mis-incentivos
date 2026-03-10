"use client";

import { saveTeamIncentiveRuleVersionAction } from "@/app/admin/incentive-rules/actions";
import { useActionState } from "react";

type Props = {
  teamId: string;
  periodMonthInput: string; // YYYY-MM
  defaultRuleDefinition: string;
};

type ActionState =
  | { ok: true; message: string; versionNo: number }
  | { ok: false; message: string }
  | null;

export function TeamIncentiveRuleEditor({
  teamId,
  periodMonthInput,
  defaultRuleDefinition,
}: Props) {
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(saveTeamIncentiveRuleVersionAction, null);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">Nueva version de reglas</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Guarda una nueva version para mantener trazabilidad por team y periodo.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="team_id" value={teamId} />
        <input type="hidden" name="period_month" value={periodMonthInput} />

        <div>
          <label
            htmlFor="change_note"
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            Nota de cambio
          </label>
          <textarea
            id="change_note"
            name="change_note"
            rows={3}
            placeholder="Ejemplo: Ajuste de ponderadores para cardiometabolico."
            className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
          />
        </div>

        <div>
          <label
            htmlFor="rule_definition"
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            Definicion JSON de reglas
          </label>
          <textarea
            id="rule_definition"
            name="rule_definition"
            rows={16}
            defaultValue={defaultRuleDefinition}
            className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none focus:border-neutral-950"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Guardando version..." : "Guardar nueva version"}
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
    </section>
  );
}
