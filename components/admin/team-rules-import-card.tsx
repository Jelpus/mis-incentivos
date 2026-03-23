"use client";

import { uploadTeamRulesFromExcelAction } from "@/app/admin/incentive-rules/actions";
import { useActionState, useState, type ChangeEvent } from "react";

type Props = {
  targetPeriodMonthInput: string; // YYYY-MM
};

type ActionState =
  | {
      ok: true;
      message: string;
      periodMonth: string;
      sheetName: string;
      processedRows: number;
      createdTeams: number;
      skippedEmptyRows: number;
      ignoredTeams: string[];
      missingTeamsFromFile: string[];
      warnings: string[];
    }
  | {
      ok: false;
      message: string;
      validationErrors?: string[];
    }
  | null;

export function TeamRulesImportCard({ targetPeriodMonthInput }: Props) {
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(uploadTeamRulesFromExcelAction, null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [sheetDetectionError, setSheetDetectionError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSheetNames([]);
      setSelectedSheetName("");
      setSheetDetectionError(null);
      return;
    }

    try {
      const { read } = await import("xlsx");
      const fileBuffer = await file.arrayBuffer();
      const workbook = read(fileBuffer, { type: "array" });
      const names = workbook.SheetNames ?? [];

      setSheetNames(names);
      setSelectedSheetName(names[0] ?? "");
      setSheetDetectionError(
        names.length === 0 ? "No se detectaron pestañas en el archivo." : null,
      );
    } catch {
      setSheetNames([]);
      setSelectedSheetName("");
      setSheetDetectionError(
        "No se pudieron leer las pestañas del archivo. Intenta con otro Excel.",
      );
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">Importar reglas desde Excel</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Carga masiva por periodo. Se valida estructura, team_id en Status y se crea una nueva
        version por team.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="team_rules_period_month"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Periodo destino
            </label>
            <input
              id="team_rules_period_month"
              name="period_month"
              type="month"
              value={targetPeriodMonthInput}
              readOnly
              required
              className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
            />
          </div>

          <div>
            <label
              htmlFor="team_rules_change_note"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Nota de cambio (opcional)
            </label>
            <input
              id="team_rules_change_note"
              name="change_note"
              placeholder="Ejemplo: Carga diciembre 2026"
              className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="team_rules_file"
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            Archivo Excel
          </label>
          <input
            id="team_rules_file"
            name="file"
            type="file"
            accept=".xlsx,.xls"
            required
            onChange={handleFileChange}
            className="mt-1 block w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800"
          />
        </div>

        {sheetNames.length > 0 ? (
          <div>
            <label
              htmlFor="team_rules_sheet_name"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Pestaña
            </label>
            <select
              id="team_rules_sheet_name"
              name="sheet_name"
              value={selectedSheetName}
              onChange={(event) => setSelectedSheetName(event.target.value)}
              required
              className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
            >
              {sheetNames.map((sheetName) => (
                <option key={sheetName} value={sheetName}>
                  {sheetName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {sheetDetectionError ? (
          <p className="text-xs text-amber-700">{sheetDetectionError}</p>
        ) : null}

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
          Headers esperados (mínimo): <code>team_id</code>, <code>plan_type_name</code>,{" "}
          <code>product_name</code>, <code>prod_weight</code>, <code>agrupador</code>,{" "}
          <code>curva_pago</code>, <code>elemento</code>.
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Validando e importando..." : "Importar reglas"}
        </button>

        {state ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            <p>{state.message}</p>
            {state.ok ? (
              <>
                <p className="mt-1 text-xs">
                  Sheet: {state.sheetName} | Filas válidas: {state.processedRows} | Teams
                  versionados: {state.createdTeams} | Filas vacías omitidas:{" "}
                  {state.skippedEmptyRows}
                </p>
                {state.warnings.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                    {state.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            {!state.ok && state.validationErrors?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {state.validationErrors.slice(0, 10).map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
