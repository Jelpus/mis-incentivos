"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResultadoRecord } from "@/lib/results/get-resultados-v2-data";

type DetailLevel = "basic" | "team" | "full";

type ResultadosGraphProps = {
  rows: ResultadoRecord[];
  title?: string;
  detailLevel?: DetailLevel;
  periodCode?: string | null;
};

type ProductAggregate = {
  label: string;
  pagoCalculado: number;
  parrillaPago: number;
};

type ProductSeries = {
  key: string;
  label: string;
  color: string;
  pagoCalculado: number;
  parrillaPago: number;
};

type ChartRow = {
  name: string;
  baseIncentivos: number;
  [key: string]: string | number;
};

const PRODUCT_COLORS = [
  "#d29a12",
  "#8f5aa8",
  "#22a06b",
  "#2563eb",
  "#d9463e",
  "#0ea5a4",
  "#f59e0b",
  "#64748b",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyCompact(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function safeLabel(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "Sin producto";
}

function toPositiveNumber(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return numeric > 0 ? numeric : 0;
}

function buildChartData(rows: ResultadoRecord[]) {
  const byProduct = new Map<string, ProductAggregate>();

  for (const row of rows) {
    const label = safeLabel(row.productName);
    const pagoCalculado = toPositiveNumber(row.pagoResultado);
    const parrillaPago = toPositiveNumber(row.pagoVariable);
    if (pagoCalculado <= 0 && parrillaPago <= 0) continue;

    const current = byProduct.get(label) ?? {
      label,
      pagoCalculado: 0,
      parrillaPago: 0,
    };
    current.pagoCalculado += pagoCalculado;
    current.parrillaPago += parrillaPago;
    byProduct.set(label, current);
  }

  const products = Array.from(byProduct.values()).sort(
    (a, b) => b.pagoCalculado - a.pagoCalculado || b.parrillaPago - a.parrillaPago,
  );

  const series: ProductSeries[] = products.map((product, index) => ({
    key: `product_${index}`,
    label: product.label,
    color: PRODUCT_COLORS[index % PRODUCT_COLORS.length],
    pagoCalculado: product.pagoCalculado,
    parrillaPago: product.parrillaPago,
  }));

  const totalBase = series.reduce((acc, item) => acc + item.parrillaPago, 0);

  const pagoCalculadoRow: ChartRow = { name: "Pago calculado", baseIncentivos: 0 };
  const parrillaPagoRow: ChartRow = { name: "Parrilla de pago", baseIncentivos: 0 };
  const baseRow: ChartRow = { name: "Base de incentivos", baseIncentivos: totalBase };

  for (const item of series) {
    pagoCalculadoRow[item.key] = item.pagoCalculado;
    parrillaPagoRow[item.key] = item.parrillaPago;
    baseRow[item.key] = 0;
  }

  const chartRows = [pagoCalculadoRow, parrillaPagoRow, baseRow];
  return { chartRows, series, totalBase };
}

function TooltipContent({
  active,
  payload,
  label,
  productLabelByKey,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | string; color?: string }>;
  label?: string | number;
  productLabelByKey: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;

  const filtered = payload.filter((entry) => Number(entry.value ?? 0) > 0);
  if (!filtered.length) return null;

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 text-xs shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <p className="mb-2 font-semibold text-[#0f172a]">{String(label ?? "")}</p>
      <div className="space-y-1.5">
        {filtered.map((entry) => {
          const key = String(entry.dataKey ?? "");
          const value = Number(entry.value ?? 0);
          const labelText =
            key === "baseIncentivos"
              ? "Base de incentivos"
              : productLabelByKey[key] ?? key;

          return (
            <div key={`${key}-${labelText}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: entry.color ?? "#94a3b8" }}
                />
                <span className="text-[#475467]">{labelText}</span>
              </div>
              <span className="font-semibold text-[#0f172a]">{formatCurrency(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SegmentLabel({
  x,
  y,
  width,
  height,
  value,
  textColor,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
  textColor: string;
}) {
  const numericValue = Number(value ?? 0);
  const xNum = Number(x ?? 0);
  const yNum = Number(y ?? 0);
  const widthNum = Number(width ?? 0);
  const heightNum = Number(height ?? 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) return null;
  if (!Number.isFinite(widthNum) || !Number.isFinite(heightNum)) return null;
  if (widthNum < 56 || heightNum < 14) return null;

  const cx = xNum + widthNum / 2;
  const cy = yNum + heightNum / 2;

  return (
    <text
      x={cx}
      y={cy}
      fill={textColor}
      fontSize={10}
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="central"
      pointerEvents="none"
    >
      {formatCurrencyCompact(numericValue)}
    </text>
  );
}

export function ResultadosGraph({
  rows,
  title = "Visualiza tu pago",
}: ResultadosGraphProps) {
  const { chartRows, series, totalBase } = buildChartData(rows);
  const hasData = series.some(
    (item) => item.pagoCalculado > 0 || item.parrillaPago > 0,
  ) || totalBase > 0;

  if (!rows.length || !hasData) {
    return (
      <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
        <p className="mt-2 text-sm text-[#64748b]">Sin datos para visualizar el pago.</p>
      </div>
    );
  }

  const productLabelByKey = Object.fromEntries(
    series.map((item) => [item.key, item.label]),
  );

  const visibleLegendItems = series.filter(
    (item) => item.pagoCalculado > 0 || item.parrillaPago > 0,
  );

  return (
    <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>
      <div className="mt-3 h-[18rem] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartRows}
            layout="vertical"
            margin={{ top: 8, right: 20, left: 12, bottom: 8 }}
            barCategoryGap={20}
          >
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(value) => formatCurrency(Number(value))}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 12, fill: "#344054" }}
            />
            <Tooltip
              content={
                <TooltipContent productLabelByKey={productLabelByKey} />
              }
            />

            <Bar dataKey="baseIncentivos" stackId="pago" fill="#0b2a6f" radius={[4, 4, 4, 4]}>
              <LabelList content={(props) => <SegmentLabel {...props} textColor="#ffffff" />} />
            </Bar>
            {series.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId="pago"
                fill={item.color}
                radius={[4, 4, 4, 4]}
              >
                <LabelList
                  content={(props) => (
                    <SegmentLabel
                      {...props}
                      textColor={item.color === "#d4b26a" ? "#111827" : "#ffffff"}
                    />
                  )}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {visibleLegendItems.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#475467]">
          {visibleLegendItems.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
