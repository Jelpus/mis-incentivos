"use client";

import { useActionState } from "react";
import {
  backfillPlatformChangeLogAction,
  createPlatformChangeLogAction,
  type PlatformChangeLogActionResult,
} from "@/app/admin/platform/actions";
import type { PlatformChangeLogData } from "@/lib/admin/platform/get-platform-page-data";

type PlatformChangeLogCardProps = {
  changeLog: PlatformChangeLogData;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function ActionMessage({ state }: { state: PlatformChangeLogActionResult | null }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "text-sm font-medium text-[#047857]" : "text-sm font-medium text-[#b42318]"}>
      {state.message}
    </p>
  );
}

export function PlatformChangeLogCard({ changeLog }: PlatformChangeLogCardProps) {
  const [createState, createAction, createPending] = useActionState<PlatformChangeLogActionResult | null, FormData>(
    createPlatformChangeLogAction,
    null,
  );
  const [backfillState, backfillAction, backfillPending] = useActionState<PlatformChangeLogActionResult | null, FormData>(
    backfillPlatformChangeLogAction,
    null,
  );

  return (
    <section className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Registro de cambios</h2>
          <p className="mt-1 max-w-3xl text-sm text-[#64748b]">
            Bitacora operacional para rastrear ajustes por ruta, estado anterior, estado modificado y commit.
          </p>
        </div>
        <form action={backfillAction} className="flex flex-col items-start gap-2 md:items-end">
          <button
            type="submit"
            disabled={!changeLog.storageReady || backfillPending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {backfillPending ? "Aplicando..." : "Aplicar backfill"}
          </button>
          <ActionMessage state={backfillState} />
        </form>
      </div>

      {!changeLog.storageReady ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {changeLog.storageMessage ?? "Tabla platform_change_log no disponible."}
        </div>
      ) : null}

      <form action={createAction} className="mt-5 grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="grid gap-3 md:grid-cols-[0.9fr_1.3fr_1fr]">
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Fecha
            <input
              name="change_date"
              type="date"
              defaultValue={todayInputValue()}
              className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Ruta
            <input
              name="route"
              placeholder="/perfil/performance-report"
              className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Commit
            <input
              name="commit_ref"
              placeholder="sha o tag"
              className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Estado Actual
            <textarea
              name="current_state"
              rows={3}
              className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Estado Modificado
            <textarea
              name="modified_state"
              rows={3}
              className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ActionMessage state={createState} />
          <button
            type="submit"
            disabled={!changeLog.storageReady || createPending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0f172a] px-4 text-sm font-semibold text-white transition hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {createPending ? "Guardando..." : "Registrar cambio"}
          </button>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto rounded-xl border border-[#e2e8f0]">
        <table className="min-w-full divide-y divide-[#e2e8f0] text-sm">
          <thead className="bg-[#f8fbff]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-[#334155]">Fecha</th>
              <th className="px-3 py-2 text-left font-semibold text-[#334155]">Ruta</th>
              <th className="px-3 py-2 text-left font-semibold text-[#334155]">Estado Actual</th>
              <th className="px-3 py-2 text-left font-semibold text-[#334155]">Estado Modificado</th>
              <th className="px-3 py-2 text-left font-semibold text-[#334155]">Commit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f7] bg-white">
            {changeLog.rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-3 py-3 text-[#475569]">{formatDate(row.changeDate)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-[#1d4ed8]">{row.route}</td>
                <td className="min-w-[18rem] px-3 py-3 text-[#1f2937]">{row.currentState}</td>
                <td className="min-w-[18rem] px-3 py-3 text-[#1f2937]">{row.modifiedState}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[#475569]">
                  {row.commitRef ?? "-"}
                </td>
              </tr>
            ))}
            {changeLog.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-[#64748b]">
                  No hay cambios registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
