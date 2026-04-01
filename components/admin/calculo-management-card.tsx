"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";

type Row = {
  periodMonth: string;
  status: "borrador" | "precalculo" | "final" | "publicado";
  finalAmount: number | null;
  vsMedia: number | null;
  vsPeriodoAnterior: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type Props = {
  rows: Row[];
  bigQueryReady: boolean;
  bigQueryMessage: string | null;
};

type ActionOption = {
  key: string;
  label: string;
  href: string;
};

function formatDateTime(value: string | null) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function statusBadge(status: Row["status"]) {
  if (status === "borrador") return "bg-neutral-100 text-neutral-700";
  if (status === "precalculo") return "bg-amber-100 text-amber-800";
  if (status === "final") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

function statusLabel(status: Row["status"]) {
  if (status === "precalculo") return "Precalculo";
  if (status === "final") return "Final";
  if (status === "publicado") return "Publicado";
  return "Borrador";
}

function actionsForStatus(status: Row["status"], periodMonth: string): ActionOption[] {
  const periodQuery = `periodo=${periodMonth.slice(0, 7)}`;
  if (status === "borrador") {
    return [{ key: "calcular", label: "Calcular (Process)", href: `/admin/calculo/process?${periodQuery}` }];
  }
  if (status === "precalculo") {
    return [
      { key: "calcular", label: "Calcular (Process)", href: `/admin/calculo/process?${periodQuery}` },
      { key: "ajustar", label: "Ajustar", href: `/admin/calculo/adjustments?${periodQuery}` },
      { key: "aprobar", label: "Aprobar", href: `/admin/calculo/aprobar?${periodQuery}` },
    ];
  }
  if (status === "final") {
    return [
      { key: "calcular", label: "Calcular (Process)", href: `/admin/calculo/process?${periodQuery}` },
      { key: "ajustar", label: "Ajustar", href: `/admin/calculo/adjustments?${periodQuery}` },
      { key: "aprobar", label: "Aprobar", href: `/admin/calculo/aprobar?${periodQuery}` },
      { key: "publicar", label: "Publicar", href: `/admin/calculo/publish?${periodQuery}` },
    ];
  }
  return [
    { key: "calcular", label: "Calcular (Process)", href: `/admin/calculo/process?${periodQuery}` },
    { key: "ajustar", label: "Ajustar", href: `/admin/calculo/adjustments?${periodQuery}` },
    { key: "aprobar", label: "Aprobar", href: `/admin/calculo/aprobar?${periodQuery}` },
    { key: "publicar", label: "Publicar", href: `/admin/calculo/publish?${periodQuery}` },
    { key: "despublicar", label: "Despublicar", href: `/admin/calculo/unpublish?${periodQuery}` },
  ];
}

function getSelectedActionHref(selectedByPeriod: Record<string, string>, periodMonth: string, options: ActionOption[]): string {
  const selectedKey = selectedByPeriod[periodMonth];
  if (!selectedKey) return options[0]?.href ?? "/admin/calculo";
  const selectedOption = options.find((option) => option.key === selectedKey);
  return selectedOption?.href ?? options[0]?.href ?? "/admin/calculo";
}

export function CalculoManagementCard({ rows, bigQueryReady, bigQueryMessage }: Props) {
  const router = useRouter();
  const [selectedByPeriod, setSelectedByPeriod] = useState<Record<string, string>>({});
  const [pendingPeriod, setPendingPeriod] = useState<string | null>(null);
  const [isNavigating, startNavigationTransition] = useTransition();

  const actionOptionsByPeriod = useMemo(() => {
    const map = new Map<string, ActionOption[]>();
    for (const row of rows) {
      map.set(row.periodMonth, actionsForStatus(row.status, row.periodMonth));
    }
    return map;
  }, [rows]);

  useEffect(() => {
    const hrefs = new Set<string>();
    for (const row of rows) {
      const options = actionOptionsByPeriod.get(row.periodMonth) ?? [];
      for (const option of options) hrefs.add(option.href);
    }
    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [actionOptionsByPeriod, rows, router]);

  function onSelectChange(periodMonth: string, actionKey: string) {
    setSelectedByPeriod((prev) => ({ ...prev, [periodMonth]: actionKey }));
  }

  function openSelected(periodMonth: string) {
    const options = actionOptionsByPeriod.get(periodMonth) ?? [];
    const href = getSelectedActionHref(selectedByPeriod, periodMonth, options);
    setPendingPeriod(periodMonth);
    startNavigationTransition(() => {
      router.push(href);
    });
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      {!bigQueryReady && bigQueryMessage ? (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {bigQueryMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2">Periodo</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Monto final</th>
              <th className="px-3 py-2">Vs media</th>
              <th className="px-3 py-2">Vs periodo anterior</th>
              <th className="px-3 py-2">Actualizado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                  No hay periodos disponibles desde 2026 en sales_force_status.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const options = actionOptionsByPeriod.get(row.periodMonth) ?? [];
                const selectedKey = selectedByPeriod[row.periodMonth] ?? options[0]?.key ?? "";

                return (
                  <tr key={row.periodMonth} className="border-b border-neutral-100">
                    <td className="px-3 py-2 font-medium text-neutral-900">{formatPeriodMonthLabel(row.periodMonth)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{formatMoney(row.finalAmount)}</td>
                    <td className="px-3 py-2 text-neutral-700">{formatPercent(row.vsMedia)}</td>
                    <td className="px-3 py-2 text-neutral-700">{formatPercent(row.vsPeriodoAnterior)}</td>
                    <td className="px-3 py-2 text-neutral-700">
                      <p>{formatDateTime(row.updatedAt)}</p>
                      <p className="text-xs text-neutral-500">{row.updatedBy ?? "-"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedKey}
                          onChange={(event) => onSelectChange(row.periodMonth, event.target.value)}
                          className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-800"
                        >
                          {options.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => openSelected(row.periodMonth)}
                          disabled={isNavigating}
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        >
                          {isNavigating && pendingPeriod === row.periodMonth ? "Abriendo..." : "Ir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
