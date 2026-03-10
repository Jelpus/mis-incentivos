"use client";

import { useRef } from "react";

type Props = {
  value: string; // YYYY-MM
};

export function StatusPeriodPicker({ value }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} className="flex items-center gap-2" method="get">
      <input
        name="period"
        type="month"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-2xl border border-neutral-300 px-3 py-2 text-sm"
      />
    </form>
  );
}
