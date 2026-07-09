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
  yAverage?: number | null;
  defaultXMetric: "cpd" | "cpa_t1";
  message: string | null;
};

type XMetricFormat = "number" | "percent";
export type ScatterReferenceMode = "average" | "target" | "both";

type ResultadosScatterGraphProps = {
  title?: string;
  data: ResultadosScatterGraphData | null;
  xLabels?: {
    cpd?: string;
    cpaT1?: string;
  };
  xFormats?: {
    cpd?: XMetricFormat;
    cpaT1?: XMetricFormat;
  };
  showReferenceText?: boolean;
  showLowerLeftList?: boolean;
  lowerLeftTitle?: string;
  showReferenceModeControl?: boolean;
  xTarget?: number;
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

function formatXAxisTick(value: number, format: XMetricFormat): string {
  if (!Number.isFinite(value)) return format === "percent" ? "0%" : "0";
  if (format === "percent") {
    return `${Math.round(value)}%`;
  }
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatMetricValue(value: number, format: XMetricFormat): string {
  if (!Number.isFinite(value)) return "-";
  if (format === "percent") return `${value.toFixed(1)}%`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function getReferenceModeLabel(mode: ScatterReferenceMode): string {
  if (mode === "target") return "vs 100%";
  if (mode === "both") return "Ambos";
  return "vs Promedio";
}

function getXAxisDomain(values: number[], format: XMetricFormat): [number, number] {
  if (values.length === 0) return format === "percent" ? [0, 120] : [0, 10];
  if (format === "percent") {
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
  xFormat,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  xLabel: string;
  xFormat: XMetricFormat;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload as ResultadosScatterPoint & { x: number };
  return (
    <div className="rounded-lg border border-[#d9e5fb] bg-white px-3 py-2 text-xs text-[#334155] shadow-sm">
      <p className="font-semibold text-[#1e3a8a]">{point.label}</p>
      <p className="mt-1">{xLabel}: {formatMetricValue(point.x, xFormat)}</p>
      <p>Coverage: {point.y.toFixed(1)}%</p>
    </div>
  );
}

export function ResultadosScatterGraph({
  title = "Attainment vs CPD/CPA - Quadrant Analysis",
  data,
  xLabels,
  xFormats,
  showReferenceText = false,
  showLowerLeftList = false,
  lowerLeftTitle = "Por debajo de ambos promedios",
  showReferenceModeControl = false,
  xTarget = 100,
}: ResultadosScatterGraphProps) {
  const safeData: ResultadosScatterGraphData = data ?? {
    points: [],
    yTarget: 100,
    yAverage: null,
    defaultXMetric: "cpd",
    message: null,
  };
  const [xMetric, setXMetric] = useState<"cpd" | "cpa_t1">(safeData.defaultXMetric);
  const [referenceMode, setReferenceMode] = useState<ScatterReferenceMode>(
    showReferenceModeControl ? "both" : "average",
  );

  const hasCpd = safeData.points.some((point) => Number.isFinite(point.cpd ?? NaN));
  const hasCpaT1 = safeData.points.some((point) => Number.isFinite(point.cpaT1 ?? NaN));
  const effectiveMetric = xMetric === "cpd" && !hasCpd ? "cpa_t1" : xMetric;
  const xLabel = effectiveMetric === "cpd"
    ? (xLabels?.cpd ?? "CPD")
    : (xLabels?.cpaT1 ?? "CPA T1 (%)");
  const xFormat = effectiveMetric === "cpd"
    ? (xFormats?.cpd ?? "number")
    : (xFormats?.cpaT1 ?? "percent");
  const cpdButtonLabel = xFormats?.cpd === "percent" ? "CPD %" : "CPD";

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
  const yAverage = Number(safeData.yAverage ?? NaN);
  const usesAverageYDivider = Number.isFinite(yAverage);
  const averageYDivider = usesAverageYDivider ? clampCoverage(yAverage) : safeData.yTarget;
  const targetYDivider = clampCoverage(safeData.yTarget);
  const effectiveReferenceMode = showReferenceModeControl ? referenceMode : "average";
  const xDivider =
    effectiveReferenceMode === "target"
      ? xTarget
      : effectiveReferenceMode === "both"
        ? Math.max(xMean, xTarget)
        : xMean;
  const yDivider =
    effectiveReferenceMode === "target"
      ? targetYDivider
      : effectiveReferenceMode === "both"
        ? Math.max(averageYDivider, targetYDivider)
        : averageYDivider;
  const shouldShowAverageReference = effectiveReferenceMode === "average" || effectiveReferenceMode === "both";
  const shouldShowTargetReference = effectiveReferenceMode === "target" || effectiveReferenceMode === "both";
  const xDomainValues = [
    ...xValues,
    shouldShowAverageReference ? xMean : null,
    shouldShowTargetReference ? xTarget : null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const [xMin, xMax] = getXAxisDomain(xDomainValues, xFormat);
  const lowerLeftPoints = showLowerLeftList
    ? plottedPoints
        .filter((point) => point.x < xDivider && point.y < yDivider)
        .sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.label.localeCompare(b.label, "es"))
    : [];

  return (
    <section className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
      <p className="mt-1 text-xs text-[#667085]">
        Eje X: {xLabel} | Eje Y: Cobertura (%)
      </p>
      {showReferenceText ? (
        <p className="mt-1 text-xs text-[#667085]">
          Cortes activos: {getReferenceModeLabel(effectiveReferenceMode)}. Referencia efectiva:{" "}
          {formatMetricValue(xDivider, xFormat)} en {xLabel} y {yDivider.toFixed(1)}% en cobertura.
        </p>
      ) : null}
      {hasCpd || hasCpaT1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-[#d0d5dd] bg-white p-1">
            <button
              type="button"
              onClick={() => setXMetric("cpd")}
              disabled={!hasCpd}
              className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition ${
                effectiveMetric === "cpd"
                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                  : "text-[#334155] hover:bg-[#f8fafc]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {cpdButtonLabel}
            </button>
            <button
              type="button"
              onClick={() => setXMetric("cpa_t1")}
              disabled={!hasCpaT1}
              className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition ${
                effectiveMetric === "cpa_t1"
                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                  : "text-[#334155] hover:bg-[#f8fafc]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              CPA T1
            </button>
          </div>
          {showReferenceModeControl ? (
            <div className="inline-flex rounded-lg border border-[#d0d5dd] bg-white p-1">
              {(["average", "target", "both"] as ScatterReferenceMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setReferenceMode(mode)}
                  className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition ${
                    referenceMode === mode
                      ? "bg-[#eef2ff] text-[#3730a3]"
                      : "text-[#334155] hover:bg-[#f8fafc]"
                  }`}
                >
                  {getReferenceModeLabel(mode)}
                </button>
              ))}
            </div>
          ) : null}
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
              tickFormatter={(value) => formatXAxisTick(Number(value), xFormat)}
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
            <Tooltip content={<ScatterTooltip xLabel={xLabel} xFormat={xFormat} />} />
            {shouldShowAverageReference ? (
              <ReferenceLine
                y={averageYDivider}
                stroke="#6b7280"
                strokeDasharray="5 5"
                label={{
                  value: usesAverageYDivider ? "Media cobertura" : "Cobertura objetivo",
                  position: "insideTopLeft",
                  fill: "#475467",
                  fontSize: 11,
                }}
              />
            ) : null}
            {shouldShowAverageReference ? (
              <ReferenceLine
                x={xMean}
                stroke="#6b7280"
                strokeDasharray="5 5"
                label={{ value: `Media ${xLabel}`, position: "insideTopRight", fill: "#475467", fontSize: 11 }}
              />
            ) : null}
            {shouldShowTargetReference ? (
              <ReferenceLine
                y={targetYDivider}
                stroke="#2563eb"
                strokeDasharray="2 4"
                label={{ value: "100% cobertura", position: "insideBottomLeft", fill: "#1d4ed8", fontSize: 11 }}
              />
            ) : null}
            {shouldShowTargetReference ? (
              <ReferenceLine
                x={xTarget}
                stroke="#2563eb"
                strokeDasharray="2 4"
                label={{ value: `100% ${xLabel}`, position: "insideBottomRight", fill: "#1d4ed8", fontSize: 11 }}
              />
            ) : null}
            <Scatter data={plottedPoints} shape={(props: { cx?: number; cy?: number; payload?: ResultadosScatterPoint }) => {
              const { cx = 0, cy = 0, payload } = props;
              const px = Number((payload as (ResultadosScatterPoint & { x?: number }) | undefined)?.x ?? NaN);
              const py = Number(payload?.y ?? NaN);
              const color =
                Number.isFinite(px) && Number.isFinite(py)
                  ? getQuadrantColor(px, py, xDivider, yDivider)
                  : (payload?.color ?? "#2563eb");
              return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#ffffff" strokeWidth={1.5} />;
            }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {showLowerLeftList ? (
        <div className="mt-4 border-t border-[#e3ebfa] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#1e3a8a]">{lowerLeftTitle}</p>
            <p className="text-xs font-medium text-[#667085]">{lowerLeftPoints.length} ruta(s)</p>
          </div>
          {lowerLeftPoints.length > 0 ? (
            <div className="mt-3 max-h-64 overflow-auto">
              <table className="w-full table-auto text-xs text-[#344054]">
                <thead className="sticky top-0 bg-[#f8fbff] text-left uppercase tracking-wide text-[#475467]">
                  <tr className="border-b border-[#e5e7eb]">
                    <th className="px-2 py-2">Ruta</th>
                    <th className="px-2 py-2 text-right">{xLabel}</th>
                    <th className="px-2 py-2 text-right">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {lowerLeftPoints.map((point) => (
                    <tr key={`lower-left-${effectiveMetric}-${point.id}`} className="border-b border-[#eef2fb]">
                      <td className="max-w-[18rem] truncate px-2 py-2 font-medium text-[#0f172a]" title={point.label}>
                        {point.label}
                      </td>
                      <td className="px-2 py-2 text-right">{formatMetricValue(point.x, xFormat)}</td>
                      <td className="px-2 py-2 text-right">{point.y.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#667085]">Sin rutas en el cuadrante abajo izquierdo.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
