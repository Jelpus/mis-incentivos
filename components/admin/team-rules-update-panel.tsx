"use client";

import { useState } from "react";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { TeamRulesClonePeriodCard } from "@/components/admin/team-rules-clone-period-card";
import { TeamRulesImportCard } from "@/components/admin/team-rules-import-card";

type CloneContext = {
  latest_period: string | null;
  available_source_periods: string[];
  latest_count: number;
  target_count: number;
  can_clone: boolean;
  message: string;
} | null;

type Props = {
  targetPeriodMonthInput: string; // YYYY-MM
  tablePeriodMonthInput: string; // YYYY-MM
  availableStatusPeriods: string[];
  cloneContext: CloneContext;
};

type UpdateMode = "clone" | "excel";

export function TeamRulesUpdatePanel({
  targetPeriodMonthInput,
  tablePeriodMonthInput,
  availableStatusPeriods,
  cloneContext,
}: Props) {
  const [mode, setMode] = useState<UpdateMode>("clone");

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-neutral-950">Actualizar PayComponents</h2>
        <p className="mt-1 text-sm text-neutral-600">
          1) Selecciona el periodo destino. 2) Elige como actualizar: copiar desde otro periodo o
          subir Excel.
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Periodo destino a actualizar
        </p>
        <div className="mt-2">
          <StatusPeriodPicker
            value={targetPeriodMonthInput}
            paramName="update_period"
            preserveParams={{ period: tablePeriodMonthInput }}
            options={availableStatusPeriods}
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("clone")}
          className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
            mode === "clone"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Copiar desde periodo
        </button>
        <button
          type="button"
          onClick={() => setMode("excel")}
          className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
            mode === "excel"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Subir Excel
        </button>
      </div>

      {mode === "clone" ? (
        <TeamRulesClonePeriodCard
          cloneContext={cloneContext}
          targetPeriodMonthInput={targetPeriodMonthInput}
        />
      ) : (
        <TeamRulesImportCard targetPeriodMonthInput={targetPeriodMonthInput} />
      )}
    </section>
  );
}
