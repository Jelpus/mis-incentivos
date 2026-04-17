"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import { upsertTeamAdminAssignmentsAction } from "@/app/admin/teams-admin/actions";
import type { TeamAdminOption, TeamAdminRow } from "@/lib/admin/teams-admin/get-teams-admin-page-data";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type TeamAssignmentRow = {
  teamId: string;
  adminUserId: string | null;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildInitialRows(rows: TeamAdminRow[]): TeamAssignmentRow[] {
  return rows.map((row) => ({
    teamId: row.teamId,
    adminUserId: row.adminUserId,
  }));
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function AdminAvatar({
  name,
  pictureUrl,
  sizeClass,
  textClass,
}: {
  name: string;
  pictureUrl: string | null;
  sizeClass: string;
  textClass: string;
}) {
  if (pictureUrl) {
    return (
      <Image
        src={pictureUrl}
        alt={name}
        width={72}
        height={72}
        className={`${sizeClass} rounded-xl object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} items-center justify-center rounded-xl border border-neutral-300 bg-white ${textClass} font-semibold`}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}

// ─────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
      aria-hidden="true"
    />
  );
}

function FeedbackBanner({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
        state.ok
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          : "bg-red-50 text-red-800 ring-1 ring-red-200"
      }`}
    >
      {state.ok ? (
        <svg className="h-4 w-4 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      )}
      {state.message}
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${accent ?? "border-neutral-200 bg-neutral-50"}`}>
      <span className="text-neutral-400">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
        <p className="text-sm font-bold text-neutral-800">{value}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Legend
// ─────────────────────────────────────────────

function ChipLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-indigo-600" />
        Asignado al admin seleccionado
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-neutral-300 bg-white" />
        Sin asignar
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-neutral-200" />
        Asignado a otro admin
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function TeamsAdminManagementCard({
  storageReady,
  storageMessage,
  admins,
  rows,
}: {
  storageReady: boolean;
  storageMessage: string | null;
  admins: TeamAdminOption[];
  rows: TeamAdminRow[];
}) {
  const [assignmentRows, setAssignmentRows] = useState<TeamAssignmentRow[]>(() => buildInitialRows(rows));
  const [selectedAdminId, setSelectedAdminId] = useState<string>(admins[0]?.userId ?? "");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    upsertTeamAdminAssignmentsAction,
    null,
  );

  const assignedCount = useMemo(
    () => assignmentRows.filter((row) => Boolean(row.adminUserId)).length,
    [assignmentRows],
  );

  const adminById = useMemo(() => {
    const map = new Map<string, TeamAdminOption>();
    for (const admin of admins) map.set(admin.userId, admin);
    return map;
  }, [admins]);

  const assignedByAdmin = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of assignmentRows) {
      if (!row.adminUserId) continue;
      map.set(row.adminUserId, (map.get(row.adminUserId) ?? 0) + 1);
    }
    return map;
  }, [assignmentRows]);

  const selectedAdmin = adminById.get(selectedAdminId);

  function updateAssignment(teamId: string, adminUserId: string | null) {
    setAssignmentRows((prev) =>
      prev.map((row) => (row.teamId === teamId ? { ...row, adminUserId } : row)),
    );
  }

  function toggleTeamForSelectedAdmin(teamId: string) {
    if (!selectedAdminId) return;
    const row = assignmentRows.find((item) => item.teamId === teamId);
    if (!row) return;
    updateAssignment(teamId, row.adminUserId === selectedAdminId ? null : selectedAdminId);
  }

  function clearSelectedAdminAssignments() {
    if (!selectedAdminId) return;
    setAssignmentRows((prev) =>
      prev.map((row) =>
        row.adminUserId === selectedAdminId ? { ...row, adminUserId: null } : row,
      ),
    );
  }

  function clearAllAssignments() {
    setAssignmentRows((prev) => prev.map((row) => ({ ...row, adminUserId: null })));
  }

  const unassignedCount = assignmentRows.length - assignedCount;

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-neutral-950">Teams Admin</h1>
            <p className="text-xs text-neutral-500">
              Selecciona un admin y asigna sus equipos con chips interactivos.
            </p>
          </div>
        </div>

        {storageReady && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelectedAdminAssignments}
              disabled={!selectedAdminId}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Limpiar admin actual
            </button>
            <button
              type="button"
              onClick={clearAllAssignments}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-95"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {/* ── Storage warning ── */}
      {!storageReady && storageMessage && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-800">{storageMessage}</p>
        </div>
      )}

      {storageReady && (
        <form action={formAction} className="px-6 py-5 space-y-5">

          {/* ── Stats row ── */}
          <div className="flex flex-wrap gap-3">
            <StatPill
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              label="Equipos totales"
              value={assignmentRows.length}
            />
            <StatPill
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              label="Asignados"
              value={assignedCount}
              accent="border-emerald-200 bg-emerald-50"
            />
            <StatPill
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              label="Sin asignar"
              value={unassignedCount}
              accent={unassignedCount > 0 ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-neutral-50"}
            />
            <StatPill
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
              label="Admins activos"
              value={admins.length}
            />
          </div>

          {/* ── No admins ── */}
          {admins.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-neutral-600">Sin admins activos</p>
              <p className="mt-1 text-xs text-neutral-400">No se encontraron admins disponibles.</p>
            </div>
          )}

          {/* ── No teams ── */}
          {assignmentRows.length === 0 && admins.length > 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-neutral-600">Sin equipos detectados</p>
              <p className="mt-1 text-xs text-neutral-400">No se encontraron team_id en sales_force_status.</p>
            </div>
          )}

          {admins.length > 0 && assignmentRows.length > 0 && (
            <div className="space-y-4">

              {/* ── Admin selector ── */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-200 text-neutral-600">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                    Paso 1 — Selecciona un admin
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {admins.map((admin) => {
                    const isSelected = admin.userId === selectedAdminId;
                    const assignedToAdmin = assignedByAdmin.get(admin.userId) ?? 0;

                    return (
                      <button
                        key={admin.userId}
                        type="button"
                        onClick={() => setSelectedAdminId(admin.userId)}
                        className={`group relative rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                          isSelected
                            ? "border-indigo-400 bg-white shadow-md shadow-indigo-100 ring-2 ring-indigo-200"
                            : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <AdminAvatar
                            name={admin.displayName}
                            pictureUrl={admin.pictureUrl}
                            sizeClass="h-9 w-9 flex-shrink-0"
                            textClass="text-sm text-neutral-700"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-neutral-900">{admin.displayName}</p>
                            <p className="truncate text-[11px] text-neutral-400">{admin.email ?? "sin correo"}</p>
                          </div>
                          {isSelected && (
                            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              assignedToAdmin > 0
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-neutral-100 text-neutral-500"
                            }`}
                          >
                            {assignedToAdmin} equipo{assignedToAdmin !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Team chips ── */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-200 text-neutral-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </span>
                      <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                        Paso 2 — Asigna equipos
                      </p>
                    </div>
                    {selectedAdmin ? (
                      <div className="flex items-center gap-2">
                        <AdminAvatar
                          name={selectedAdmin.displayName}
                          pictureUrl={selectedAdmin.pictureUrl}
                          sizeClass="h-6 w-6"
                          textClass="text-[10px] text-neutral-700"
                        />
                        <p className="text-sm font-semibold text-neutral-800">
                          {selectedAdmin.displayName}
                        </p>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {assignedByAdmin.get(selectedAdminId) ?? 0} asignados
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400 italic">Selecciona un admin primero</p>
                    )}
                  </div>
                  <ChipLegend />
                </div>

                <div className="max-h-[360px] overflow-y-auto rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {assignmentRows.map((row) => {
                      const isAssignedToSelected = row.adminUserId === selectedAdminId;
                      const isUnassigned = !row.adminUserId;
                      const ownerName = row.adminUserId
                        ? adminById.get(row.adminUserId)?.displayName ?? "Otro admin"
                        : "Sin asignar";

                      let chipCls: string;
                      if (isAssignedToSelected) {
                        chipCls =
                          "border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700";
                      } else if (isUnassigned) {
                        chipCls =
                          "border-neutral-200 bg-white text-neutral-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700";
                      } else {
                        chipCls =
                          "border-neutral-300 bg-neutral-100 text-neutral-500 hover:bg-neutral-200";
                      }

                      return (
                        <button
                          key={row.teamId}
                          type="button"
                          disabled={!selectedAdminId}
                          onClick={() => toggleTeamForSelectedAdmin(row.teamId)}
                          title={ownerName}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${chipCls}`}
                        >
                          {row.teamId}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!selectedAdminId && (
                  <p className="mt-2 text-center text-xs text-neutral-400">
                    Selecciona un admin para activar los chips.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Hidden inputs */}
          {assignmentRows.map((row) => (
            <div key={row.teamId} className="hidden">
              <input type="hidden" name="team_ids[]" value={row.teamId} />
              <input type="hidden" name="admin_user_ids[]" value={row.adminUserId ?? ""} />
            </div>
          ))}

          {/* ── Submit ── */}
          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4">
            <button
              type="submit"
              disabled={isPending || assignmentRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <LoadingSpinner />
                  Guardando...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Guardar asignaciones
                </>
              )}
            </button>
            <FeedbackBanner state={state} />
          </div>
        </form>
      )}
    </section>
  );
}
