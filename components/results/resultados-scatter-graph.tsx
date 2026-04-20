"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ResultadosScatterPoint = {
  id: string;
  label: string;
  cpd: number | null;
  cpaT1: number | null;
  y: number;
  color: string;
};

export type ResultadosScatterGraphData = {
  points: ResultadosScatterPoint[];
  yTarget: number;
  defaultXMetric: "cpd" | "cpa_t1";
  message: string | null;
};

type ResultadosScatterGraphProps = {
  title?: string;
  data: ResultadosScatterGraphData | null;
  xLabels?: {
    cpd?: string;
    cpaT1?: string;
  };
};

function domainWithPadding(values: number[], fallbackMin: number, fallbackMax: number): [number, number] {
  if (values.length === 0) return [fallbackMin, fallbackMax];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const pad = Math.max(range * 0.12, 0.6);
  return [Math.max(0, min - pad), max + pad];
}

function clampCoverage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 400) return 400;
  return value;
}

function formatXAxisTick(value: number, metric: "cpd" | "cpa_t1"): string {
  if (!Number.isFinite(value)) return metric === "cpd" ? "0" : "0%";
  if (metric === "cpa_t1") {
    return `${Math.round(value)}%`;
  }
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function getXAxisDomain(values: number[], metric: "cpd" | "cpa_t1"): [number, number] {
  if (values.length === 0) return metric === "cpa_t1" ? [0, 120] : [0, 10];
  if (metric === "cpa_t1") {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const xMin = Math.max(0, min - 20);
    const xMax = max + 20;
    if (xMax <= xMin) return [xMin, xMin + 20];
    return [xMin, xMax];
  }
  const [, xMax] = domainWithPadding(values, 0, 10);
  return [0, xMax];
}

function getQuadrantColor(x: number, y: number, xDivider: number, yDivider: number): string {
  const isTop = y >= yDivider;
  const isRight = x >= xDivider;
  if (isTop && !isRight) return "#f59e0b"; // izquierda arriba: amarillo
  if (isTop && isRight) return "#16a34a"; // derecha arriba: verde
  if (!isTop && !isRight) return "#dc2626"; // izquierda abajo: rojo
  return "#f59e0b"; // derecha abajo: amarillo
}

type TooltipPayload = {
  payload?: ResultadosScatterPoint;
};

function ScatterTooltip({
  active,
  payload,
  xLabel,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  xLabel: string;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload as ResultadosScatterPoint & { x: number };
  return (
    <div className="rounded-lg border border-[#d9e5fb] bg-white px-3 py-2 text-xs text-[#334155] shadow-sm">
      <p className="font-semibold text-[#1e3a8a]">{point.label}</p>
      <p className="mt-1">{xLabel}: {point.x.toFixed(2)}</p>
      <p>Coverage: {point.y.toFixed(1)}%</p>
    </div>
  );
}

export function ResultadosScatterGraph({
  title = "Attainment vs CPD/CPA - Quadrant Analysis",
  data,
  xLabels,
}: ResultadosScatterGraphProps) {
  const safeData: ResultadosScatterGraphData = data ?? {
    points: [],
    yTarget: 100,
    defaultXMetric: "cpd",
    message: null,
  };
  const [xMetric, setXMetric] = useState<"cpd" | "cpa_t1">(safeData.defaultXMetric);

  const hasCpd = safeData.points.some((point) => Number.isFinite(point.cpd ?? NaN));
  const hasCpaT1 = safeData.points.some((point) => Number.isFinite(point.cpaT1 ?? NaN));
  const effectiveMetric = xMetric === "cpd" && !hasCpd ? "cpa_t1" : xMetric;
  const xLabel = effectiveMetric === "cpd"
    ? (xLabels?.cpd ?? "CPD")
    : (xLabels?.cpaT1 ?? "CPA T1 (%)");

  const plottedPoints = useMemo(
    () =>
      safeData.points
        .map((point) => ({
          ...point,
          x: effectiveMetric === "cpd" ? Number(point.cpd ?? NaN) : Number(point.cpaT1 ?? NaN),
          y: clampCoverage(Number(point.y ?? 0)),
        }))
        .filter((point) => Number.isFinite(point.x)),
    [safeData.points, effectiveMetric],
  );

  if (!data) return null;

  if (plottedPoints.length === 0) {
    return (
      <section className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
        <p className="mt-2 text-sm text-[#475467]">
          {data.message ?? "No hay datos suficientes para construir la grafica."}
        </p>
      </section>
    );
  }

  const xValues = plottedPoints.map((point) => point.x);
  const xMean = xValues.length > 0 ? xValues.reduce((sum, value) => sum + value, 0) / xValues.length : 0;
  const [xMin, xMax] = getXAxisDomain(xValues, effectiveMetric);

  return (
    <section className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
      <p className="mt-1 text-xs text-[#667085]">
        Eje X: {xLabel} | Eje Y: Cobertura (%)
      </p>
      {hasCpd || hasCpaT1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setXMetric("cpd")}
            disabled={!hasCpd}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              effectiveMetric === "cpd"
                ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]"
                : "border-[#d0d5dd] bg-white text-[#334155] hover:bg-[#f8fafc]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            CPD
          </button>
          <button
            type="button"
            onClick={() => setXMetric("cpa_t1")}
            disabled={!hasCpaT1}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              effectiveMetric === "cpa_t1"
                ? "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]"
                : "border-[#d0d5dd] bg-white text-[#334155] hover:bg-[#f8fafc]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            CPA T1
          </button>
        </div>
      ) : null}
      {data.message ? (
        <p className="mt-2 rounded-lg border border-[#d9e5fb] bg-[#f8fbff] px-3 py-2 text-xs text-[#475467]">
          {data.message}
        </p>
      ) : null}

      <div className="mt-4 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 20, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#e7edf9" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={[xMin, xMax]}
              tickFormatter={(value) => formatXAxisTick(Number(value), effectiveMetric)}
              tick={{ fontSize: 12, fill: "#475467" }}
              stroke="#98a2b3"
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Cobertura"
              domain={[0, 400]}
              ticks={[0, 100, 200, 300, 400]}
              tickFormatter={(value) => `${Number(value)}%`}
              tick={{ fontSize: 12, fill: "#475467" }}
              stroke="#98a2b3"
            />
            <Tooltip content={<ScatterTooltip xLabel={xLabel} />} />
            <ReferenceLine
              y={data.yTarget}
              stroke="#6b7280"
              strokeDasharray="5 5"
              label={{ value: "Cobertura objetivo 100%", position: "insideTopLeft", fill: "#475467", fontSize: 11 }}
            />
            <ReferenceLine
              x={xMean}
              stroke="#6b7280"
              strokeDasharray="5 5"
              label={{ value: `Media ${xLabel}`, position: "insideTopRight", fill: "#475467", fontSize: 11 }}
            />
            <Scatter data={plottedPoints} shape={(props: { cx?: number; cy?: number; payload?: ResultadosScatterPoint }) => {
              const { cx = 0, cy = 0, payload } = props;
              const px = Number((payload as (ResultadosScatterPoint & { x?: number }) | undefined)?.x ?? NaN);
              const py = Number(payload?.y ?? NaN);
              const color =
                Number.isFinite(px) && Number.isFinite(py)
                  ? getQuadrantColor(px, py, xMean, safeData.yTarget)
                  : (payload?.color ?? "#2563eb");
              return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#ffffff" strokeWidth={1.5} />;
            }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

