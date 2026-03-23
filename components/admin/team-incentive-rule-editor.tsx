"use client";

import { saveTeamIncentiveRuleVersionAction } from "@/app/admin/incentive-rules/actions";
import { TEAM_RULE_REFERENCE_VALUES } from "@/lib/admin/incentive-rules/rule-catalog";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────────────────────────────────────── */

type Props = {
  teamId: string;
  periodMonthInput: string; // YYYY-MM
  defaultRuleDefinition: string;
  focusRuleId?: string | null;
  payCurveOptions: Array<{ id: string; name: string; code?: string | null }>;
};

type ActionState =
  | { ok: true; message: string; versionNo: number }
  | { ok: false; message: string }
  | null;

type InfoSourceBlock = {
  id: string;
  file: string;
  fuente: string;
  molecula_producto: string;
  metric: string;
};

type IncentiveRuleRow = {
  id: string;
  product_name: string;
  plan_type_name: string;
  candado: string;
  cobertura_candado: string;
  distribucion_no_asignada: boolean;
  prod_weight: string;
  calcular_en_valores: boolean;
  precio_promedio: string;
  agrupador: string;
  curva_pago: string;
  elemento: string;
  sources: InfoSourceBlock[];
};

type InitialModel = {
  modelName: string;
  description: string;
  rules: IncentiveRuleRow[];
};

type SelectOrCustomProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  helpText?: string;
  icon?: React.ReactNode;
};

/* ──────────────────────────────────────────────────────────────────────────────
   ICONS (inline SVG components for zero-dependency usage)
   ────────────────────────────────────────────────────────────────────────────── */

function IconChevronDown({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

function IconChevronUp({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M14.78 11.78a.75.75 0 0 1-1.06 0L10 8.06l-3.72 3.72a.75.75 0 1 1-1.06-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
    </svg>
  );
}

function IconPlus({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

function IconTrash({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.8l-.5 5.5a.75.75 0 0 1-1.49-.14l.5-5.5a.75.75 0 0 1 .79-.66Zm2.84 0a.75.75 0 0 1 .79.66l.5 5.5a.75.75 0 1 1-1.49.14l-.5-5.5a.75.75 0 0 1 .7-.8Z" clipRule="evenodd" />
    </svg>
  );
}

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}

function IconWarning({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

function IconSave({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M13.75 7h-3v5.296l1.943-2.048a.75.75 0 0 1 1.114 1.004l-3.25 3.5a.75.75 0 0 1-1.114 0l-3.25-3.5a.75.75 0 1 1 1.114-1.004l1.943 2.048V7h1.5V1.75a.75.75 0 0 0-1.5 0V7h-3A2.25 2.25 0 0 0 4 9.25v7.5A2.25 2.25 0 0 0 6.25 19h7.5A2.25 2.25 0 0 0 16 16.75v-7.5A2.25 2.25 0 0 0 13.75 7Z" />
    </svg>
  );
}

function IconInfo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
    </svg>
  );
}

function IconDatabase({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 1c-1.716 0-3.408.106-5.07.31C3.806 1.45 3 2.414 3 3.517V16.75A2.25 2.25 0 0 0 5.25 19h9.5A2.25 2.25 0 0 0 17 16.75V3.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0 0 10 1ZM5.99 8.75A.75.75 0 0 1 6.74 8h.01a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-.75.75h-.01a.75.75 0 0 1-.75-.75v-.01Zm.75 1.417a.75.75 0 0 0-.75.75v.01c0 .414.336.75.75.75h.01a.75.75 0 0 0 .75-.75v-.01a.75.75 0 0 0-.75-.75h-.01Zm-.75 2.916a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-.75.75h-.01a.75.75 0 0 1-.75-.75v-.01Zm2.583-4.333a.75.75 0 0 0 0 1.5h4.834a.75.75 0 0 0 0-1.5H8.573Zm0 2.167a.75.75 0 0 0 0 1.5h4.834a.75.75 0 0 0 0-1.5H8.573Zm0 2.166a.75.75 0 0 0 0 1.5h4.834a.75.75 0 0 0 0-1.5H8.573Z" clipRule="evenodd" />
    </svg>
  );
}

function IconClipboard({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0 1 14.75 19h-9.5A2.25 2.25 0 0 1 3 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 0 1 9 1h2c1.373 0 2.531.923 2.887 2.182ZM7.5 4A1.5 1.5 0 0 1 9 2.5h2A1.5 1.5 0 0 1 12.5 4v.5h-5V4Z" clipRule="evenodd" />
    </svg>
  );
}

function IconSparkles({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────────────────────────── */

function getId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createEmptySource(): InfoSourceBlock {
  return {
    id: getId("src"),
    file: "",
    fuente: "",
    molecula_producto: "",
    metric: "",
  };
}

function createEmptyRule(): IncentiveRuleRow {
  return {
    id: getId("rule"),
    product_name: "",
    plan_type_name: "",
    candado: "",
    cobertura_candado: "",
    distribucion_no_asignada: false,
    prod_weight: "",
    calcular_en_valores: false,
    precio_promedio: "",
    agrupador: "",
    curva_pago: "",
    elemento: "",
    sources: [createEmptySource()],
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = normalizeText(value).toLowerCase();
  return raw === "true" || raw === "1" || raw === "si" || raw === "yes";
}

function splitMultiValue(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\/,;|]+/g)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function toggleMultiValue(currentValue: string, option: string): string {
  const current = splitMultiValue(currentValue);
  const alreadySelected = current.some(
    (item) => item.toLowerCase() === option.toLowerCase(),
  );

  if (alreadySelected) {
    return current
      .filter((item) => item.toLowerCase() !== option.toLowerCase())
      .join("/");
  }

  return [...current, option].join("/");
}

function hasSourceData(source: InfoSourceBlock): boolean {
  return (
    source.file.trim().length > 0 ||
    source.fuente.trim().length > 0 ||
    source.molecula_producto.trim().length > 0 ||
    source.metric.trim().length > 0
  );
}

function toSourceFromLegacy(row: Record<string, unknown>, index: number): InfoSourceBlock {
  return {
    id: getId(`src${index}`),
    file: normalizeText(row[`file${index}`]),
    fuente: normalizeText(row[`fuente${index}`]),
    molecula_producto: normalizeText(row[`molecula_producto${index}`]),
    metric: normalizeText(row[`metric${index}`]),
  };
}

function buildInitialModel(defaultRuleDefinition: string): InitialModel {
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(defaultRuleDefinition) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const meta = (parsed?.meta ?? {}) as Record<string, unknown>;
  const rulesRaw = Array.isArray(parsed?.rules) ? (parsed?.rules as unknown[]) : [];

  const rules = rulesRaw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;

      const row = item as Record<string, unknown>;
      const sourcesFromNew = Array.isArray(row.sources)
        ? row.sources
            .map((source) => {
              if (!source || typeof source !== "object") return null;
              const src = source as Record<string, unknown>;
              return {
                id: getId("src"),
                file: normalizeText(src.file),
                fuente: normalizeText(src.fuente),
                molecula_producto: normalizeText(src.molecula_producto),
                metric: normalizeText(src.metric),
              } as InfoSourceBlock;
            })
            .filter((source): source is InfoSourceBlock => Boolean(source))
        : [];

      const legacySources = [1, 2, 3]
        .map((idx) => toSourceFromLegacy(row, idx))
        .filter(hasSourceData);
      const selectedSources = sourcesFromNew.length > 0 ? sourcesFromNew : legacySources;

      return {
        id:
          normalizeText(row.rule_id) ||
          normalizeText(row.ruleId) ||
          normalizeText(row.id) ||
          `rule-${index + 1}`,
        product_name: normalizeText(row.product_name),
        plan_type_name: normalizeText(row.plan_type_name),
        candado: normalizeText(row.candado),
        cobertura_candado: normalizeText(row.cobertura_candado),
        distribucion_no_asignada: normalizeBoolean(row.distribucion_no_asignada),
        prod_weight: normalizeText(row.prod_weight),
        calcular_en_valores: normalizeBoolean(row.calcular_en_valores),
        precio_promedio: normalizeText(row.precio_promedio),
        agrupador: normalizeText(row.agrupador),
        curva_pago: normalizeText(row.curva_pago_id) || normalizeText(row.curva_pago),
        elemento: normalizeText(row.elemento),
        sources: selectedSources.length > 0 ? selectedSources : [createEmptySource()],
      } as IncentiveRuleRow;
    })
    .filter((rule): rule is IncentiveRuleRow => Boolean(rule));

  return {
    modelName: normalizeText(meta.model_name) || "draft-v1",
    description: normalizeText(meta.description) || "",
    rules: rules.length > 0 ? rules : [createEmptyRule()],
  };
}

/* ──────────────────────────────────────────────────────────────────────────────
   TOAST NOTIFICATION
   ────────────────────────────────────────────────────────────────────────────── */

function Toast({
  message,
  type,
  visible,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  visible: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease-out]">
      <div
        className={`flex items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl backdrop-blur-sm ${
          type === "success"
            ? "border border-emerald-200/50 bg-emerald-50/95 text-emerald-800"
            : "border border-red-200/50 bg-red-50/95 text-red-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            type === "success" ? "bg-emerald-100" : "bg-red-100"
          }`}
        >
          {type === "success" ? (
            <IconCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <IconWarning className="h-4 w-4 text-red-600" />
          )}
        </div>
        <p className="text-sm font-medium">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 rounded-lg p-1 opacity-60 transition hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   CONFIRM DIALOG
   ────────────────────────────────────────────────────────────────────────────── */

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  variant = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md animate-[scaleIn_0.2s_ease-out] rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              variant === "danger" ? "bg-red-100" : "bg-amber-100"
            }`}
          >
            {variant === "danger" ? (
              <IconTrash className="h-5 w-5 text-red-600" />
            ) : (
              <IconWarning className="h-5 w-5 text-amber-600" />
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white transition focus:outline-none focus:ring-2 ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-200"
                : "bg-amber-600 hover:bg-amber-700 focus:ring-amber-200"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   PROGRESS BAR
   ────────────────────────────────────────────────────────────────────────────── */

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isAllDone = completed === total && total > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">
          Progreso de evaluaciones
        </span>
        <span
          className={`text-xs font-bold ${
            isAllDone ? "text-emerald-600" : "text-neutral-700"
          }`}
        >
          {completed} / {total} completadas ({percentage}%)
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isAllDone
              ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : percentage > 0
                ? "bg-gradient-to-r from-blue-400 to-indigo-500"
                : "bg-neutral-300"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   STEPPER (Flujo recomendado)
   ────────────────────────────────────────────────────────────────────────────── */

function FlowStepper() {
  const steps = [
    { number: 1, label: "Agrega evaluacion", icon: <IconPlus className="h-3.5 w-3.5" /> },
    { number: 2, label: "Completa campos", icon: <IconClipboard className="h-3.5 w-3.5" /> },
    { number: 3, label: "Configura fuentes", icon: <IconDatabase className="h-3.5 w-3.5" /> },
    { number: 4, label: "Guarda version", icon: <IconSave className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm ring-1 ring-neutral-200/60">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              {step.icon}
            </span>
            <span>{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-neutral-300">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   TOOLTIP
   ────────────────────────────────────────────────────────────────────────────── */

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
        </span>
      )}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   FIELD LABEL (with optional required indicator and help tooltip)
   ────────────────────────────────────────────────────────────────────────────── */

function FieldLabel({
  label,
  required = false,
  helpText,
}: {
  label: string;
  required?: boolean;
  helpText?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      {required && (
        <span className="text-xs font-bold text-red-400">*</span>
      )}
      {helpText && (
        <Tooltip text={helpText}>
          <IconInfo className="h-3.5 w-3.5 cursor-help text-neutral-400 transition hover:text-neutral-600" />
        </Tooltip>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   TOGGLE SWITCH (for boolean fields)
   ────────────────────────────────────────────────────────────────────────────── */

function ToggleSwitch({
  label,
  checked,
  onChange,
  helpText,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  helpText?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} helpText={helpText} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 ${
          checked ? "bg-indigo-500" : "bg-neutral-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className={`ml-2.5 text-xs font-medium ${checked ? "text-indigo-600" : "text-neutral-500"}`}>
        {checked ? "Si" : "No"}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SELECT OR CUSTOM (improved)
   ────────────────────────────────────────────────────────────────────────────── */

function SelectOrCustom({
  label,
  value,
  options,
  onChange,
  required = false,
  helpText,
}: SelectOrCustomProps) {
  const normalizedOptions = options.filter((option) => option.trim().length > 0);
  const hasValue = value.trim().length > 0;
  const existsInOptions = hasValue && normalizedOptions.includes(value);
  const isCustomValue = hasValue && !existsInOptions;
  const [manualCustomMode, setManualCustomMode] = useState(false);
  const customMode = manualCustomMode || isCustomValue;
  const selectValue = customMode ? "__custom__" : value;
  const isEmpty = !hasValue && required;

  return (
    <div>
      <FieldLabel label={label} required={required} helpText={helpText} />
      <div className="relative">
        <select
          value={selectValue}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "__custom__") {
              setManualCustomMode(true);
              return;
            }
            setManualCustomMode(false);
            onChange(next);
          }}
          className={`w-full appearance-none rounded-xl border bg-white py-2.5 pl-3 pr-9 text-sm outline-none transition-all duration-200 ${
            isEmpty
              ? "border-amber-300 text-neutral-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              : hasValue
                ? "border-neutral-300 text-neutral-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                : "border-neutral-200 text-neutral-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          }`}
        >
          <option value="">Selecciona una opcion...</option>
          {normalizedOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="__custom__">Otro (valor personalizado)...</option>
        </select>
        <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      </div>
      {customMode && (
        <div className="mt-2">
          <input
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              onChange(next);
              if (next.trim().length > 0 && normalizedOptions.includes(next)) {
                setManualCustomMode(false);
              }
            }}
            placeholder="Escribe un valor personalizado..."
            className="w-full rounded-xl border border-indigo-200 bg-indigo-50/30 px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <p className="mt-1 text-[11px] text-indigo-500">
            Ingresa un valor que no esta en la lista
          </p>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SECTION DIVIDER
   ────────────────────────────────────────────────────────────────────────────── */

function SectionDivider({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-1 pt-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-500">
        {icon}
      </span>
      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">{title}</h4>
      <div className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   MAIN EDITOR COMPONENT
   ────────────────────────────────────────────────────────────────────────────── */

export function TeamIncentiveRuleEditor({
  teamId,
  periodMonthInput,
  defaultRuleDefinition,
  focusRuleId = null,
  payCurveOptions,
}: Props) {
  const initialModel = useMemo(
    () => buildInitialModel(defaultRuleDefinition),
    [defaultRuleDefinition],
  );
  const initialRules = useMemo(() => {
    const curveByAlias = new Map<string, string>();
    for (const curve of payCurveOptions) {
      const id = curve.id.trim();
      if (!id) continue;
      curveByAlias.set(id.toLowerCase(), id);
      const name = (curve.name ?? "").trim();
      if (name) curveByAlias.set(name.toLowerCase(), id);
      const code = (curve.code ?? "").trim();
      if (code) curveByAlias.set(code.toLowerCase(), id);
    }

    return initialModel.rules.map((rule) => {
      const rawCurveValue = rule.curva_pago.trim();
      if (!rawCurveValue) return rule;
      const resolved = curveByAlias.get(rawCurveValue.toLowerCase());
      if (!resolved) return rule;
      return { ...rule, curva_pago: resolved };
    });
  }, [initialModel.rules, payCurveOptions]);

  const [activeTab, setActiveTab] = useState<"rules" | "json">("rules");
  const [modelName] = useState(initialModel.modelName);
  const [description] = useState(initialModel.description);
  const [rules, setRules] = useState<IncentiveRuleRow[]>(initialRules);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(
    focusRuleId || initialRules[0]?.id || null,
  );

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    ruleId: string;
    ruleName: string;
  }>({ open: false, ruleId: "", ruleName: "" });

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveTeamIncentiveRuleVersionAction,
    null,
  );

  const evaluationCompletion = useMemo(() => {
    return rules.map((rule) => {
      const fields = {
        product_name: Boolean(rule.product_name.trim()),
        plan_type_name: Boolean(rule.plan_type_name.trim()),
        prod_weight: Boolean(rule.prod_weight.trim()),
        precio_promedio: rule.calcular_en_valores ? Boolean(rule.precio_promedio.trim()) : true,
        agrupador: Boolean(rule.agrupador.trim()),
        curva_pago: Boolean(rule.curva_pago.trim()),
        elemento: Boolean(rule.elemento.trim()),
      };

      const filledCount = Object.values(fields).filter(Boolean).length;
      const totalFields = Object.keys(fields).length;
      const isComplete = filledCount === totalFields;

      return {
        ruleId: rule.id,
        isComplete,
        filledCount,
        totalFields,
        fields,
      };
    });
  }, [rules]);

  const completedEvaluations = evaluationCompletion.filter((item) => item.isComplete).length;

  const productNameOptions = useMemo(() => {
    const set = new Set<string>();
    for (const rule of rules) {
      const productName = rule.product_name.trim();
      if (productName) set.add(productName);
    }
    return Array.from(set.values());
  }, [rules]);

  const candadoOptions = useMemo(() => {
    const set = new Set<string>(TEAM_RULE_REFERENCE_VALUES.candado);
    for (const productName of productNameOptions) {
      set.add(productName);
    }
    return Array.from(set.values());
  }, [productNameOptions]);

  const fileOptions = useMemo(() => {
    const set = new Set<string>();
    for (const rule of rules) {
      for (const source of rule.sources) {
        const file = source.file.trim();
        if (file) set.add(file);
      }
    }
    return Array.from(set.values());
  }, [rules]);

  const serializedDefinition = useMemo(() => {
    const normalizedRules = rules.map((row) => {
      const sources = row.sources.map((source) => ({
        file: source.file.trim(),
        fuente: source.fuente.trim(),
        molecula_producto: source.molecula_producto.trim(),
        metric: source.metric.trim(),
      }));

      const source1 = sources[0] ?? { file: "", fuente: "", molecula_producto: "", metric: "" };
      const source2 = sources[1] ?? { file: "", fuente: "", molecula_producto: "", metric: "" };
      const source3 = sources[2] ?? { file: "", fuente: "", molecula_producto: "", metric: "" };

      return {
        rule_id: row.id,
        team_id: teamId,
        product_name: row.product_name.trim(),
        plan_type_name: row.plan_type_name.trim(),
        candado: row.candado.trim(),
        cobertura_candado: row.cobertura_candado.trim() || null,
        distribucion_no_asignada: row.distribucion_no_asignada,
        prod_weight: row.prod_weight.trim() || null,
        calcular_en_valores: row.calcular_en_valores,
        precio_promedio: row.calcular_en_valores ? row.precio_promedio.trim() || null : null,
        agrupador: row.agrupador.trim(),
        curva_pago: row.curva_pago.trim(),
        curva_pago_id: row.curva_pago.trim(),
        elemento: row.elemento.trim(),
        file1: source1.file,
        fuente1: source1.fuente,
        molecula_producto1: source1.molecula_producto,
        metric1: source1.metric,
        file2: source2.file,
        fuente2: source2.fuente,
        molecula_producto2: source2.molecula_producto,
        metric2: source2.metric,
        file3: source3.file,
        fuente3: source3.fuente,
        molecula_producto3: source3.molecula_producto,
        metric3: source3.metric,
        sources,
      };
    });

    return JSON.stringify(
      {
        schema_version: "team_rules_v2_ui",
        meta: {
          team_id: teamId,
          period_month: `${periodMonthInput}-01`,
          model_name: modelName,
          description,
        },
        reference_values: TEAM_RULE_REFERENCE_VALUES,
        rules: normalizedRules,
      },
      null,
      2,
    );
  }, [description, modelName, periodMonthInput, rules, teamId]);

  function updateRule(ruleId: string, updater: (rule: IncentiveRuleRow) => IncentiveRuleRow) {
    setRules((previous) =>
      previous.map((rule) => (rule.id === ruleId ? updater(rule) : rule)),
    );
  }

  function updateSource(
    ruleId: string,
    sourceId: string,
    updater: (source: InfoSourceBlock) => InfoSourceBlock,
  ) {
    updateRule(ruleId, (rule) => ({
      ...rule,
      sources: rule.sources.map((source) =>
        source.id === sourceId ? updater(source) : source,
      ),
    }));
  }

  function addRule() {
    const nextRule = createEmptyRule();
    setRules((previous) => [...previous, nextRule]);
    setExpandedRuleId(nextRule.id);
    setActiveTab("rules");
  }

  function confirmRemoveRule(ruleId: string, ruleName: string) {
    setConfirmDialog({ open: true, ruleId, ruleName });
  }

  function executeRemoveRule(ruleId: string) {
    setRules((previous) => {
      const next = previous.filter((rule) => rule.id !== ruleId);
      if (next.length === 0) {
        const empty = createEmptyRule();
        setExpandedRuleId(empty.id);
        return [empty];
      }
      if (expandedRuleId === ruleId) {
        setExpandedRuleId(next[0]?.id ?? null);
      }
      return next;
    });
    setConfirmDialog({ open: false, ruleId: "", ruleName: "" });
    showToast("Evaluacion eliminada correctamente", "success");
  }

  function addSource(ruleId: string) {
    updateRule(ruleId, (rule) => ({
      ...rule,
      sources: [...rule.sources, createEmptySource()],
    }));
  }

  function removeSource(ruleId: string, sourceId: string) {
    updateRule(ruleId, (rule) => {
      const nextSources = rule.sources.filter((source) => source.id !== sourceId);
      return {
        ...rule,
        sources: nextSources.length > 0 ? nextSources : [createEmptySource()],
      };
    });
  }

  return (
    <>
      {/* Global CSS for animations */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes expandDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 2000px; }
        }
      `}</style>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="Eliminar evaluacion"
        description={`Estas a punto de eliminar la evaluacion "${confirmDialog.ruleName || "Sin nombre"}". Esta accion no se puede deshacer. Todos los datos de esta evaluacion se perderan.`}
        confirmLabel="Si, eliminar"
        variant="danger"
        onConfirm={() => executeRemoveRule(confirmDialog.ruleId)}
        onCancel={() => setConfirmDialog({ open: false, ruleId: "", ruleName: "" })}
      />

      <section className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-sm">
        {/* ── Header ── */}
        <div className="border-b border-neutral-100 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/30 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <IconSparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                Nueva version de reglas
              </h2>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-500">
                Define las evaluaciones del plan por producto y configura sus fuentes de informacion para el calculo de incentivos.
              </p>
            </div>
          </div>
        </div>

        <form action={formAction} className="space-y-0">
          <input type="hidden" name="team_id" value={teamId} />
          <input type="hidden" name="period_month" value={periodMonthInput} />
          <input type="hidden" name="rule_definition" value={serializedDefinition} />

        

          {/* ── Tab Navigation ── */}
          <div className="border-b border-neutral-100 px-6 py-3">
            <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("rules")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  activeTab === "rules"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <IconClipboard className="h-4 w-4" />
                Evaluaciones del Plan
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    activeTab === "rules"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {rules.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("json")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  activeTab === "json"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 0 0 2 4.25v11.5A2.25 2.25 0 0 0 4.25 18h11.5A2.25 2.25 0 0 0 18 15.75V4.25A2.25 2.25 0 0 0 15.75 2H4.25Zm4.03 6.28a.75.75 0 0 0-1.06-1.06L4.97 9.47a.75.75 0 0 0 0 1.06l2.25 2.25a.75.75 0 0 0 1.06-1.06L6.56 10l1.72-1.72Zm3.44-1.06a.75.75 0 1 0-1.06 1.06L12.44 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06l2.25-2.25a.75.75 0 0 0 0-1.06l-2.25-2.25Z" clipRule="evenodd" />
                </svg>
                Vista JSON
              </button>
            </div>
          </div>

          {/* ── Rules Tab ── */}
          {activeTab === "rules" && (
            <div className="px-6 py-5">
              <div className="space-y-5">
                {/* Progress bar */}
                <ProgressBar completed={completedEvaluations} total={rules.length} />

                {/* Flow stepper + Add button */}
                <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
                        Flujo recomendado
                      </p>
                      <FlowStepper />
                    </div>
                    <button
                      type="button"
                      onClick={addRule}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
                    >
                      <IconPlus className="h-4 w-4" />
                      Agregar evaluacion
                    </button>
                  </div>
                </div>

                {/* Rules list */}
                <div className="space-y-3">
                  {rules.map((rule, ruleIndex) => {
                    const isExpanded = expandedRuleId === rule.id;
                    const productLabel = rule.product_name || "Producto sin nombre";
                    const planLabel = rule.plan_type_name || "Sin plan";
                    const completion = evaluationCompletion.find(
                      (item) => item.ruleId === rule.id,
                    );
                    const isComplete = completion?.isComplete ?? false;
                    const filledCount = completion?.filledCount ?? 0;
                    const totalFields = completion?.totalFields ?? 6;

                    return (
                      <div
                        key={rule.id}
                        className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                          isExpanded
                            ? "border-indigo-200 bg-white shadow-md ring-1 ring-indigo-100"
                            : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
                        }`}
                      >
                        {/* Rule header */}
                        <div
                          className={`flex items-center gap-3 px-4 py-3.5 ${
                            isExpanded
                              ? "border-b border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-transparent"
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRuleId(isExpanded ? null : rule.id)
                            }
                            className="flex flex-1 items-center gap-3 text-left"
                          >
                            {/* Number badge */}
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                isComplete
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {isComplete ? (
                                <IconCheck className="h-4 w-4" />
                              ) : (
                                ruleIndex + 1
                              )}
                            </span>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-neutral-900">
                                  {productLabel}
                                </span>
                                <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                                  {planLabel}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                {/* Mini progress */}
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      isComplete
                                        ? "bg-emerald-400"
                                        : "bg-amber-400"
                                    }`}
                                    style={{
                                      width: `${(filledCount / totalFields) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[11px] text-neutral-400">
                                  {filledCount}/{totalFields} campos
                                </span>
                              </div>
                            </div>

                            {/* Status badge */}
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                isComplete
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {isComplete ? "Completa" : "Pendiente"}
                            </span>

                            {/* Chevron */}
                            <span className="shrink-0 text-neutral-400">
                              {isExpanded ? (
                                <IconChevronUp className="h-5 w-5" />
                              ) : (
                                <IconChevronDown className="h-5 w-5" />
                              )}
                            </span>
                          </button>

                          {/* Delete button */}
                          <Tooltip text="Eliminar esta evaluacion">
                            <button
                              type="button"
                              onClick={() =>
                                confirmRemoveRule(rule.id, rule.product_name)
                              }
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-neutral-400 transition-all duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="animate-[fadeIn_0.2s_ease-out] px-5 py-5">
                            <div className="space-y-5">
                              {/* ── Product Configuration Section ── */}
                              <SectionDivider
                                title="Configuracion del producto"
                                icon={<IconClipboard className="h-3.5 w-3.5" />}
                              />

                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <FieldLabel
                                    label="Nombre del producto"
                                    required
                                    helpText="Nombre comercial del producto farmaceutico."
                                  />
                                  <input
                                    value={rule.product_name}
                                    onChange={(event) =>
                                      updateRule(rule.id, (current) => ({
                                        ...current,
                                        product_name: event.target.value,
                                      }))
                                    }
                                    placeholder="Ej: Metformina 850mg"
                                    className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-neutral-400 focus:ring-2 ${
                                      rule.product_name.trim()
                                        ? "border-neutral-300 text-neutral-900 focus:border-indigo-400 focus:ring-indigo-100"
                                        : "border-amber-300 text-neutral-900 focus:border-amber-500 focus:ring-amber-100"
                                    }`}
                                  />
                                </div>

                                <SelectOrCustom
                                  label="Tipo de plan"
                                  value={rule.plan_type_name}
                                  options={TEAM_RULE_REFERENCE_VALUES.plan_type_name}
                                  onChange={(value) =>
                                    updateRule(rule.id, (current) => ({
                                      ...current,
                                      plan_type_name: value,
                                    }))
                                  }
                                  required
                                  helpText="Tipo de plan de incentivos aplicable."
                                />

                                <SelectOrCustom
                                  label="Candado"
                                  value={rule.candado}
                                  options={candadoOptions}
                                  onChange={(value) =>
                                    updateRule(rule.id, (current) => ({
                                      ...current,
                                      candado: value,
                                    }))
                                  }
                                  helpText="Producto o condicion que actua como candado para el pago."
                                />

                                <div>
                                  <FieldLabel
                                    label="Cobertura candado"
                                    helpText="Porcentaje minimo de cobertura requerido para el candado (0 a 1)."
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={rule.cobertura_candado}
                                    onChange={(event) =>
                                      updateRule(rule.id, (current) => ({
                                        ...current,
                                        cobertura_candado: event.target.value,
                                      }))
                                    }
                                    placeholder="Ej: 0.80"
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                  />
                                </div>

                                <ToggleSwitch
                                  label="Distribucion no asignada"
                                  checked={rule.distribucion_no_asignada}
                                  onChange={(value) =>
                                    updateRule(rule.id, (current) => ({
                                      ...current,
                                      distribucion_no_asignada: value,
                                    }))
                                  }
                                  helpText="Indica si se distribuye la venta no asignada entre los representantes."
                                />

                                <div>
                                  <FieldLabel
                                    label="Peso del producto"
                                    required
                                    helpText="Ponderacion del producto en el calculo total de incentivos (0 a 1)."
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={rule.prod_weight}
                                    onChange={(event) =>
                                      updateRule(rule.id, (current) => ({
                                        ...current,
                                        prod_weight: event.target.value,
                                      }))
                                    }
                                    placeholder="Ej: 0.25"
                                    className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-neutral-400 focus:ring-2 ${
                                      rule.prod_weight.trim()
                                        ? "border-neutral-300 text-neutral-900 focus:border-indigo-400 focus:ring-indigo-100"
                                        : "border-amber-300 text-neutral-900 focus:border-amber-500 focus:ring-amber-100"
                                    }`}
                                  />
                                </div>
                              </div>

                              {/* ── Calculation Parameters Section ── */}
                              <SectionDivider
                                title="Parametros de calculo"
                                icon={<IconSparkles className="h-3.5 w-3.5" />}
                              />

                              <div className="grid gap-4 md:grid-cols-3">
                                <SelectOrCustom
                                  label="Agrupador"
                                  value={rule.agrupador}
                                  options={TEAM_RULE_REFERENCE_VALUES.agrupador}
                                  onChange={(value) =>
                                    updateRule(rule.id, (current) => ({
                                      ...current,
                                      agrupador: value,
                                    }))
                                  }
                                  required
                                  helpText="Criterio de agrupacion para el calculo del incentivo."
                                />

                                <div>
                                  <FieldLabel
                                    label="Curva de pago"
                                    required
                                    helpText="Selecciona la curva de pago existente. Se guarda el identificador interno de la curva."
                                  />
                                  <div className="relative">
                                    <select
                                      value={rule.curva_pago}
                                      onChange={(event) =>
                                        updateRule(rule.id, (current) => ({
                                          ...current,
                                          curva_pago: event.target.value,
                                        }))
                                      }
                                      className={`w-full appearance-none rounded-xl border bg-white py-2.5 pl-3 pr-9 text-sm outline-none transition-all duration-200 ${
                                        rule.curva_pago.trim().length > 0
                                          ? "border-neutral-300 text-neutral-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                          : "border-amber-300 text-neutral-900 focus:border-amber-500 focus:ring-amber-100"
                                      }`}
                                    >
                                      <option value="">Selecciona una curva...</option>
                                      {payCurveOptions.map((curve) => (
                                        <option key={curve.id} value={curve.id}>
                                          {curve.name}
                                          {curve.code ? ` (${curve.code})` : ""}
                                        </option>
                                      ))}
                                    </select>
                                    <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                                  </div>
                                </div>

                                <SelectOrCustom
                                  label="Elemento"
                                  value={rule.elemento}
                                  options={TEAM_RULE_REFERENCE_VALUES.elemento}
                                  onChange={(value) =>
                                    updateRule(rule.id, (current) => ({
                                      ...current,
                                      elemento: value,
                                    }))
                                  }
                                  required
                                  helpText="Elemento o metrica base para la evaluacion del desempeno."
                                />

                                <ToggleSwitch
                                  label="Calculcar en Valores"
                                  checked={rule.calcular_en_valores}
                                  onChange={(value) =>
                                    updateRule(rule.id, (current) => ({
                                      ...current,
                                      calcular_en_valores: value,
                                    }))
                                  }
                                  helpText="Activa el calculo por valores monetarios y habilita el campo de precio promedio."
                                />

                                {rule.calcular_en_valores && (
                                  <div>
                                    <FieldLabel
                                      label="Precio Promedio"
                                      required
                                      helpText="Precio promedio usado para convertir el calculo a valores monetarios."
                                    />
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={rule.precio_promedio}
                                      onChange={(event) =>
                                        updateRule(rule.id, (current) => ({
                                          ...current,
                                          precio_promedio: event.target.value,
                                        }))
                                      }
                                      placeholder="Ej: 125.50"
                                      className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all duration-200 placeholder:text-neutral-400 focus:ring-2 ${
                                        rule.precio_promedio.trim()
                                          ? "border-neutral-300 text-neutral-900 focus:border-indigo-400 focus:ring-indigo-100"
                                          : "border-amber-300 text-neutral-900 focus:border-amber-500 focus:ring-amber-100"
                                      }`}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* ── Sources Section ── */}
                              <SectionDivider
                                title="Fuentes de informacion para calculo"
                                icon={<IconDatabase className="h-3.5 w-3.5" />}
                              />

                              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4">
                                <div className="mb-4 flex items-center justify-between">
                                  <p className="text-xs text-neutral-500">
                                    Configura de donde se obtienen los datos para calcular esta evaluacion.
                                    Puedes agregar multiples fuentes.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => addSource(rule.id)}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:shadow"
                                  >
                                    <IconPlus className="h-3.5 w-3.5" />
                                    Agregar fuente
                                  </button>
                                </div>

                                <div className="space-y-3">
                                  {rule.sources.map((source, sourceIndex) => (
                                    <div
                                      key={source.id}
                                      className="rounded-xl border border-neutral-200 bg-white p-4 transition-all duration-200 hover:shadow-sm"
                                    >
                                      <div className="mb-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-[11px] font-bold text-indigo-600">
                                            {sourceIndex + 1}
                                          </span>
                                          <p className="text-xs font-semibold text-neutral-600">
                                            Fuente {sourceIndex + 1}
                                          </p>
                                        </div>
                                        {rule.sources.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeSource(rule.id, source.id)
                                            }
                                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                                          >
                                            <IconTrash className="h-3 w-3" />
                                            Eliminar
                                          </button>
                                        )}
                                      </div>

                                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                                        <SelectOrCustom
                                          label="Archivo"
                                          value={source.file}
                                          options={fileOptions}
                                          onChange={(value) =>
                                            updateSource(
                                              rule.id,
                                              source.id,
                                              (current) => ({
                                                ...current,
                                                file: value,
                                              }),
                                            )
                                          }
                                          helpText="Archivo de datos de donde se extrae la informacion."
                                        />

                                        <div>
                                          <FieldLabel
                                            label="Fuente"
                                            helpText='Puedes elegir una o varias fuentes. Se guardan separadas por "/" (ej: DESPLAZAMIENTO/ORDENES).'
                                          />
                                          <div className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-2">
                                            {TEAM_RULE_REFERENCE_VALUES.fuente.map((option) => {
                                              const selected = splitMultiValue(source.fuente).some(
                                                (item) => item.toLowerCase() === option.toLowerCase(),
                                              );
                                              return (
                                                <button
                                                  key={option}
                                                  type="button"
                                                  onClick={() =>
                                                    updateSource(
                                                      rule.id,
                                                      source.id,
                                                      (current) => ({
                                                        ...current,
                                                        fuente: toggleMultiValue(current.fuente, option),
                                                      }),
                                                    )
                                                  }
                                                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                                                    selected
                                                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                                                  }`}
                                                >
                                                  {option}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <input
                                            value={source.fuente}
                                            onChange={(event) =>
                                              updateSource(
                                                rule.id,
                                                source.id,
                                                (current) => ({
                                                  ...current,
                                                  fuente: event.target.value,
                                                }),
                                              )
                                            }
                                            placeholder="Ej: DESPLAZAMIENTO/ORDENES"
                                            className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                          />
                                        </div>

                                        <div>
                                          <FieldLabel
                                            label="Molecula / Producto"
                                            helpText="Molecula o producto especifico dentro de la fuente de datos."
                                          />
                                          <input
                                            value={source.molecula_producto}
                                            onChange={(event) =>
                                              updateSource(
                                                rule.id,
                                                source.id,
                                                (current) => ({
                                                  ...current,
                                                  molecula_producto:
                                                    event.target.value,
                                                }),
                                              )
                                            }
                                            placeholder="Ej: Metformina"
                                            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                          />
                                        </div>

                                        <SelectOrCustom
                                          label="Metrica"
                                          value={source.metric}
                                          options={
                                            TEAM_RULE_REFERENCE_VALUES.metrica
                                          }
                                          onChange={(value) =>
                                            updateSource(
                                              rule.id,
                                              source.id,
                                              (current) => ({
                                                ...current,
                                                metric: value,
                                              }),
                                            )
                                          }
                                          helpText="Tipo de metrica o medida a utilizar del dato."
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add rule at bottom (secondary) */}
                {rules.length > 0 && (
                  <button
                    type="button"
                    onClick={addRule}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 py-4 text-sm font-medium text-neutral-400 transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-600"
                  >
                    <IconPlus className="h-4 w-4" />
                    Agregar otra evaluacion
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── JSON Tab ── */}
          {activeTab === "json" && (
            <div className="px-6 py-5">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-900 p-1">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs font-medium text-neutral-400">
                    Preview JSON (solo lectura)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(serializedDefinition);
                      showToast("JSON copiado al portapapeles", "success");
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
                  >
                    <IconClipboard className="h-3.5 w-3.5" />
                    Copiar
                  </button>
                </div>
                <textarea
                  value={serializedDefinition}
                  readOnly
                  rows={20}
                  className="w-full rounded-xl border-0 bg-neutral-900 px-4 py-2 font-mono text-xs leading-relaxed text-emerald-400 outline-none"
                />
              </div>
            </div>
          )}

            {/* ── Change Note ── */}
          <div className="border-b border-neutral-100 px-6 py-5">
            <FieldLabel
              label="Nota de cambio"
              helpText="Describe brevemente que cambios realizas en esta version para llevar un historial claro."
            />
            <textarea
              id="change_note"
              name="change_note"
              rows={2}
              placeholder="Ej: Ajuste de ponderadores para cardiometabolico, se agrego nueva fuente de datos..."
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* ── Footer / Submit ── */}
          <div className="border-t border-neutral-100 bg-neutral-50/50 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      completedEvaluations === rules.length && rules.length > 0
                        ? "bg-emerald-400"
                        : "bg-amber-400"
                    }`}
                  />
                  {completedEvaluations === rules.length && rules.length > 0
                    ? "Todas las evaluaciones estan completas"
                    : `${rules.length - completedEvaluations} evaluacion(es) pendiente(s) de completar`}
                </div>
              </div>

              

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-neutral-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Guardando version...
                  </>
                ) : (
                  <>
                    <IconSave className="h-4 w-4" />
                    Guardar nueva version
                  </>
                )}
              </button>
            </div>

            {/* Inline state message (backup to toast) */}
            {state && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                  state.ok
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {state.ok ? (
                  <IconCheck className="h-4 w-4 shrink-0" />
                ) : (
                  <IconWarning className="h-4 w-4 shrink-0" />
                )}
                {state.message}
              </div>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
