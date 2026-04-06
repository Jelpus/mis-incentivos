"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  PerformanceCoverageBin,
  PerformanceReportData,
} from "@/lib/performance/get-performance-report-data";

type GroupMode = "month" | "quarter" | "semester" | "year";

type PeriodGroup = {
  key: string;
  label: string;
  periodCodes: string[];
};

type PerformanceReportClientProps = {
  initialData: PerformanceReportData;
};

type ChartRow = {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
  routeCount: number;
  percentOfForce: number;
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[#cbd5e1] bg-white text-[10px] font-semibold text-[#475467] hover:bg-[#f8fafc]"
        aria-label="Ver formula"
      >
        i
      </button>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 rounded-md border border-[#d0d5dd] bg-white p-2 text-[11px] font-normal leading-4 text-[#344054] shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCountWithPercent(count: number, percent: number) {
  return `${count} (${formatPercent(percent)})`;
}

function formatPeriodCode(periodCode: string) {
  if (!/^\d{6}$/.test(periodCode)) return periodCode;
  const year = Number(periodCode.slice(0, 4));
  const month = Number(periodCode.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric" }).format(date);
}

function buildPeriodGroups(periods: string[], mode: GroupMode): PeriodGroup[] {
  const map = new Map<string, PeriodGroup>();
  const normalized = [...periods].filter((period) => /^\d{6}$/.test(period)).sort((a, b) => b.localeCompare(a));

  for (const period of normalized) {
    const year = period.slice(0, 4);
    const month = Number(period.slice(4, 6));
    let key = period;
    let label = formatPeriodCode(period);

    if (mode === "quarter") {
      const quarter = Math.ceil(month / 3);
      key = `${year}-Q${quarter}`;
      label = `Q${quarter} ${year}`;
    } else if (mode === "semester") {
      const semester = month <= 6 ? 1 : 2;
      key = `${year}-S${semester}`;
      label = `S${semester} ${year}`;
    } else if (mode === "year") {
      key = year;
      label = year;
    }

    const current = map.get(key);
    if (!current) {
      map.set(key, { key, label, periodCodes: [period] });
    } else {
      current.periodCodes.push(period);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

function buildRequestKey(input: {
  periodCodes: string[];
  teamId: string;
  linea: string;
  productName: string;
  manager: string;
}) {
  return JSON.stringify({
    periodCodes: [...input.periodCodes].sort(),
    teamId: input.teamId,
    linea: input.linea,
    productName: input.productName,
    manager: input.manager,
  });
}

function mapBinsToChartRows(bins: PerformanceCoverageBin[]): ChartRow[] {
  return bins.map((bin) => ({
    key: bin.key,
    label: bin.label,
    min: bin.min,
    max: bin.max,
    routeCount: bin.routeCount,
    percentOfForce: bin.percentOfForce,
  }));
}

function getCoverageReferenceValue(row: ChartRow) {
  if (row.min === null && row.max !== null) return row.max;
  if (row.min !== null && row.max === null) return row.min + 1;
  if (row.min !== null && row.max !== null) return (row.min + row.max) / 2;
  return 0;
}

function getCoverageColor(row: ChartRow) {
  const value = getCoverageReferenceValue(row);
  if (value <= 90) return "#facc15";
  if (value <= 110) return "#86efac";
  if (value <= 150) return "#22c55e";
  if (value <= 200) return "#15803d";
  return "#14532d";
}

export function PerformanceReportClient({ initialData }: PerformanceReportClientProps) {
  const [data, setData] = useState<PerformanceReportData>(initialData);
  const [groupMode, setGroupMode] = useState<GroupMode>("month");
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [teamId, setTeamId] = useState(initialData.filters.teamId);
  const [linea, setLinea] = useState(initialData.filters.linea);
  const [productName, setProductName] = useState(initialData.filters.productName);
  const [manager, setManager] = useState(initialData.filters.manager);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bandMetric, setBandMetric] = useState<"payout" | "coverage">("payout");
  const [exporting, setExporting] = useState(false);
  const initialKeyRef = useRef(
    buildRequestKey({
      periodCodes: initialData.selectedPeriods,
      teamId: initialData.filters.teamId,
      linea: initialData.filters.linea,
      productName: initialData.filters.productName,
      manager: initialData.filters.manager,
    }),
  );
  const hasLoadedRef = useRef(false);

  const periodGroups = useMemo(
    () => buildPeriodGroups(data.availablePeriods, groupMode),
    [data.availablePeriods, groupMode],
  );

  const effectiveSelectedGroupKeys = useMemo(() => {
    if (!periodGroups.length) return [];
    const valid = selectedGroupKeys.filter((key) => periodGroups.some((group) => group.key === key));
    if (valid.length) return valid;
    return [periodGroups[0].key];
  }, [periodGroups, selectedGroupKeys]);

  const selectedPeriods = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedGroupKeys);
    const expanded = periodGroups
      .filter((group) => selectedSet.has(group.key))
      .flatMap((group) => group.periodCodes);

    return Array.from(new Set(expanded)).sort((a, b) => b.localeCompare(a));
  }, [periodGroups, effectiveSelectedGroupKeys]);

  const chartRows = useMemo(() => mapBinsToChartRows(data.bins), [data.bins]);

  useEffect(() => {
    if (!selectedPeriods.length) return;

    const requestKey = buildRequestKey({
      periodCodes: selectedPeriods,
      teamId,
      linea,
      productName,
      manager,
    });

    if (!hasLoadedRef.current && requestKey === initialKeyRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    let active = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      const search = new URLSearchParams();
      search.set("periodos", selectedPeriods.join(","));
      if (teamId) search.set("teamId", teamId);
      if (linea) search.set("linea", linea);
      if (productName) search.set("productName", productName);
      if (manager) search.set("manager", manager);

      try {
        const response = await fetch(`/api/profile/performance-report?${search.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          data?: PerformanceReportData;
          error?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "No fue posible cargar el reporte.");
        }

        if (!active) return;
        setData(payload.data);
      } catch (fetchError: unknown) {
        if (!active) return;
        const message =
          fetchError instanceof Error ? fetchError.message : "No fue posible cargar el reporte.";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [selectedPeriods, teamId, linea, productName, manager]);

  function toggleGroupKey(key: string) {
    setSelectedGroupKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  function clearFilters() {
    setTeamId("");
    setLinea("");
    setProductName("");
    setManager("");
  }

  function getBandPercents(row: PerformanceReportData["productBands"][number], metric: "payout" | "coverage") {
    const total = row.totalRoutes > 0 ? row.totalRoutes : 1;
    const values =
      metric === "payout"
        ? [
            row.payout_0_30,
            row.payout_31_60,
            row.payout_61_90,
            row.payout_90_100,
            row.payout_101_150,
            row.payout_151_200,
            row.payout_201_250,
          ]
        : [
            row.coverage_0_30,
            row.coverage_31_60,
            row.coverage_61_90,
            row.coverage_90_100,
            row.coverage_101_150,
            row.coverage_151_200,
            row.coverage_201_250,
          ];
    return values.map((count) => ({
      count,
      percent: (count / total) * 100,
    }));
  }

function heatColor(percent: number) {
  const alpha = Math.max(0.08, Math.min(0.85, percent / 100));
  return `rgba(29, 78, 216, ${alpha})`;
}

function heatTextColor(percent: number) {
  return percent >= 55 ? "#ffffff" : "#0f172a";
}

  async function exportReportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      const summaryRows = [
        { Metrica: "Rutas unicas", Valor: data.summary.routeCount },
        { Metrica: "Cobertura global (%)", Valor: data.summary.overallCoverage },
        { Metrica: "Cobertura promedio (%)", Valor: data.summary.averageCoverage },
        { Metrica: "Cobertura mediana (%)", Valor: data.summary.medianCoverage },
        { Metrica: "Total payout", Valor: data.summary.totalPayout },
        { Metrica: "Total variable", Valor: data.summary.totalVariable },
        { Metrica: "Bottom 10 share (%)", Valor: data.summary.payBottom10Share },
        { Metrica: "Bottom 25 share (%)", Valor: data.summary.payBottom25Share },
      ];

      const binsRows = data.bins.map((bin) => ({
        Rango: bin.label,
        Rutas: bin.routeCount,
        FuerzaPct: bin.percentOfForce,
      }));

      const productRows = data.productBands.map((row) => ({
        ProductName: row.productName,
        Rutas: row.totalRoutes,
        Payout_0_30_pct: row.totalRoutes ? (row.payout_0_30 / row.totalRoutes) * 100 : 0,
        Payout_31_60_pct: row.totalRoutes ? (row.payout_31_60 / row.totalRoutes) * 100 : 0,
        Payout_61_90_pct: row.totalRoutes ? (row.payout_61_90 / row.totalRoutes) * 100 : 0,
        Payout_90_100_pct: row.totalRoutes ? (row.payout_90_100 / row.totalRoutes) * 100 : 0,
        Payout_101_150_pct: row.totalRoutes ? (row.payout_101_150 / row.totalRoutes) * 100 : 0,
        Payout_151_200_pct: row.totalRoutes ? (row.payout_151_200 / row.totalRoutes) * 100 : 0,
        Payout_201_250_pct: row.totalRoutes ? (row.payout_201_250 / row.totalRoutes) * 100 : 0,
        Coverage_0_30_pct: row.totalRoutes ? (row.coverage_0_30 / row.totalRoutes) * 100 : 0,
        Coverage_31_60_pct: row.totalRoutes ? (row.coverage_31_60 / row.totalRoutes) * 100 : 0,
        Coverage_61_90_pct: row.totalRoutes ? (row.coverage_61_90 / row.totalRoutes) * 100 : 0,
        Coverage_90_100_pct: row.totalRoutes ? (row.coverage_90_100 / row.totalRoutes) * 100 : 0,
        Coverage_101_150_pct: row.totalRoutes ? (row.coverage_101_150 / row.totalRoutes) * 100 : 0,
        Coverage_151_200_pct: row.totalRoutes ? (row.coverage_151_200 / row.totalRoutes) * 100 : 0,
        Coverage_201_250_pct: row.totalRoutes ? (row.coverage_201_250 / row.totalRoutes) * 100 : 0,
      }));

      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Resumen");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(binsRows), "Payout Distribution");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productRows), "Producto Heatmap");

      const periodLabel = data.selectedPeriods.join("_") || "periodo";
      XLSX.writeFile(workbook, `performance_report_${periodLabel}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4">
      <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#475467]">
            Seleccion de periodos
          </p>
          {loading ? <p className="text-xs text-[#667085]">Actualizando...</p> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["month", "quarter", "semester", "year"] as GroupMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupMode(mode)}
              className={
                groupMode === mode
                  ? "rounded-md border border-[#bfd3ff] bg-[#eaf2ff] px-3 py-1.5 text-xs font-semibold text-[#002b7f]"
                  : "rounded-md border border-[#d0d5dd] bg-white px-3 py-1.5 text-xs font-medium text-[#344054] hover:bg-[#f8fafc]"
              }
            >
              {mode === "month"
                ? "Meses"
                : mode === "quarter"
                  ? "Quarters"
                  : mode === "semester"
                    ? "Semesters"
                    : "Years"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {periodGroups.map((group) => {
            const active = effectiveSelectedGroupKeys.includes(group.key);
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => toggleGroupKey(group.key)}
                className={
                  active
                    ? "rounded-md border border-[#bfd3ff] bg-[#eaf2ff] px-3 py-1.5 text-xs font-semibold text-[#002b7f]"
                    : "rounded-md border border-[#d0d5dd] bg-white px-3 py-1.5 text-xs font-medium text-[#344054] hover:bg-[#f8fafc]"
                }
              >
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#1e3a8a]">Filtros</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportReportExcel}
              disabled={exporting || loading}
              className="rounded-md border border-[#1d4ed8] bg-[#eaf2ff] px-2.5 py-1 text-xs font-semibold text-[#1d4ed8] hover:bg-[#dbeafe] disabled:opacity-60"
            >
              {exporting ? "Exportando..." : "Exportar"}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-[#d0d5dd] bg-white px-2.5 py-1 text-xs text-[#344054] hover:bg-[#f8fafc]"
            >
              Limpiar
            </button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a]"
          >
            <option value="">Todos los team_id</option>
            {data.filterOptions.teamIds.map((option) => (
              <option key={`team-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={linea}
            onChange={(event) => setLinea(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a]"
          >
            <option value="">Todas las lineas</option>
            {data.filterOptions.lineas.map((option) => (
              <option key={`linea-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a]"
          >
            <option value="">Todos los productos</option>
            {data.filterOptions.productNames.map((option) => (
              <option key={`product-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={manager}
            onChange={(event) => setManager(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a]"
          >
            <option value="">Todos los managers</option>
            {data.filterOptions.managers.map((option) => (
              <option key={`manager-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs text-[#667085]">
            Rutas unicas
            <InfoTooltip text="Conteo de rutas unicas usando representante (o ruta si representante esta vacio), despues de aplicar periodos y filtros." />
          </p>
          <p className="mt-1 text-xl font-semibold text-[#0f172a]">{data.summary.routeCount}</p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs text-[#667085]">
            Cobertura global
            <InfoTooltip text="(Suma pagoresultado / Suma pagovariable) x 100, agregado al nivel de rutas filtradas." />
          </p>
          <p className="mt-1 text-xl font-semibold text-[#0f172a]">
            {formatPercent(data.summary.overallCoverage)}
          </p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs text-[#667085]">
            Pay to bottom 10%
            <InfoTooltip text="Se ordenan rutas por payout coverage ascendente. Se toma el 10% inferior y se calcula su share del payout total: (payout bottom 10 / payout total) x 100." />
          </p>
          <p className="mt-1 text-xl font-semibold text-[#0f172a]">
            {formatPercent(data.summary.payBottom10Share)}
          </p>
          <p className="text-[11px] text-[#98a2b3]">Target recomendado &lt; 5%</p>
        </div>
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs text-[#667085]">
            Pay to bottom 25%
            <InfoTooltip text="Misma logica del bottom 10, pero con el 25% inferior de rutas por payout coverage." />
          </p>
          <p className="mt-1 text-xl font-semibold text-[#0f172a]">
            {formatPercent(data.summary.payBottom25Share)}
          </p>
          <p className="text-[11px] text-[#98a2b3]">Target recomendado &lt; 12%</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-[#1e3a8a]">Payout Distribution</p>
        <p className="mt-1 text-xs text-[#667085]">
          Eje X: payout coverage (%). Eje Y: porcentaje de fuerza de campo (% rutas unicas).
        </p>

        <div className="mt-3 h-[24rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                angle={-70}
                textAnchor="end"
                height={70}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                width={64}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => {
                  if (name === "percentOfForce") {
                    return [`${Number(value).toFixed(2)}%`, "% Field Force"];
                  }
                  return [String(value), "Rutas"];
                }}
                labelFormatter={(label, payload) => {
                  const current = payload?.[0]?.payload as ChartRow | undefined;
                  if (!current) return String(label);
                  return `Coverage ${label} | Rutas: ${current.routeCount}`;
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="percentOfForce" name="percentOfForce" radius={[4, 4, 0, 0]}>
                {chartRows.map((row) => (
                  <Cell key={`cell-${row.key}`} fill={getCoverageColor(row)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-[#1e3a8a]">Situational assessment</p>
        <ul className="mt-2 space-y-1 text-sm text-[#475467]">
          <li>
            Total payout analizado: <span className="font-semibold">{formatCurrency(data.summary.totalPayout)}</span>
          </li>
          <li>
            Base variable analizada: <span className="font-semibold">{formatCurrency(data.summary.totalVariable)}</span>
          </li>
          <li>
            Cobertura mediana: <span className="font-semibold">{formatPercent(data.summary.medianCoverage)}</span>
          </li>
          <li>
            Cobertura promedio: <span className="font-semibold">{formatPercent(data.summary.averageCoverage)}</span>
          </li>
        </ul>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
          <p className="text-sm font-semibold text-[#1e3a8a]">Payout distribution by #reps</p>
          <ul className="mt-2 space-y-1 text-sm text-[#475467]">
            <li>
              % reps with no payout:{" "}
              <span className="font-semibold">
                {formatCountWithPercent(data.summary.noPayoutCount, data.summary.noPayoutPercent)}
              </span>
            </li>
            <li>
              % reps below target payout:{" "}
              <span className="font-semibold">
                {formatCountWithPercent(data.summary.belowTargetCount, data.summary.belowTargetPercent)}
              </span>
            </li>
            <li>
              % reps above target payout:{" "}
              <span className="font-semibold">
                {formatCountWithPercent(data.summary.aboveTargetCount, data.summary.aboveTargetPercent)}
              </span>
            </li>
            <li>
              % reps above 200% payout:{" "}
              <span className="font-semibold">
                {formatCountWithPercent(data.summary.above200Count, data.summary.above200Percent)}
              </span>
            </li>
            <li>
              % reps hitting the cap:{" "}
              <span className="font-semibold">
                {formatCountWithPercent(data.summary.hittingCapCount, data.summary.hittingCapPercent)}
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
          <p className="text-sm font-semibold text-[#1e3a8a]">Low performers</p>
          <ul className="mt-2 space-y-1 text-sm text-[#475467]">
            <li>
              # reps in bottom 10%: <span className="font-semibold">{data.summary.bottom10Count}</span>
            </li>
            <li>
              # reps in bottom 20%: <span className="font-semibold">{data.summary.bottom20Count}</span>
            </li>
            <li>
              # reps in bottom 30%: <span className="font-semibold">{data.summary.bottom30Count}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
          <p className="text-sm font-semibold text-[#1e3a8a]">High performers</p>
          <ul className="mt-2 space-y-1 text-sm text-[#475467]">
            <li>
              # reps at/above 100% payout:{" "}
              <span className="font-semibold">{data.summary.atOrAbove100Count}</span>
            </li>
            <li>
              # reps at/above 200% payout:{" "}
              <span className="font-semibold">{data.summary.atOrAbove200Count}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-[#1e3a8a]">
          Distribucion Por Producto (Heatmap)
        </p>
        <p className="mt-1 text-xs text-[#667085]">
          Muestra porcentaje de rutas por rango. Formula por celda: (rutas en rango / total rutas del producto) x 100.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-[#d0d5dd] bg-white p-1">
          <button
            type="button"
            onClick={() => setBandMetric("payout")}
            className={
              bandMetric === "payout"
                ? "rounded-md bg-[#eaf2ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]"
                : "rounded-md px-3 py-1 text-xs font-medium text-[#344054] hover:bg-[#f8fafc]"
            }
          >
            Payout
          </button>
          <button
            type="button"
            onClick={() => setBandMetric("coverage")}
            className={
              bandMetric === "coverage"
                ? "rounded-md bg-[#eaf2ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]"
                : "rounded-md px-3 py-1 text-xs font-medium text-[#344054] hover:bg-[#f8fafc]"
            }
          >
            Coverage
          </button>
        </div>

        <div className="mt-3 max-h-[58vh] overflow-auto">
          <table className="w-full table-auto text-xs text-[#344054]">
            <thead className="sticky top-0 z-10 bg-[#f8fbff]">
              <tr className="border-b border-[#e5e7eb] text-left uppercase tracking-wide text-[#475467]">
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Rutas</th>
                <th className="px-2 py-2">0-30</th>
                <th className="px-2 py-2">31-60</th>
                <th className="px-2 py-2">61-90</th>
                <th className="px-2 py-2">90-100</th>
                <th className="px-2 py-2">101-150</th>
                <th className="px-2 py-2">151-200</th>
                <th className="px-2 py-2">201-250</th>
              </tr>
            </thead>
            <tbody>
              {data.productBands.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-3 text-[#98a2b3]">
                    Sin datos para la distribucion por producto.
                  </td>
                </tr>
              ) : (
                data.productBands.map((row) => (
                  <tr key={`product-band-${row.productName}`} className="border-b border-[#eef2fb]">
                    <td className="px-2 py-2 font-medium text-[#0f172a]">{row.productName}</td>
                    <td className="px-2 py-2">{row.totalRoutes}</td>
                    {getBandPercents(row, bandMetric).map((item, index) => (
                      <td
                        key={`${row.productName}-${bandMetric}-${index}`}
                        className="px-2 py-2 font-semibold"
                        style={{ backgroundColor: heatColor(item.percent), color: heatTextColor(item.percent) }}
                        title={`${item.count}/${row.totalRoutes} rutas`}
                      >
                        {item.percent.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#fecdca] bg-[#fff6f5] p-4 sm:p-5">
          <p className="text-sm text-[#7a271a]">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
