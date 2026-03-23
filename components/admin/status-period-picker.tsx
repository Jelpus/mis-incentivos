"use client";

import { useRef } from "react";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";

type Props = {
  value: string; // YYYY-MM
  paramName?: string;
  preserveParams?: Record<string, string | null | undefined>;
  options?: string[]; // YYYY-MM
};

export function StatusPeriodPicker({
  value,
  paramName = "period",
  preserveParams = {},
  options,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const useSelect = Array.isArray(options) && options.length > 0;

  return (
    <form ref={formRef} className="flex items-center gap-2" method="get">
      {Object.entries(preserveParams).map(([key, paramValue]) =>
        paramValue ? <input key={key} type="hidden" name={key} value={paramValue} /> : null,
      )}
      {useSelect ? (
        <select
          name={paramName}
          defaultValue={value}
          onChange={() => formRef.current?.requestSubmit()}
          className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
        >
          {options.map((period) => (
            <option key={period} value={period}>
              {formatPeriodMonthLabel(period)}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={paramName}
          type="month"
          defaultValue={value}
          onChange={() => formRef.current?.requestSubmit()}
          className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm"
        />
      )}
    </form>
  );
}
