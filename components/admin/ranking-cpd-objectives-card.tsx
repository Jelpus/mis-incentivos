"use client";

import { upsertRankingCpdObjectivesAction } from "@/app/admin/reglas-ranking/actions";
import type { RankingCpdObjectiveRow } from "@/lib/admin/reglas-ranking/get-ranking-cpd-objectives-data";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

type ActionState =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    }
  | null;

type Props = {
  storageReady: boolean;
  storageMessage: string | null;
  rows: RankingCpdObjectiveRow[];
};

export function RankingCpdObjectivesCard({ storageReady, storageMessage, rows }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    upsertRankingCpdObjectivesAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Objetivos CPD</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Define el objetivo CPD por <code>team_id</code>.
          </p>
        </div>
        <p className="text-sm text-neutral-600">Teams: {rows.length}</p>
      </div>

      {!storageReady && storageMessage ? (
        <p className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {storageMessage}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          No se encontraron team_id para configurar objetivos CPD.
        </p>
      ) : (
        <form action={formAction} className="grid gap-4">
          <div className="overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Objetivo CPD</th>
                  <th className="px-4 py-3">Origen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamId} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {row.teamId}
                      <input type="hidden" name="team_id[]" value={row.teamId} />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        name="objective_cpd[]"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={row.objectiveCpd}
                        placeholder="Sin objetivo"
                        disabled={!storageReady || isPending}
                        className="w-full max-w-xs rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {row.source === "objective" ? "Configurado" : "Pendiente"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {state ? (
              <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
                {state.message}
              </p>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={!storageReady || isPending}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? "Guardando..." : "Guardar objetivos CPD"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
