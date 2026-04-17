"use client";

import { deleteRankingContestAction, upsertRankingContestAction } from "@/app/admin/reglas-ranking/actions";
import type {
  RankingContestComponentRow,
  RankingContestPrizeRow,
  RankingContestRow,
} from "@/lib/admin/reglas-ranking/get-ranking-contests-data";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import { useActionState, useState } from "react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type ComponentFormValues = {
  name: string;
  threshold: string;
  periodStart: string;
  periodEnd: string;
  isActive: boolean;
};

type ContestFormValues = {
  contestName: string;
  scope: "rep" | "manager";
  participationScope: "all_fdv" | "ranking_groups";
  paymentDate: string;
  coverageStart: string;
  coverageEnd: string;
  isActive: boolean;
  components: ComponentFormValues[];
  prizes: PrizeFormValues[];
};

type PrizeFormValues = {
  placeNo: string;
  title: string;
  amountMxn: string;
  description: string;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function emptyComponent(): ComponentFormValues {
  return { name: "", threshold: "", periodStart: "", periodEnd: "", isActive: true };
}

function emptyPrize(): PrizeFormValues {
  return { placeNo: "", title: "", amountMxn: "", description: "" };
}

const EMPTY_CONTEST_FORM: ContestFormValues = {
  contestName: "",
  scope: "rep",
  participationScope: "ranking_groups",
  paymentDate: "",
  coverageStart: "",
  coverageEnd: "",
  isActive: true,
  components: [emptyComponent()],
  prizes: [emptyPrize()],
};

function mapComponent(c: RankingContestComponentRow): ComponentFormValues {
  return { name: c.name, threshold: c.threshold, periodStart: c.periodStart, periodEnd: c.periodEnd, isActive: c.isActive };
}

function mapPrize(p: RankingContestPrizeRow): PrizeFormValues {
  return { placeNo: String(p.placeNo || ""), title: p.title, amountMxn: p.amountMxn, description: p.description };
}

function mapContest(c: RankingContestRow): ContestFormValues {
  return {
    contestName: c.contestName,
    scope: c.scope,
    participationScope: c.participationScope,
    paymentDate: c.paymentDate,
    coverageStart: c.coveragePeriodStart,
    coverageEnd: c.coveragePeriodEnd,
    isActive: c.isActive,
    components: c.components.length > 0 ? c.components.map(mapComponent) : [emptyComponent()],
    prizes: c.prizes.length > 0 ? c.prizes.map(mapPrize) : [emptyPrize()],
  };
}

function formatMonth(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return formatPeriodMonthLabel(raw);
}

function prizeEmoji(place: string | number): string {
  const n = Number(place);
  if (n === 1) return "🥇";
  if (n === 2) return "🥈";
  if (n === 3) return "🥉";
  return `#${place}`;
}

// ─────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-neutral-100 text-neutral-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-neutral-400"}`}
      />
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function ScopeChip({ scope }: { scope: "rep" | "manager" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
      {scope === "manager" ? (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )}
      {scope === "manager" ? "Manager" : "Rep"}
    </span>
  );
}

function ParticipationChip({ scope }: { scope: "all_fdv" | "ranking_groups" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      {scope === "all_fdv" ? "Todos FDV" : "Grupos ranking"}
    </span>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          checked ? "bg-indigo-600" : "bg-neutral-300"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-xs font-medium text-neutral-700">{label}</span>
    </label>
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

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
        {icon}
      </span>
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">{children}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition placeholder:text-neutral-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 hover:border-neutral-300";

const selectCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 hover:border-neutral-300 appearance-none cursor-pointer";

// ─────────────────────────────────────────────
// ComponentsEditor
// ─────────────────────────────────────────────

function ComponentsEditor({
  values,
  onChange,
  onAdd,
  onRemove,
}: {
  values: ComponentFormValues[];
  onChange: (index: number, key: keyof ComponentFormValues, value: string | boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel
          icon={
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
            </svg>
          }
        >
          Componentes
        </SectionLabel>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 active:scale-95"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Agregar componente
        </button>
      </div>

      {values.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-200 py-4 text-center text-xs text-neutral-400">
          Sin componentes. Agrega uno para comenzar.
        </p>
      )}

      {values.map((component, index) => (
        <div
          key={`component-${index}`}
          className="group relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
        >
          {/* Number badge */}
          <span className="absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow">
            {index + 1}
          </span>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <FieldLabel>Nombre del componente</FieldLabel>
              <input
                name="component_name[]"
                value={component.name}
                onChange={(e) => onChange(index, "name", e.target.value)}
                placeholder={`Componente ${index + 1}`}
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Umbral</FieldLabel>
              <input
                name="component_threshold[]"
                type="number"
                step="0.01"
                value={component.threshold}
                onChange={(e) => onChange(index, "threshold", e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Inicio período</FieldLabel>
              <input
                name="component_start[]"
                type="month"
                value={component.periodStart}
                onChange={(e) => onChange(index, "periodStart", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Fin período</FieldLabel>
              <input
                name="component_end[]"
                type="month"
                value={component.periodEnd}
                onChange={(e) => onChange(index, "periodEnd", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <ToggleSwitch
              checked={component.isActive}
              onChange={(v) => onChange(index, "isActive", v)}
              label="Componente activo"
            />
            <input type="hidden" name="component_active[]" value={component.isActive ? "true" : "false"} />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 active:scale-95"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// PrizesEditor
// ─────────────────────────────────────────────

function PrizesEditor({
  values,
  onChange,
  onAdd,
  onRemove,
}: {
  values: PrizeFormValues[];
  onChange: (index: number, key: keyof PrizeFormValues, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel
          icon={
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          Premios
        </SectionLabel>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 active:scale-95"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Agregar premio
        </button>
      </div>

      {values.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-200 py-4 text-center text-xs text-neutral-400">
          Sin premios. Agrega uno para comenzar.
        </p>
      )}

      {values.map((prize, index) => (
        <div
          key={`prize-${index}`}
          className="group relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
        >
          {/* Place badge */}
          <span className="absolute -left-2 -top-2 text-lg leading-none">
            {prize.placeNo ? prizeEmoji(prize.placeNo) : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-500">{index + 1}</span>}
          </span>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FieldLabel>Posición</FieldLabel>
              <input
                name="prize_place[]"
                type="number"
                min={1}
                value={prize.placeNo}
                onChange={(e) => onChange(index, "placeNo", e.target.value)}
                placeholder="1"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Título del premio</FieldLabel>
              <input
                name="prize_title[]"
                value={prize.title}
                onChange={(e) => onChange(index, "title", e.target.value)}
                placeholder="Ej. Primer lugar"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Monto MXN</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-neutral-400">
                  $
                </span>
                <input
                  name="prize_amount_mxn[]"
                  type="number"
                  step="0.01"
                  value={prize.amountMxn}
                  onChange={(e) => onChange(index, "amountMxn", e.target.value)}
                  placeholder="0.00"
                  className={`${inputCls} pl-6`}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Descripción</FieldLabel>
              <input
                name="prize_description[]"
                value={prize.description}
                onChange={(e) => onChange(index, "description", e.target.value)}
                placeholder="Descripción breve"
                className={inputCls}
              />
            </div>
          </div>

          {values.length > 1 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 active:scale-95"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// ContestForm (shared between create & edit)
// ─────────────────────────────────────────────

function ContestForm({
  values,
  updateField,
  updateComponent,
  addComponent,
  removeComponent,
  updatePrize,
  addPrize,
  removePrize,
  pending,
  state,
  submitLabel,
  contestId,
}: {
  values: ContestFormValues;
  updateField: (key: keyof ContestFormValues, value: string | boolean) => void;
  updateComponent: (i: number, key: keyof ComponentFormValues, value: string | boolean) => void;
  addComponent: () => void;
  removeComponent: (i: number) => void;
  updatePrize: (i: number, key: keyof PrizeFormValues, value: string) => void;
  addPrize: () => void;
  removePrize: (i: number) => void;
  pending: boolean;
  state: ActionState;
  submitLabel: string;
  contestId?: string | number;
}) {
  return (
    <div className="space-y-6">
      {contestId !== undefined && (
        <input type="hidden" name="contest_id" value={contestId} />
      )}

      {/* Section: Info general */}
      <div className="space-y-3">
        <SectionLabel
          icon={
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          Información general
        </SectionLabel>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <FieldLabel>Nombre del concurso *</FieldLabel>
            <input
              name="contest_name"
              required
              value={values.contestName}
              onChange={(e) => updateField("contestName", e.target.value)}
              placeholder="Ej. Concurso Q1 2025"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>Alcance</FieldLabel>
            <div className="relative">
              <select
                name="scope"
                value={values.scope}
                onChange={(e) => updateField("scope", e.target.value as "rep" | "manager")}
                className={selectCls}
              >
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-neutral-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          </div>
          <div>
            <FieldLabel>Participación FDV</FieldLabel>
            <div className="relative">
              <select
                name="participation_scope"
                value={values.participationScope}
                onChange={(e) => updateField("participationScope", e.target.value as "all_fdv" | "ranking_groups")}
                className={selectCls}
              >
                <option value="all_fdv">Todos</option>
                <option value="ranking_groups">Por grupos ranking</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-neutral-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100" />

      {/* Section: Cobertura y pago */}
      <div className="space-y-3">
        <SectionLabel
          icon={
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        >
          Cobertura y pago
        </SectionLabel>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel>Inicio cobertura</FieldLabel>
            <input
              name="coverage_period_start"
              type="month"
              value={values.coverageStart}
              onChange={(e) => updateField("coverageStart", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>Fin cobertura</FieldLabel>
            <input
              name="coverage_period_end"
              type="month"
              value={values.coverageEnd}
              onChange={(e) => updateField("coverageEnd", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>Fecha de pago</FieldLabel>
            <input
              name="payment_date"
              type="month"
              value={values.paymentDate}
              onChange={(e) => updateField("paymentDate", e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-end pb-2">
            <ToggleSwitch
              checked={values.isActive}
              onChange={(v) => updateField("isActive", v)}
              label="Concurso activo"
            />
            <input type="hidden" name="is_active" value={values.isActive ? "true" : "false"} />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100" />

      {/* Components */}
      <ComponentsEditor
        values={values.components}
        onChange={updateComponent}
        onAdd={addComponent}
        onRemove={removeComponent}
      />

      {/* Divider */}
      <div className="border-t border-neutral-100" />

      {/* Prizes */}
      <PrizesEditor
        values={values.prizes}
        onChange={updatePrize}
        onAdd={addPrize}
        onRemove={removePrize}
      />

      {/* Submit row */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Guardando...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {submitLabel}
            </>
          )}
        </button>
        <FeedbackBanner state={state} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ContestDetails (read-only view)
// ─────────────────────────────────────────────

function ContestDetails({ contest }: { contest: RankingContestRow }) {
  return (
    <div className="mt-4 space-y-5">
      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          {
            label: "Alcance",
            value: <ScopeChip scope={contest.scope} />,
          },
          {
            label: "Participación",
            value: <ParticipationChip scope={contest.participationScope} />,
          },
          {
            label: "Estado",
            value: <Badge active={contest.isActive} />,
          },
          {
            label: "Cobertura",
            value: (
              <span className="text-xs font-medium text-neutral-700">
                {formatMonth(contest.coveragePeriodStart)} → {formatMonth(contest.coveragePeriodEnd)}
              </span>
            ),
          },
          {
            label: "Fecha de pago",
            value: <span className="text-xs font-medium text-neutral-700">{formatMonth(contest.paymentDate)}</span>,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{item.label}</p>
            <div>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Components table */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
          Componentes ({contest.components.length})
        </p>
        {contest.components.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 py-3 text-center text-xs text-neutral-400">
            Sin componentes configurados.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">#</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Nombre</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Umbral</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Período</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {contest.components.map((c, i) => (
                  <tr key={c.id} className="transition hover:bg-neutral-50">
                    <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-neutral-800">{c.name || "—"}</td>
                    <td className="px-3 py-2 text-neutral-600">{c.threshold || "—"}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {formatMonth(c.periodStart)} → {formatMonth(c.periodEnd)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge active={c.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prizes table */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
          Premios ({contest.prizes.length})
        </p>
        {contest.prizes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 py-3 text-center text-xs text-neutral-400">
            Sin premios configurados.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Pos.</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Título</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Monto MXN</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-neutral-400">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {contest.prizes.map((p) => (
                  <tr key={p.id} className="transition hover:bg-neutral-50">
                    <td className="px-3 py-2 text-base">{prizeEmoji(p.placeNo)}</td>
                    <td className="px-3 py-2 font-medium text-neutral-800">{p.title || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">
                      {p.amountMxn ? `$${Number(p.amountMxn).toLocaleString("es-MX")} MXN` : "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{p.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ContestItem
// ─────────────────────────────────────────────

function ContestItem({ contest }: { contest: RankingContestRow }) {
  const [showDetails, setShowDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ContestFormValues>(() => mapContest(contest));

  const [saveState, saveAction, savePending] = useActionState<ActionState, FormData>(upsertRankingContestAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(deleteRankingContestAction, null);

  function updateField(key: keyof ContestFormValues, value: string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value } as ContestFormValues));
  }
  function updateComponent(index: number, key: keyof ComponentFormValues, value: string | boolean) {
    setValues((prev) => {
      const next = [...prev.components];
      next[index] = { ...(next[index] ?? emptyComponent()), [key]: value } as ComponentFormValues;
      return { ...prev, components: next };
    });
  }
  function addComponent() {
    setValues((prev) => ({ ...prev, components: [...prev.components, emptyComponent()] }));
  }
  function removeComponent(index: number) {
    setValues((prev) => {
      const next = prev.components.filter((_, i) => i !== index);
      return { ...prev, components: next.length > 0 ? next : [emptyComponent()] };
    });
  }
  function updatePrize(index: number, key: keyof PrizeFormValues, value: string) {
    setValues((prev) => {
      const next = [...prev.prizes];
      next[index] = { ...(next[index] ?? emptyPrize()), [key]: value } as PrizeFormValues;
      return { ...prev, prizes: next };
    });
  }
  function addPrize() {
    setValues((prev) => ({ ...prev, prizes: [...prev.prizes, emptyPrize()] }));
  }
  function removePrize(index: number) {
    setValues((prev) => {
      const next = prev.prizes.filter((_, i) => i !== index);
      return { ...prev, prizes: next.length > 0 ? next : [emptyPrize()] };
    });
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Icon */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-neutral-950">{contest.contestName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ScopeChip scope={contest.scope} />
              <ParticipationChip scope={contest.participationScope} />
              <Badge active={contest.isActive} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowDetails((prev) => !prev);
              if (editing) setEditing(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95"
          >
            {showDetails ? (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                Ocultar
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Ver detalles
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowDetails(true);
              setEditing((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95 ${
              editing
                ? "border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            {editing ? (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancelar
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </>
            )}
          </button>

          <form action={deleteAction}>
            <input type="hidden" name="contest_id" value={contest.id} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`¿Eliminar el concurso "${contest.contestName}"? Esta acción no se puede deshacer.`)) {
                  e.preventDefault();
                }
              }}
              disabled={deletePending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletePending ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Eliminando...
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Eliminar
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Delete feedback */}
      {deleteState && (
        <div className="border-t border-neutral-100 px-5 py-2">
          <FeedbackBanner state={deleteState} />
        </div>
      )}

      {/* Details panel */}
      {showDetails && (
        <div className="border-t border-neutral-100 px-5 pb-5">
          {!editing ? (
            <ContestDetails contest={contest} />
          ) : (
            <div className="mt-4">
              <form action={saveAction} className="space-y-0">
                <ContestForm
                  values={values}
                  updateField={updateField}
                  updateComponent={updateComponent}
                  addComponent={addComponent}
                  removeComponent={removeComponent}
                  updatePrize={updatePrize}
                  addPrize={addPrize}
                  removePrize={removePrize}
                  pending={savePending}
                  state={saveState}
                  submitLabel="Guardar cambios"
                  contestId={contest.id}
                />
              </form>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────
// RankingContestsCard (main export)
// ─────────────────────────────────────────────

export function RankingContestsCard({
  contestsStorageReady,
  contestsStorageMessage,
  contests,
}: {
  contestsStorageReady: boolean;
  contestsStorageMessage: string | null;
  contests: RankingContestRow[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [values, setValues] = useState<ContestFormValues>(EMPTY_CONTEST_FORM);
  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(upsertRankingContestAction, null);

  function updateField(key: keyof ContestFormValues, value: string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value } as ContestFormValues));
  }
  function updateComponent(index: number, key: keyof ComponentFormValues, value: string | boolean) {
    setValues((prev) => {
      const next = [...prev.components];
      next[index] = { ...(next[index] ?? emptyComponent()), [key]: value } as ComponentFormValues;
      return { ...prev, components: next };
    });
  }
  function addComponent() {
    setValues((prev) => ({ ...prev, components: [...prev.components, emptyComponent()] }));
  }
  function removeComponent(index: number) {
    setValues((prev) => {
      const next = prev.components.filter((_, i) => i !== index);
      return { ...prev, components: next.length > 0 ? next : [emptyComponent()] };
    });
  }
  function updatePrize(index: number, key: keyof PrizeFormValues, value: string) {
    setValues((prev) => {
      const next = [...prev.prizes];
      next[index] = { ...(next[index] ?? emptyPrize()), [key]: value } as PrizeFormValues;
      return { ...prev, prizes: next };
    });
  }
  function addPrize() {
    setValues((prev) => ({ ...prev, prizes: [...prev.prizes, emptyPrize()] }));
  }
  function removePrize(index: number) {
    setValues((prev) => {
      const next = prev.prizes.filter((_, i) => i !== index);
      return { ...prev, prizes: next.length > 0 ? next : [emptyPrize()] };
    });
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-950">Concursos Ranking</h2>
            <p className="text-xs text-neutral-500">
              Gestiona concursos, componentes y premios.{" "}
              <span className="font-semibold text-neutral-700">{contests.length} concurso{contests.length !== 1 ? "s" : ""}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate((prev) => !prev)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-95 ${
            showCreate
              ? "border border-neutral-200 bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              : "bg-neutral-950 text-white hover:bg-neutral-800"
          }`}
        >
          {showCreate ? (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancelar
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nuevo concurso
            </>
          )}
        </button>
      </div>

      {/* Storage warning */}
      {!contestsStorageReady && contestsStorageMessage && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-800">{contestsStorageMessage}</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-neutral-100 px-6 py-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
            <h3 className="text-sm font-bold text-neutral-900">Crear nuevo concurso</h3>
          </div>
          <form action={createAction}>
            <ContestForm
              values={values}
              updateField={updateField}
              updateComponent={updateComponent}
              addComponent={addComponent}
              removeComponent={removeComponent}
              updatePrize={updatePrize}
              addPrize={addPrize}
              removePrize={removePrize}
              pending={createPending}
              state={createState}
              submitLabel="Crear concurso"
            />
          </form>
        </div>
      )}

      {/* Contests list */}
      <div className="px-6 py-5">
        {contests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-neutral-600">Sin concursos registrados</p>
            <p className="mt-1 text-xs text-neutral-400">Crea tu primer concurso usando el botón de arriba.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contests.map((contest) => (
              <ContestItem key={contest.id} contest={contest} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
