"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSalesForceStatusAction } from "@/app/admin/status/actions";
import type { StatusPageRow } from "@/lib/admin/status/get-status-page-data";

type Props = {
  rows: StatusPageRow[];
  periodMonth: string; // YYYY-MM-01
};

type SaveState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type Mode = "create" | "edit";

const CUSTOM_OPTION_VALUE = "__custom__";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );
}

export function StatusCurrentTable({ rows, periodMonth }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] =
    useActionState<SaveState, FormData>(saveSalesForceStatusAction, null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lineaFilter, setLineaFilter] = useState<string>("all");
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

  const lineaOptions = useMemo(
    () => uniqueSorted(rows.map((row) => row.linea_principal)),
    [rows],
  );
  const teamOptions = useMemo(
    () => uniqueSorted(rows.map((row) => row.team_id)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      if (lineaFilter !== "all" && row.linea_principal !== lineaFilter) return false;
      if (teamFilter !== "all" && row.team_id !== teamFilter) return false;

      if (!search) return true;

      const searchableText =
        `${row.nombre_completo} ${row.correo_electronico ?? ""} ${row.territorio_individual} ${row.territorio_padre} ${row.no_empleado ?? ""}`.toLowerCase();
      return searchableText.includes(search);
    });
  }, [lineaFilter, rows, searchTerm, teamFilter]);

  const modalOptionSets = useMemo(
    () => ({
      linea_principal: lineaOptions,
      parrilla: uniqueSorted(rows.map((row) => row.parrilla)),
      territorio_padre: uniqueSorted(rows.map((row) => row.territorio_padre)),
      territorio_individual: uniqueSorted(rows.map((row) => row.territorio_individual)),
      puesto: uniqueSorted(rows.map((row) => row.puesto)),
      team_id: teamOptions,
      ciudad: uniqueSorted(rows.map((row) => row.ciudad)),
    }),
    [lineaOptions, rows, teamOptions],
  );

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
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between py-5">
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={lineaFilter}
            onChange={(event) => setLineaFilter(event.target.value)}
            className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">Todas las líneas</option>
            {lineaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

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
            placeholder="Buscar nombre, territorio, correo o no. empleado"
            className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Agregar miembro
        </button>
      </div>

      <div className="mt-5 hidden xl:block overflow-hidden rounded-3xl border border-neutral-200">
        <div>
          <table className="w-full table-fixed divide-y divide-neutral-200 text-sm">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="bg-neutral-50">
              <tr className="text-left text-neutral-600">
                <th className="px-3 py-3 font-medium">Colaborador</th>
                <th className="px-3 py-3 font-medium">Manager</th>
                <th className="px-3 py-3 font-medium">Estructura</th>
                <th className="px-3 py-3 font-medium">No. empleado</th>
                <th className="px-3 py-3 font-medium">Base Incentivos</th>
                <th className="px-3 py-3 font-medium">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200 bg-white">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                    No hay registros para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-neutral-900">{row.nombre_completo}</p>
                      <p className="text-xs text-neutral-500">{row.correo_electronico ?? "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs">
                        <div className="font-medium text-neutral-900">
                          {row.nombre_manager ?? row.territorio_padre}
                        </div>
                        <div className="text-neutral-500">
                          {row.correo_manager ?? "—"}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-neutral-700">
                      <p>
                        <span className="font-medium text-neutral-500">Team:</span> {row.team_id}
                      </p>
                      <p>
                        <span className="font-medium text-neutral-500">Territorio:</span> {row.territorio_individual}
                      </p>
                    </td>
                    <td className="px-3 py-3">{row.no_empleado ?? "—"}</td>
                    <td className="px-3 py-3">{row.base_incentivos !== undefined ? formatCurrency(row.base_incentivos) : "—"}</td>
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
      </div>

      <div className="mt-5 space-y-3 xl:hidden">
        {filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 p-4 text-center text-sm text-neutral-500">
            No hay registros para los filtros seleccionados
          </div>
        ) : (
          filteredRows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{row.nombre_completo}</p>
                  <p className="text-xs text-neutral-600">{row.correo_electronico ?? "—"}</p>
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
                <p>No. empleado: {row.no_empleado ?? "—"}</p>
                <p>Manager: {row.nombre_manager ?? row.territorio_padre}</p>
                <p>Team: {row.team_id}</p>
                <p>Territorio: {row.territorio_individual}</p>
                <p>Base incentivos: {formatCurrency(row.base_incentivos)}</p>
                <p>Estado: {row.is_active ? "Activo" : "Inactivo"}</p>
              </div>
            </article>
          ))
        )}
      </div>

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-neutral-950">
                  {mode === "create" ? "Agregar miembro" : "Editar miembro"}
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  {mode === "create"
                    ? "Completa los campos para crear un nuevo registro manual."
                    : "Actualiza la información del registro seleccionado."}
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
              <input type="hidden" name="status_id" value={selectedRow?.id ?? ""} />
              <input type="hidden" name="period_month" value={periodMonth} />

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  name="nombre_completo"
                  label="Nombre completo"
                  defaultValue={selectedRow?.nombre_completo}
                  required
                />
                <Field
                  name="no_empleado"
                  label="No. empleado"
                  type="number"
                  defaultValue={selectedRow?.no_empleado ? String(selectedRow.no_empleado) : ""}
                />
                <Field
                  name="correo_electronico"
                  label="Correo electrónico"
                  type="email"
                  defaultValue={selectedRow?.correo_electronico ?? ""}
                />
                <SelectWithCustom
                  name="linea_principal"
                  label="Línea principal"
                  options={modalOptionSets.linea_principal}
                  defaultValue={selectedRow?.linea_principal ?? ""}
                  required
                />
                <SelectWithCustom
                  name="parrilla"
                  label="Parrilla"
                  options={modalOptionSets.parrilla}
                  defaultValue={selectedRow?.parrilla ?? ""}
                  required
                />
                <SelectWithCustom
                  name="territorio_padre"
                  label="Territorio padre"
                  options={modalOptionSets.territorio_padre}
                  defaultValue={selectedRow?.territorio_padre ?? ""}
                  required
                />
                <SelectWithCustom
                  name="territorio_individual"
                  label="Territorio individual"
                  options={modalOptionSets.territorio_individual}
                  defaultValue={selectedRow?.territorio_individual ?? ""}
                  required
                />
                <SelectWithCustom
                  name="puesto"
                  label="Puesto"
                  options={modalOptionSets.puesto}
                  defaultValue={selectedRow?.puesto ?? ""}
                  required
                />
                <SelectWithCustom
                  name="team_id"
                  label="Team ID"
                  options={modalOptionSets.team_id}
                  defaultValue={selectedRow?.team_id ?? ""}
                  required
                />
                <Field
                  name="base_incentivos"
                  label="Base incentivos"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={selectedRow ? String(selectedRow.base_incentivos) : ""}
                  required
                />
                <SelectWithCustom
                  name="ciudad"
                  label="Ciudad"
                  options={modalOptionSets.ciudad}
                  defaultValue={selectedRow?.ciudad ?? ""}
                />
                <Field
                  name="fecha_ingreso"
                  label="Fecha ingreso"
                  type="date"
                  defaultValue={selectedRow?.fecha_ingreso ?? ""}
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
                  {isPending ? "Guardando..." : mode === "create" ? "Crear registro" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({
  name,
  label,
  defaultValue = "",
  type = "text",
  required = false,
  step,
  min,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  step?: string;
  min?: string;
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
        step={step}
        min={min}
        className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
      />
    </div>
  );
}

function SelectWithCustom({
  name,
  label,
  options,
  defaultValue = "",
  required = false,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
}) {
  const hasDefaultInOptions = options.includes(defaultValue);
  const [selectValue, setSelectValue] = useState<string>(
    defaultValue
      ? hasDefaultInOptions
        ? defaultValue
        : CUSTOM_OPTION_VALUE
      : "",
  );
  const [customValue, setCustomValue] = useState<string>(
    defaultValue && !hasDefaultInOptions ? defaultValue : "",
  );

  const submittedValue = selectValue === CUSTOM_OPTION_VALUE ? customValue : selectValue;

  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </label>

      <input type="hidden" name={name} value={submittedValue} />

      <select
        value={selectValue}
        onChange={(event) => setSelectValue(event.target.value)}
        required={required && !submittedValue}
        className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
      >
        <option value="">Selecciona una opción</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={CUSTOM_OPTION_VALUE}>+ Agregar nuevo</option>
      </select>

      {selectValue === CUSTOM_OPTION_VALUE ? (
        <input
          type="text"
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
          placeholder="Escribe el nuevo valor"
          className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
        />
      ) : null}
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
