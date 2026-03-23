"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PayCurvePoint = {
  cobertura: number;
  pago: number;
};

type PayCurveChartProps = {
  points: PayCurvePoint[];
};

function formatNumber(value: number): string {
  return value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toSafeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PayCurveChart({ points }: PayCurveChartProps) {
  return (
    <div className="h-[24rem] w-full rounded-2xl border border-neutral-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 20, left: 6, bottom: 10 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis
            dataKey="cobertura"
            type="number"
            domain={[0, 1.8]}
            tickCount={10}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(value) => formatNumber(Number(value))}
            label={{ value: "Cobertura (x)", position: "insideBottom", offset: -6, fill: "#475569", fontSize: 11 }}
          />
          <YAxis
            type="number"
            domain={[0, 1.6]}
            tickCount={9}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(value) => formatNumber(Number(value))}
            label={{ value: "Factor de pago (y)", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              formatNumber(toSafeNumber(value)),
              name === "pago" ? "Factor pago" : "Cobertura",
            ]}
            labelFormatter={(value: unknown) => `Cobertura: ${formatNumber(toSafeNumber(value))}`}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="pago"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: "#1d4ed8", stroke: "#dbeafe", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
