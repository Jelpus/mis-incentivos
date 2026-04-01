"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResultadoPeriodSummary } from "@/lib/results/get-resultados-v2-data";

type ResultadosTrendChartProps = {
  periods: ResultadoPeriodSummary[];
};

type ChartRow = {
  periodCode: string;
  periodLabel: string;
  pagoResultado: number;
  baseIncentivos: number;
  cobertura: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPeriodo(periodCode: string) {
  if (!/^\d{6}$/.test(periodCode)) return periodCode;
  const year = Number(periodCode.slice(0, 4));
  const month = Number(periodCode.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" }).format(date);
}

export function ResultadosTrendChart({ periods }: ResultadosTrendChartProps) {
  const rows: ChartRow[] = [...periods]
    .sort((a, b) => a.periodCode.localeCompare(b.periodCode))
    .map((item) => ({
      periodCode: item.periodCode,
      periodLabel: formatPeriodo(item.periodCode),
      pagoResultado: item.totalPagoResultado,
      baseIncentivos: item.totalPagoVariable,
      cobertura: item.avgCobertura,
    }));

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
        <p className="text-sm text-[#64748b]">Sin datos suficientes para tendencia.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1e3a8a]">Tendencia por periodo</p>
      <p className="mt-1 text-xs text-[#667085]">
        Pago resultado (linea continua) vs base incentivos (linea punteada).
      </p>
      <div className="mt-3 h-[18rem] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
            <XAxis dataKey="periodLabel" tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(value) => formatCurrency(Number(value))}
              width={88}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const amount = Number(value ?? 0);
                if (name === "baseIncentivos") return [formatCurrency(amount), "Base incentivos"];
                return [formatCurrency(amount), "Pago resultado"];
              }}
              labelFormatter={(label, payload) => {
                const current = payload?.[0]?.payload as ChartRow | undefined;
                if (!current) return String(label);
                return `${label} | Cobertura: ${formatPercent(current.cobertura)}`;
              }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                fontSize: 12,
              }}
            />
            <Legend
              formatter={(value) =>
                value === "baseIncentivos" ? "Base incentivos" : "Pago resultado"
              }
            />
            <Line
              type="monotone"
              dataKey="pagoResultado"
              name="pagoResultado"
              stroke="#1d4ed8"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: "#1d4ed8" }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="baseIncentivos"
              name="baseIncentivos"
              stroke="#0f766e"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 2, fill: "#0f766e" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
