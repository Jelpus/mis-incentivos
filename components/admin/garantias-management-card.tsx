"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createGarantiaAction,
  deleteGarantiaAction,
  setGarantiaActiveAction,
  uploadGarantiasBatchAction,
  updateGarantiaAction,
} from "@/app/admin/garantias/actions";
import {
  formatPeriodMonthForInput,
  formatPeriodMonthLabel,
} from "@/lib/admin/incentive-rules/shared";

type GarantiaRow = {
  id: string;
  guarantee_start_month: string;
  guarantee_end_month: string;
  scope_type: "linea" | "team_id" | "representante";
  scope_value: string;
  scope_label: string | null;
  rule_scope: "all_rules" | "single_rule";
  rule_key: string | null;
  target_coverage: number;
  guarantee_payment_preference: "max_pay" | "prefer_real" | "prefer_guaranteed";
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  periodMonth: string;
  availablePeriods: string[];
  rows: GarantiaRow[];
  options: {
    lineas: string[];
    teamIds: string[];
    representatives: Array<{ value: string; label: string }>;
    rules: string[];
    rulesMessage: string | null;
  };
};

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type UploadBatchState =
  | {
      ok: true;
      message: string;
      processedRows: number;
      createdRows: number;
      duplicatedRows: number;
      invalidRows: number;
      sampleErrors: string[];
    }
  | {
      ok: false;
      message: string;
      sampleErrors?: string[];
    }
  | null;

function getScopeTypeLabel(scopeType: GarantiaRow["scope_type"]) {
  if (scopeType === "linea") return "Linea";
  if (scopeType === "team_id") return "Team ID";
  return "Representante";
}

function getPaymentPreferenceLabel(
  preference: GarantiaRow["guarantee_payment_preference"],
) {
  if (preference === "prefer_real") return "Preferir pago real";
  if (preference === "prefer_guaranteed") return "Preferir pago garantizado";
  return "Respetar pago mas alto";
}

export function GarantiasManagementCard({ periodMonth, availablePeriods, rows, options }: Props) {
  const router = useRouter();
  const [createState, createFormAction, createPending] =
    useActionState<ActionState, FormData>(createGarantiaAction, null);
  const [toggleState, toggleFormAction, togglePending] =
    useActionState<ActionState, FormData>(setGarantiaActiveAction, null);
  const [updateState, updateFormAction, updatePending] =
    useActionState<ActionState, FormData>(updateGarantiaAction, null);
  const [deleteState, deleteFormAction, deletePending] =
    useActionState<ActionState, FormData>(deleteGarantiaAction, null);
  const [uploadState, uploadFormAction, uploadPending] =
    useActionState<UploadBatchState, FormData>(uploadGarantiasBatchAction, null);

  const [scopeType, setScopeType] = useState<GarantiaRow["scope_type"]>("linea");
  const [scopeValue, setScopeValue] = useState("");
  const [scopeLabel, setScopeLabel] = useState("");
  const [ruleScope, setRuleScope] = useState<GarantiaRow["rule_scope"]>("all_rules");
  const [selectedRuleKeys, setSelectedRuleKeys] = useState<string[]>([]);
  const [dynamicRules, setDynamicRules] = useState<string[]>(options.rules);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [note, setNote] = useState("");
  const [targetCoverage, setTargetCoverage] = useState("100");
  const [guaranteePaymentPreference, setGuaranteePaymentPreference] =
    useState<GarantiaRow["guarantee_payment_preference"]>("max_pay");
  const [guaranteeStartMonth, setGuaranteeStartMonth] = useState(formatPeriodMonthForInput(periodMonth));
  const [guaranteeEndMonth, setGuaranteeEndMonth] = useState(formatPeriodMonthForInput(periodMonth));
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState(formatPeriodMonthForInput(periodMonth));
  const [editingRow, setEditingRow] = useState<GarantiaRow | null>(null);
  const [editScopeType, setEditScopeType] = useState<GarantiaRow["scope_type"]>("linea");
  const [editScopeValue, setEditScopeValue] = useState("");
  const [editScopeLabel, setEditScopeLabel] = useState("");
  const [editRuleScope, setEditRuleScope] = useState<GarantiaRow["rule_scope"]>("all_rules");
  const [editSelectedRuleKeys, setEditSelectedRuleKeys] = useState<string[]>([]);
  const [editDynamicRules, setEditDynamicRules] = useState<string[]>([]);
  const [editRulesLoading, setEditRulesLoading] = useState(false);
  const [editStartMonth, setEditStartMonth] = useState(formatPeriodMonthForInput(periodMonth));
  const [editEndMonth, setEditEndMonth] = useState(formatPeriodMonthForInput(periodMonth));
  const [editTargetCoverage, setEditTargetCoverage] = useState("100");
  const [editGuaranteePaymentPreference, setEditGuaranteePaymentPreference] =
    useState<GarantiaRow["guarantee_payment_preference"]>("max_pay");
  const [editNote, setEditNote] = useState("");
  const periodOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        availablePeriods
          .map((period) => formatPeriodMonthForInput(period))
          .filter((period) => period.length > 0),
      ),
    );
    if (!unique.length) return [formatPeriodMonthForInput(periodMonth)];
    return unique;
  }, [availablePeriods, periodMonth]);

  useEffect(() => {
    if (!periodOptions.includes(periodFilter)) {
      setPeriodFilter(periodOptions[0]);
    }
  }, [periodFilter, periodOptions]);

  useEffect(() => {
    if (createState?.ok || toggleState?.ok || updateState?.ok || deleteState?.ok) {
      if (updateState?.ok) {
        setEditingRow(null);
      }
      router.refresh();
    }
  }, [createState, toggleState, updateState, deleteState, router]);

  const scopeOptions = useMemo(() => {
    if (scopeType === "linea") {
      return options.lineas.map((value) => ({ value, label: value }));
    }
    if (scopeType === "team_id") {
      return options.teamIds.map((value) => ({ value, label: value }));
    }
    return options.representatives;
  }, [options.lineas, options.representatives, options.teamIds, scopeType]);

  const editScopeOptions = useMemo(() => {
    if (editScopeType === "linea") {
      return options.lineas.map((value) => ({ value, label: value }));
    }
    if (editScopeType === "team_id") {
      return options.teamIds.map((value) => ({ value, label: value }));
    }
    return options.representatives;
  }, [editScopeType, options.lineas, options.representatives, options.teamIds]);

  useEffect(() => {
    if (ruleScope !== "single_rule") return;
    if (!scopeValue) {
      setDynamicRules([]);
      setSelectedRuleKeys([]);
      return;
    }

    let active = true;
    const run = async () => {
      setRulesLoading(true);
      try {
        const periodForQuery = formatPeriodMonthForInput(periodMonth);
        const query = new URLSearchParams({
          period: periodForQuery,
          scopeType,
          scopeValue,
        });
        const response = await fetch(`/api/admin/garantias/rules-options?${query.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { data?: { rules?: string[] } };
        if (!active) return;
        const nextRules = payload.data?.rules ?? [];
        setDynamicRules(nextRules);
        setSelectedRuleKeys((prev) => prev.filter((rule) => nextRules.includes(rule)));
      } catch {
        if (!active) return;
        setDynamicRules([]);
        setSelectedRuleKeys([]);
      } finally {
        if (active) setRulesLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [periodMonth, ruleScope, scopeType, scopeValue]);

  useEffect(() => {
    if (editRuleScope !== "single_rule") return;
    if (!editScopeValue) {
      setEditDynamicRules([]);
      setEditSelectedRuleKeys([]);
      return;
    }

    let active = true;
    const run = async () => {
      setEditRulesLoading(true);
      try {
        const periodForQuery = formatPeriodMonthForInput(periodMonth);
        const query = new URLSearchParams({
          period: periodForQuery,
          scopeType: editScopeType,
          scopeValue: editScopeValue,
        });
        const response = await fetch(`/api/admin/garantias/rules-options?${query.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { data?: { rules?: string[] } };
        if (!active) return;
        const nextRules = payload.data?.rules ?? [];
        setEditDynamicRules(nextRules);
        setEditSelectedRuleKeys((prev) => {
          const valid = prev.filter((rule) => nextRules.includes(rule));
          if (valid.length) return valid;
          return prev.length ? [] : prev;
        });
      } catch {
        if (!active) return;
        setEditDynamicRules([]);
      } finally {
        if (active) setEditRulesLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [editRuleScope, editScopeType, editScopeValue, periodMonth]);

  function openEdit(row: GarantiaRow) {
    setEditingRow(row);
    setEditScopeType(row.scope_type);
    setEditScopeValue(row.scope_value);
    setEditScopeLabel(row.scope_label ?? row.scope_value);
    setEditRuleScope(row.rule_scope);
    setEditSelectedRuleKeys(row.rule_key ? [row.rule_key] : []);
    setEditDynamicRules(options.rules);
    setEditStartMonth(formatPeriodMonthForInput(row.guarantee_start_month));
    setEditEndMonth(formatPeriodMonthForInput(row.guarantee_end_month));
    setEditTargetCoverage(String(row.target_coverage ?? 100));
    setEditGuaranteePaymentPreference(row.guarantee_payment_preference ?? "max_pay");
    setEditNote(row.note ?? "");
  }

  const periodFilterMonth = useMemo(() => {
    if (/^\d{4}-\d{2}$/.test(periodFilter)) return `${periodFilter}-01`;
    return periodFilter;
  }, [periodFilter]);

  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return rows.filter((row) => {
      const inPeriod =
        row.guarantee_start_month <= periodFilterMonth &&
        row.guarantee_end_month >= periodFilterMonth;
      if (!inPeriod) return false;

      if (!normalized) return true;

      const content = `${row.guarantee_start_month} ${row.guarantee_end_month} ${row.scope_type} ${row.scope_value} ${row.scope_label ?? ""} ${row.rule_scope} ${row.rule_key ?? ""} ${row.target_coverage} ${row.guarantee_payment_preference} ${row.note ?? ""}`.toLowerCase();
      return content.includes(normalized);
    });
  }, [rows, search, periodFilterMonth]);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-neutral-950">Gestion de garantias</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Define cobertura minima por alcance (default 100%) y vigencia.
        </p>
      </div>

      <form action={createFormAction} className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Inicio garantia
            </label>
            <input
              name="guarantee_start_month"
              type="month"
              value={guaranteeStartMonth}
              onChange={(event) => setGuaranteeStartMonth(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Fin garantia
            </label>
            <input
              name="guarantee_end_month"
              type="month"
              value={guaranteeEndMonth}
              onChange={(event) => setGuaranteeEndMonth(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Alcance
            </label>
            <select
              name="scope_type"
              value={scopeType}
              onChange={(event) => {
                const next = event.target.value as GarantiaRow["scope_type"];
                setScopeType(next);
                setScopeValue("");
                setScopeLabel("");
                setSelectedRuleKeys([]);
              }}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="linea">Linea</option>
              <option value="team_id">Team ID</option>
              <option value="representante">Representante</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Valor alcance
            </label>
            <select
              name="scope_value"
              value={scopeValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setScopeValue(nextValue);
                const selected = scopeOptions.find((option) => option.value === nextValue);
                setScopeLabel(selected?.label ?? nextValue);
                setSelectedRuleKeys([]);
              }}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
              required
            >
              <option value="">Selecciona...</option>
              {scopeOptions.map((option) => (
                <option key={`${scopeType}-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input type="hidden" name="scope_label" value={scopeLabel} />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Nivel de regla
            </label>
            <select
              name="rule_scope"
              value={ruleScope}
              onChange={(event) => {
                const next = event.target.value as GarantiaRow["rule_scope"];
                setRuleScope(next);
                setSelectedRuleKeys([]);
              }}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="all_rules">Todo el plan</option>
              <option value="single_rule">Regla puntual</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Regla(s) puntual(es)
            </label>
            <select
              multiple
              disabled={ruleScope !== "single_rule" || rulesLoading}
              value={selectedRuleKeys}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                setSelectedRuleKeys(values);
              }}
              className="mt-1 h-28 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm disabled:bg-neutral-100"
            >
              {dynamicRules.map((rule) => (
                <option key={rule} value={rule}>
                  {rule}
                </option>
              ))}
            </select>
            <input type="hidden" name="rule_keys" value={JSON.stringify(selectedRuleKeys)} />
            <p className="mt-1 text-[11px] text-neutral-500">
              {ruleScope !== "single_rule"
                ? "No aplica cuando el alcance es todo el plan."
                : rulesLoading
                  ? "Cargando reglas disponibles..."
                  : dynamicRules.length
                    ? "Puedes seleccionar multiples reglas (Ctrl/Cmd o seleccion tactil)."
                    : "No hay reglas disponibles para este alcance."}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              % garantia
            </label>
            <input
              name="target_coverage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={targetCoverage}
              onChange={(event) => setTargetCoverage(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Preferencia pago
            </label>
            <select
              name="guarantee_payment_preference"
              value={guaranteePaymentPreference}
              onChange={(event) =>
                setGuaranteePaymentPreference(
                  event.target.value as GarantiaRow["guarantee_payment_preference"],
                )
              }
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="max_pay">Respetar pago mas alto</option>
              <option value="prefer_real">Preferir pago real</option>
              <option value="prefer_guaranteed">Preferir pago garantizado</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Nota
            </label>
            <input
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Motivo / contexto"
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={createPending}
            className="h-10 self-end rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {createPending ? "Guardando..." : "Crear garantia"}
          </button>
        </div>

        {options.rulesMessage ? (
          <p className="mt-2 text-xs text-amber-700">{options.rulesMessage}</p>
        ) : null}

        {createState ? (
          <p className={`mt-2 text-sm ${createState.ok ? "text-emerald-700" : "text-red-700"}`}>
            {createState.message}
          </p>
        ) : null}
      </form>

      <form action={uploadFormAction} className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Carga batch (referencia por no_empleado)</p>
            <p className="mt-1 text-xs text-neutral-600">
              Descarga plantilla, llena filas y sube un archivo Excel/CSV. El sistema resuelve automaticamente el representante segun Status.
            </p>
          </div>
          <a
            href="/templates/garantias_batch_template.csv"
            className="inline-flex h-9 items-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            download
          >
            Descargar plantilla
          </a>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.xls,.csv"
            className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-neutral-800"
          />
          <button
            type="submit"
            disabled={uploadPending}
            className="h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {uploadPending ? "Procesando..." : "Subir batch"}
          </button>
        </div>

        {uploadState ? (
          <div className={`mt-2 text-sm ${uploadState.ok ? "text-emerald-700" : "text-red-700"}`}>
            <p>{uploadState.message}</p>
            {"processedRows" in uploadState ? (
              <p className="mt-1 text-xs text-neutral-600">
                Filas: {uploadState.processedRows} | Creadas: {uploadState.createdRows} | Duplicadas:{" "}
                {uploadState.duplicatedRows} | Invalidas: {uploadState.invalidRows}
              </p>
            ) : null}
            {uploadState.sampleErrors?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {uploadState.sampleErrors.slice(0, 8).map((error, index) => (
                  <li key={`upload-error-${index}`}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <select
          value={periodFilter}
          onChange={(event) => setPeriodFilter(event.target.value)}
          className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
        >
          {periodOptions.map((periodInput) => {
            return (
              <option key={`period-${periodInput}`} value={periodInput}>
                {formatPeriodMonthLabel(periodInput)}
              </option>
            );
          })}
        </select>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, no_empleado, ruta, regla o nota..."
          className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2">Vigencia</th>
              <th className="px-3 py-2">Alcance</th>
              <th className="px-3 py-2">Regla</th>
              <th className="px-3 py-2">Cobertura</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Accion</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                  Sin garantias para este periodo.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-neutral-100 align-top">
                  <td className="px-3 py-2 text-neutral-700">
                    <p>{formatPeriodMonthLabel(row.guarantee_start_month)}</p>
                    <p className="text-xs text-neutral-500">a {formatPeriodMonthLabel(row.guarantee_end_month)}</p>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">
                    <p className="font-medium text-neutral-900">{getScopeTypeLabel(row.scope_type)}</p>
                    <p>{row.scope_label ?? row.scope_value}</p>
                    <p className="text-xs text-neutral-500">{row.scope_value}</p>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">
                    {row.rule_scope === "all_rules" ? "Todo el plan" : row.rule_key ?? "-"}
                    <p className="mt-1 text-xs text-neutral-500">
                      {getPaymentPreferenceLabel(row.guarantee_payment_preference)}
                    </p>
                    {row.note ? <p className="mt-1 text-xs text-neutral-500">{row.note}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{row.target_coverage}%</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {row.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleFormAction}>
                        <input type="hidden" name="garantia_id" value={row.id} />
                        <input type="hidden" name="next_active" value={row.is_active ? "false" : "true"} />
                        <button
                          type="submit"
                          disabled={togglePending}
                          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                        >
                          {row.is_active ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                      >
                        Editar
                      </button>
                      <form action={deleteFormAction}>
                        <input type="hidden" name="garantia_id" value={row.id} />
                        <button
                          type="submit"
                          disabled={deletePending}
                          onClick={(event) => {
                            if (!confirm("Eliminar garantia? Esta accion no se puede deshacer.")) {
                              event.preventDefault();
                            }
                          }}
                          className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {toggleState ? (
        <p className={`mt-3 text-sm ${toggleState.ok ? "text-emerald-700" : "text-red-700"}`}>
          {toggleState.message}
        </p>
      ) : null}
      {deleteState ? (
        <p className={`mt-1 text-sm ${deleteState.ok ? "text-emerald-700" : "text-red-700"}`}>
          {deleteState.message}
        </p>
      ) : null}

      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-neutral-950">Editar garantia</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Ajusta vigencia, alcance y regla de la garantia seleccionada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="rounded-xl border border-neutral-300 px-3 py-1.5 text-sm"
              >
                Cerrar
              </button>
            </div>

            <form action={updateFormAction} className="mt-5 space-y-4">
              <input type="hidden" name="garantia_id" value={editingRow.id} />
              <input type="hidden" name="scope_label" value={editScopeLabel} />
              <input type="hidden" name="rule_keys" value={JSON.stringify(editSelectedRuleKeys)} />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Inicio garantia
                  </label>
                  <input
                    name="guarantee_start_month"
                    type="month"
                    value={editStartMonth}
                    onChange={(event) => setEditStartMonth(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Fin garantia
                  </label>
                  <input
                    name="guarantee_end_month"
                    type="month"
                    value={editEndMonth}
                    onChange={(event) => setEditEndMonth(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Alcance
                  </label>
                  <select
                    name="scope_type"
                    value={editScopeType}
                    onChange={(event) => {
                      const next = event.target.value as GarantiaRow["scope_type"];
                      setEditScopeType(next);
                      setEditScopeValue("");
                      setEditScopeLabel("");
                      setEditSelectedRuleKeys([]);
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                  >
                    <option value="linea">Linea</option>
                    <option value="team_id">Team ID</option>
                    <option value="representante">Representante</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Valor alcance
                  </label>
                  <select
                    name="scope_value"
                    value={editScopeValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setEditScopeValue(nextValue);
                      const selected = editScopeOptions.find((option) => option.value === nextValue);
                      setEditScopeLabel(selected?.label ?? nextValue);
                      setEditSelectedRuleKeys([]);
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                    required
                  >
                    <option value="">Selecciona...</option>
                    {editScopeOptions.map((option) => (
                      <option key={`edit-${editScopeType}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    % garantia
                  </label>
                  <input
                    name="target_coverage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editTargetCoverage}
                    onChange={(event) => setEditTargetCoverage(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Preferencia pago
                  </label>
                  <select
                    name="guarantee_payment_preference"
                    value={editGuaranteePaymentPreference}
                    onChange={(event) =>
                      setEditGuaranteePaymentPreference(
                        event.target.value as GarantiaRow["guarantee_payment_preference"],
                      )
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                  >
                    <option value="max_pay">Respetar pago mas alto</option>
                    <option value="prefer_real">Preferir pago real</option>
                    <option value="prefer_guaranteed">Preferir pago garantizado</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Nivel de regla
                  </label>
                  <select
                    name="rule_scope"
                    value={editRuleScope}
                    onChange={(event) => {
                      const next = event.target.value as GarantiaRow["rule_scope"];
                      setEditRuleScope(next);
                      setEditSelectedRuleKeys([]);
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                  >
                    <option value="all_rules">Todo el plan</option>
                    <option value="single_rule">Regla puntual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Regla puntual
                  </label>
                  <select
                    multiple
                    value={editSelectedRuleKeys}
                    disabled={editRuleScope !== "single_rule" || editRulesLoading}
                    onChange={(event) => {
                      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                      setEditSelectedRuleKeys(values);
                    }}
                    className="mt-1 h-28 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm disabled:bg-neutral-100"
                  >
                    {editDynamicRules.map((rule) => (
                      <option key={`edit-rule-${rule}`} value={rule}>
                        {rule}
                      </option>
                    ))}
                  </select>
                  <input
                    type="hidden"
                    name="rule_key"
                    value={editSelectedRuleKeys[0] ?? editingRow.rule_key ?? ""}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Nota
                </label>
                <input
                  name="note"
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
                />
              </div>

              {updateState ? (
                <p className={`text-sm ${updateState.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {updateState.message}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updatePending}
                  className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {updatePending ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
