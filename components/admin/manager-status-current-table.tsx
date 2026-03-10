"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveManagerStatusAction } from "@/app/admin/status/actions";
import type { ManagerStatusRow } from "@/lib/admin/status/get-status-page-data";

type Props = {
  rows: ManagerStatusRow[];
  periodMonth: string;
};

type SaveState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type Mode = "create" | "edit";

export function ManagerStatusCurrentTable({ rows, periodMonth }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] =
    useActionState<SaveState, FormData>(saveManagerStatusAction, null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  const teamOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => String(row.team_id ?? "").trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      if (teamFilter !== "all" && row.team_id !== teamFilter) return false;

      if (!search) return true;

      const searchableText =
        `${row.territorio_manager} ${row.nombre_manager ?? ""} ${row.correo_manager ?? ""} ${row.no_empleado_manager ?? ""}`.toLowerCase();
      return searchableText.includes(search);
    });
  }, [rows, searchTerm, teamFilter]);

  function openCreate() {
    setMode("create");
    setSelectedId(null);
  }

  function openEdit(id: string) {
    setMode("edit");
    setSelectedId(id);
  }

  function closeModal() {
    setMode(null);
    setSelectedId(null);
  }

  return (
    <section className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">
            Manager status actual
          </h3>
          <p className="mt-1 text-sm text-neutral-600">
            Catálogo de managers cargados para el período {periodMonth.slice(0, 7)}.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Agregar manager
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <select
          value={teamFilter}
          onChange={(event) => setTeamFilter(event.target.value)}
          className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Todos los teams</option>
          {teamOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar territorio, nombre, correo o no. empleado"
          className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-5 hidden xl:block">
        <table className="w-full table-fixed divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr className="text-left text-neutral-600">
              <th className="px-3 py-3 font-medium">Manager</th>
              <th className="px-3 py-3 font-medium">Datos</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                  No hay managers para el período o filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-neutral-900">{row.nombre_manager ?? "—"}</p>
                    <p className="text-xs text-neutral-500">{row.correo_manager ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs text-neutral-700">
                      <p>
                        <span className="font-medium text-neutral-500">No. empleado:</span>{" "}
                        {row.no_empleado_manager ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium text-neutral-500">Territorio:</span>{" "}
                         {row.territorio_manager}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {row.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(row.id)}
                      className="rounded-xl border px-3 py-1 text-xs"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 space-y-3 xl:hidden">
        {filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 p-4 text-center text-sm text-neutral-500">
            No hay managers para el período o filtros seleccionados.
          </div>
        ) : (
          filteredRows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{row.territorio_manager}</p>
                  <p className="text-xs text-neutral-600">{row.nombre_manager ?? "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(row.id)}
                  className="rounded-xl border px-3 py-1 text-xs"
                >
                  Editar
                </button>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-neutral-700">
                <p>Correo: {row.correo_manager ?? "—"}</p>
                <p>No. empleado: {row.no_empleado_manager ?? "—"}</p>
                <p>Team: {row.team_id ?? "—"}</p>
                <p>Estado: {row.is_active ? "Activo" : "Inactivo"}</p>
              </div>
            </article>
          ))
        )}
      </div>

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-neutral-950">
                  {mode === "create" ? "Agregar manager" : "Editar manager"}
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Completa la información base del manager para el período.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-neutral-300 px-3 py-1.5 text-sm"
              >
                Cerrar
              </button>
            </div>

            <form
              key={`${mode}-${selectedId ?? "new"}`}
              action={formAction}
              className="mt-6 space-y-4"
            >
              <input
                type="hidden"
                name="mode"
                value={mode === "create" ? "create" : "edit"}
              />
              <input type="hidden" name="manager_id" value={selectedRow?.id ?? ""} />
              <input type="hidden" name="period_month" value={periodMonth} />

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  name="territorio_manager"
                  label="Territorio manager"
                  defaultValue={selectedRow?.territorio_manager}
                  required
                />
                <Field
                  name="nombre_manager"
                  label="Nombre manager"
                  defaultValue={selectedRow?.nombre_manager ?? ""}
                  required
                />
                <Field
                  name="correo_manager"
                  label="Correo manager"
                  type="email"
                  defaultValue={selectedRow?.correo_manager ?? ""}
                />
                <Field
                  name="no_empleado_manager"
                  label="No. empleado manager"
                  type="number"
                  defaultValue={selectedRow?.no_empleado_manager ? String(selectedRow.no_empleado_manager) : ""}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Checkbox
                  name="is_active"
                  label="Activo"
                  defaultChecked={selectedRow?.is_active ?? true}
                />
                <Checkbox
                  name="is_vacant"
                  label="Vacante"
                  defaultChecked={selectedRow?.is_vacant ?? false}
                />
              </div>

              {state ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {state.message}
                </div>
              ) : null}

              <div className="flex justify-end">
                {state?.ok ? (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="mr-2 rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                  >
                    Cerrar
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Guardando..." : mode === "create" ? "Crear manager" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue = "",
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
      />
    </div>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-neutral-300"
      />
      {label}
    </label>
  );
}
