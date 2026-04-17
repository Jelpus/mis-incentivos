"use client";

import { upsertRankingContestParticipantsAction } from "@/app/admin/reglas-ranking/actions";
import type {
  ContestParticipationRow,
  RankingGroupRow,
} from "@/lib/admin/reglas-ranking/get-ranking-participation-data";
import { useActionState, useState } from "react";

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

function LoadingSpinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
      aria-hidden="true"
    />
  );
}

function ContestParticipationItem({
  contest,
  groups,
}: {
  contest: ContestParticipationRow;
  groups: RankingGroupRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(contest.participantGroupIds);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    upsertRankingContestParticipantsAction,
    null,
  );

  function toggleGroup(groupId: string) {
    setSelectedIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  }

  function selectAll() {
    setSelectedIds(groups.map((group) => group.id));
  }

  function clearAll() {
    setSelectedIds([]);
  }

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-neutral-950">{contest.contestName}</p>
          <p className="text-xs text-neutral-500">{contest.isActive ? "Activo" : "Inactivo"}</p>
        </div>
      </div>

      <form action={formAction} className="mt-3">
        <input type="hidden" name="contest_id" value={contest.contestId} />
        {selectedIds.map((groupId) => (
          <input key={`${contest.contestId}-${groupId}`} type="hidden" name="ranking_group_ids[]" value={groupId} />
        ))}

        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Seleccionar todos
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Ninguno
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {groups.map((group) => {
            const selected = selectedIds.includes(group.id);
            return (
              <button
                key={`${contest.contestId}-${group.id}`}
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-neutral-300 bg-white text-neutral-800"
                }`}
              >
                {group.name}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {isPending ? (
              <>
                <LoadingSpinner />
                Guardando...
              </>
            ) : (
              "Guardar participación"
            )}
          </button>
          <p className="text-xs text-neutral-500">Seleccionados: {selectedIds.length}</p>
          {state ? (
            <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>
          ) : null}
        </div>
      </form>
    </article>
  );
}

export function RankingParticipationCard({
  storageReady,
  storageMessage,
  groups,
  contests,
}: {
  storageReady: boolean;
  storageMessage: string | null;
  groups: RankingGroupRow[];
  contests: ContestParticipationRow[];
}) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">Participación Equipos</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Define qué grupos de ranking participan en cada concurso.
      </p>

      {!storageReady && storageMessage ? (
        <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {storageMessage}
        </p>
      ) : null}

      {storageReady ? (
        <>
      
          <div className="mt-4 space-y-3">
            {contests.length === 0 ? (
              <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                No hay concursos creados aún.
              </p>
            ) : (
              contests.map((contest) => (
                <ContestParticipationItem key={contest.contestId} contest={contest} groups={groups} />
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
