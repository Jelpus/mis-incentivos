"use client";

import { useActionState, useEffect, useMemo, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { savePeriodSettingsAction } from "@/app/admin/period-settings/actions";
import {
  formatPeriodMonthForInput,
  formatPeriodMonthLabel,
} from "@/lib/admin/incentive-rules/shared";

/* ──────────────────────────────────────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────────────────────────────────────── */

type PeriodSettings = {
  periodMonth: string;
  resultFromHireDateEnabled: boolean;
  hireDateCutoffDay: number;
  affectedProductNames: string[];
};

type Props = {
  periodMonth: string;
  availablePeriods: string[];
  settings: PeriodSettings;
  storageReady: boolean;
  storageMessage: string | null;
  productOptions: string[];
  productsMessage: string | null;
  sampleRows: Array<{
    territorioIndividual: string;
    nombreCompleto: string | null;
    teamId: string | null;
    fechaIngreso: string | null;
    effectivePeriodCut: string | null;
    includedInSelectedPeriod: boolean;
  }>;
};

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

/* ──────────────────────────────────────────────────────────────────────────────
   ICONS (inline SVG — zero dependencies)
   ────────────────────────────────────────────────────────────────────────────── */

function IconCalendar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
    </svg>
  );
}

function IconSettings({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
    </svg>
  );
}

function IconCube({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.362 1.093a.75.75 0 0 0-.724 0L2.523 5.018 10 9.143l7.477-4.125-7.115-3.925ZM18 6.443l-7.25 3.996v8.614l6.862-3.785A.75.75 0 0 0 18 14.607V6.443ZM9.25 19.053V10.44L2 6.443v8.164a.75.75 0 0 0 .388.657l6.862 3.785Z" />
    </svg>
  );
}

function IconUsers({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 17a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
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

function IconSearch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
    </svg>
  );
}

function IconChevronDown({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────────────────────────── */

function normalizeProductNameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatCut(value: string | null): string {
  if (!value) return "-";
  return value.slice(0, 7);
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
  type: "success" | "error" | "warning";
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
            : type === "warning"
              ? "border border-amber-200/50 bg-amber-50/95 text-amber-800"
              : "border border-red-200/50 bg-red-50/95 text-red-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            type === "success" ? "bg-emerald-100" : type === "warning" ? "bg-amber-100" : "bg-red-100"
          }`}
        >
          {type === "success" ? (
            <IconCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <IconWarning className={`h-4 w-4 ${type === "warning" ? "text-amber-600" : "text-red-600"}`} />
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
      {required && <span className="text-xs font-bold text-red-400">*</span>}
      {helpText && (
        <Tooltip text={helpText}>
          <IconInfo className="h-3.5 w-3.5 cursor-help text-neutral-400 transition hover:text-neutral-600" />
        </Tooltip>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   TOGGLE SWITCH
   ────────────────────────────────────────────────────────────────────────────── */

function ToggleSwitch({
  checked,
  onChange,
  name,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  name?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 ${
          checked ? "bg-indigo-500" : "bg-neutral-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className={`text-sm font-semibold ${checked ? "text-indigo-600" : "text-neutral-500"}`}>
        {checked ? "Activo" : "Inactivo"}
      </span>
      {/* Hidden input for form submission */}
      {name && checked && <input type="hidden" name={name} value="on" />}
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
   MAIN COMPONENT
   ────────────────────────────────────────────────────────────────────────────── */

export function PeriodSettingsCard({
  periodMonth,
  availablePeriods,
  settings,
  storageReady,
  storageMessage,
  productOptions,
  productsMessage,
  sampleRows,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePeriodSettingsAction, null);
  const [isPeriodPending, startPeriodTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings.resultFromHireDateEnabled);
  const [cutoffDay, setCutoffDay] = useState(String(settings.hireDateCutoffDay));
  const [selectedProducts, setSelectedProducts] = useState<string[]>(settings.affectedProductNames);
  const [search, setSearch] = useState("");

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "warning";
  }>({ visible: false, message: "", type: "success" });

  const showToast = useCallback((message: string, type: "success" | "error" | "warning") => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      showToast(state.message, "success");
    } else if (state && !state.ok) {
      showToast(state.message, "error");
    }
  }, [router, state, showToast]);

  // Show storage warning as toast on mount
  useEffect(() => {
    if (!storageReady && storageMessage) {
      showToast(storageMessage, "warning");
    }
  }, [storageReady, storageMessage, showToast]);

  const periodOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        availablePeriods
          .map((period) => formatPeriodMonthForInput(period))
          .filter((period) => period.length > 0),
      ),
    );
    return unique.length ? unique : [formatPeriodMonthForInput(periodMonth)];
  }, [availablePeriods, periodMonth]);

  const selectedKeys = useMemo(
    () => new Set(selectedProducts.map(normalizeProductNameKey)),
    [selectedProducts],
  );

  const visibleProducts = useMemo(() => {
    const query = normalizeProductNameKey(search);
    if (!query) return productOptions;
    return productOptions.filter((product) => normalizeProductNameKey(product).includes(query));
  }, [productOptions, search]);

  const selectedProductsJson = useMemo(() => JSON.stringify(selectedProducts), [selectedProducts]);

  const includedCount = useMemo(
    () => sampleRows.filter((row) => row.includedInSelectedPeriod).length,
    [sampleRows],
  );

  function changePeriod(nextPeriod: string) {
    const params = new URLSearchParams();
    params.set("period", nextPeriod);
    startPeriodTransition(() => {
      router.push(`/admin/period-settings?${params.toString()}`);
    });
  }

  function toggleProduct(productName: string, checked: boolean) {
    setSelectedProducts((prev) => {
      const key = normalizeProductNameKey(productName);
      if (!key) return prev;
      if (checked) {
        if (prev.some((item) => normalizeProductNameKey(item) === key)) return prev;
        return [...prev, productName].sort((a, b) => a.localeCompare(b));
      }
      return prev.filter((item) => normalizeProductNameKey(item) !== key);
    });
  }

  function clearProducts() {
    setSelectedProducts([]);
  }

  function selectVisibleProducts() {
    setSelectedProducts((prev) => {
      const byKey = new Map(prev.map((product) => [normalizeProductNameKey(product), product]));
      for (const product of visibleProducts) {
        const key = normalizeProductNameKey(product);
        if (key && !byKey.has(key)) byKey.set(key, product);
      }
      return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Toast notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />

      <section className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-sm">

        {/* ── Header ── */}
        <div className="border-b border-neutral-100 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/30 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <IconSettings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Period Settings</h2>
                <p className="mt-0.5 text-sm leading-relaxed text-neutral-500">
                  Configura el comportamiento global del calculo de incentivos por periodo.
                </p>
              </div>
            </div>

            {/* Period selector */}
            <div className="shrink-0">
              <FieldLabel
                label="Periodo de referencia"
                helpText="Solo cambia la muestra y la lista de productos disponibles; el setting se guarda una sola vez."
              />
              <div className="relative mt-0.5">
                <select
                  value={formatPeriodMonthForInput(periodMonth)}
                  onChange={(event) => changePeriod(event.target.value)}
                  disabled={isPeriodPending}
                  className="w-full appearance-none rounded-xl border border-neutral-300 bg-white py-2.5 pl-3 pr-9 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {periodOptions.map((period) => (
                    <option key={period} value={period}>
                      {formatPeriodMonthLabel(period)}
                    </option>
                  ))}
                </select>
                <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm">
              <IconCube className="h-3.5 w-3.5 text-indigo-500" />
              <span>
                <span className="font-bold text-neutral-900">{selectedProducts.length}</span>
                {" "}product_names seleccionados
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm">
              <IconUsers className="h-3.5 w-3.5 text-emerald-500" />
              <span>
                <span className="font-bold text-neutral-900">{includedCount}</span>
                {" / "}{sampleRows.length} representantes incluidos
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${storageReady ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              <span>{storageReady ? "Configuracion global" : "Storage no disponible"}</span>
            </div>
          </div>
        </div>

        {/* ── Form ── */}
        <form action={formAction} className="divide-y divide-neutral-100">
          <input type="hidden" name="affected_product_names_json" value={selectedProductsJson} />

          {/* ── Section: Reglas de calculo ── */}
          <div className="px-6 py-5">
            <SectionDivider
              title="Reglas de calculo"
              icon={<IconSettings className="h-3.5 w-3.5" />}
            />

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">

              {/* Toggle: resultado desde fecha de ingreso */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 px-5 py-4 transition-all duration-200 hover:border-neutral-300 hover:bg-white hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      Resultado desde fecha de ingreso
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                      Cuando esta activo, el calculo del resultado se realiza desde la fecha de ingreso del representante, aplicando el corte configurado.
                    </p>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <ToggleSwitch
                      checked={enabled}
                      onChange={setEnabled}
                    />
                    {/* Hidden checkbox for form compatibility */}
                    <input
                      type="checkbox"
                      name="result_from_hire_date_enabled"
                      checked={enabled}
                      onChange={(event) => setEnabled(event.target.checked)}
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                  </div>
                </div>
              </div>

              {/* Cutoff day */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/40 px-5 py-4 transition-all duration-200 hover:border-neutral-300 hover:bg-white hover:shadow-sm">
                <FieldLabel
                  label="Dia de corte"
                  helpText="Dia del mes (1-31) a partir del cual se aplica la regla de fecha de ingreso."
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  name="hire_date_cutoff_day"
                  value={cutoffDay}
                  onChange={(event) => setCutoffDay(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <p className="mt-2 text-xs text-neutral-400">
                  Valor entre 1 y 31
                </p>
              </div>
            </div>
          </div>

          {/* ── Section: Product names afectados ── */}
          <div className="px-6 py-5">
            <SectionDivider
              title="Product names afectados"
              icon={<IconCube className="h-3.5 w-3.5" />}
            />

            <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/60 px-4 py-3">
                <div>
                  {productsMessage ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <IconWarning className="h-3.5 w-3.5 shrink-0" />
                      {productsMessage}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      Selecciona los productos a los que aplica esta configuracion.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar producto..."
                      className="w-52 rounded-xl border border-neutral-300 bg-white py-2 pl-8 pr-3 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={selectVisibleProducts}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:shadow"
                  >
                    Seleccionar visibles
                  </button>
                  <button
                    type="button"
                    onClick={clearProducts}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Product grid */}
              <div className="max-h-80 overflow-y-auto p-4">
                {visibleProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
                      <IconCube className="h-6 w-6 text-neutral-400" />
                    </div>
                    <p className="text-sm font-medium text-neutral-500">No hay productos para mostrar</p>
                    {search && (
                      <p className="mt-1 text-xs text-neutral-400">
                        Intenta con otro termino de busqueda
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {visibleProducts.map((product) => {
                      const checked = selectedKeys.has(normalizeProductNameKey(product));
                      return (
                        <label
                          key={product}
                          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-150 ${
                            checked
                              ? "border-indigo-200 bg-indigo-50/60 text-indigo-900"
                              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                          }`}
                        >
                          <span
                            className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
                              checked
                                ? "border-indigo-500 bg-indigo-500"
                                : "border-neutral-300 bg-white"
                            }`}
                          >
                            {checked && <IconCheck className="h-3 w-3 text-white" />}
                          </span>
                          <input
                            type="checkbox"
                            name="affected_product_names"
                            value={product}
                            checked={checked}
                            onChange={(event) => toggleProduct(product, event.target.checked)}
                            className="sr-only"
                          />
                          <span className="min-w-0 break-words text-xs font-medium">{product}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selection summary */}
              {selectedProducts.length > 0 && (
                <div className="border-t border-neutral-100 bg-indigo-50/40 px-4 py-2.5">
                  <p className="text-xs font-medium text-indigo-700">
                    {selectedProducts.length} producto{selectedProducts.length !== 1 ? "s" : ""} seleccionado{selectedProducts.length !== 1 ? "s" : ""}
                    {search && visibleProducts.length < productOptions.length && (
                      <span className="ml-1 text-indigo-500">
                        (mostrando {visibleProducts.length} de {productOptions.length})
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Section: Muestra de representantes ── */}
          <div className="px-6 py-5">
            <SectionDivider
              title="Muestra de representantes"
              icon={<IconUsers className="h-3.5 w-3.5" />}
            />

            <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200">
              {sampleRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
                    <IconUsers className="h-6 w-6 text-neutral-400" />
                  </div>
                  <p className="text-sm font-medium text-neutral-500">Sin representantes activos para este periodo</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50/80">
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-400">Ruta</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-400">Nombre</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-400">Team</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-400">Ingreso</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-400">effective_period_cut</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-neutral-400">Periodo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {sampleRows.map((row) => (
                        <tr
                          key={row.territorioIndividual}
                          className="transition-colors duration-100 hover:bg-neutral-50/60"
                        >
                          <td className="px-4 py-3 font-semibold text-neutral-900">{row.territorioIndividual}</td>
                          <td className="px-4 py-3 text-neutral-600">{row.nombreCompleto ?? "-"}</td>
                          <td className="px-4 py-3 text-neutral-600">{row.teamId ?? "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-neutral-500">{formatDate(row.fechaIngreso)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-neutral-500">{formatCut(row.effectivePeriodCut)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                row.includedInSelectedPeriod
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  row.includedInSelectedPeriod ? "bg-emerald-500" : "bg-amber-500"
                                }`}
                              />
                              {row.includedInSelectedPeriod ? "Incluido" : "Pendiente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer / Submit ── */}
          <div className="border-t border-neutral-100 bg-neutral-50/50 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${storageReady ? "bg-emerald-400" : "bg-amber-400"}`}
                />
                {storageReady
                  ? "Listo para guardar"
                  : "Storage no disponible — no se puede guardar"}
              </div>

              <button
                type="submit"
                disabled={pending || !storageReady}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-neutral-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? (
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
                    Guardando...
                  </>
                ) : (
                  <>
                    <IconSave className="h-4 w-4" />
                    Guardar Period Settings
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
