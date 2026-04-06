"use client";

import { uploadReglasRankingComplementExcelAction } from "@/app/admin/reglas-ranking/actions";
import { upsertManualReglasRankingComplementAction } from "@/app/admin/reglas-ranking/actions";
import { useActionState, useState, type ChangeEvent } from "react";

type Props = {
  periodMonthInput: string; // YYYY-MM
  rankingOptions: string[];
  puntosRankingLvuOptions: string[];
};

type ActionState =
  | {
      ok: true;
      message: string;
      periodMonth: string;
      sheetName: string;
      processedRows: number;
      skippedEmptyRows: number;
    }
  | {
      ok: false;
      message: string;
      validationErrors?: string[];
    }
  | null;

type ManualActionState =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    }
  | null;

export function ReglasRankingImportCard({
  periodMonthInput,
  rankingOptions,
  puntosRankingLvuOptions,
}: Props) {
  const [mode, setMode] = useState<"excel" | "manual">("excel");
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(uploadReglasRankingComplementExcelAction, null);
  const [manualState, manualFormAction, manualPending] =
    useActionState<ManualActionState, FormData>(upsertManualReglasRankingComplementAction, null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [sheetDetectionError, setSheetDetectionError] = useState<string | null>(null);
  const [rankingMode, setRankingMode] = useState<"select" | "new">("select");
  const [puntosMode, setPuntosMode] = useState<"select" | "new">("select");

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
      setSheetDetectionError(names.length === 0 ? "No se detectaron pestanas en el archivo." : null);
    } catch {
      setSheetNames([]);
      setSelectedSheetName("");
      setSheetDetectionError("No se pudieron leer las pestanas del archivo.");
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">Complementos de ranking</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Completa datos faltantes sin modificar las reglas base de <code>/admin/incentive-rules</code>.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("excel")}
          className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
            mode === "excel"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Carga masiva (Excel)
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
            mode === "manual"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          Edicion manual
        </button>
      </div>

      {mode === "excel" ? (
        <form action={formAction} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="ranking_complement_period_month"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Periodo destino
            </label>
            <input
              id="ranking_complement_period_month"
              name="period_month"
              type="month"
              value={periodMonthInput}
              readOnly
              required
              className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
            />
          </div>

          <div>
            <label
              htmlFor="ranking_complement_file"
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Archivo Excel
            </label>
            <input
              id="ranking_complement_file"
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
                htmlFor="ranking_complement_sheet_name"
                className="text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                Pestana
              </label>
              <select
                id="ranking_complement_sheet_name"
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

          {sheetDetectionError ? <p className="text-xs text-amber-700">{sheetDetectionError}</p> : null}

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
            Columnas minimas: <code>team_id</code> y <code>product_name</code>.
            <br />
            Opcionales: <code>ranking</code>, <code>puntos_ranking_lvu</code>, <code>prod_weight</code>.
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Importando..." : "Importar complementos"}
          </button>

          {state ? (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              <p>{state.message}</p>
              {state.ok ? (
                <p className="mt-1 text-xs">
                  Sheet: {state.sheetName} | Filas procesadas: {state.processedRows} | Filas vacias: {" "}
                  {state.skippedEmptyRows}
                </p>
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
      ) : (
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs text-neutral-600">
            Captura una fila puntual. Ranking y Puntos ofrecen opciones existentes, con opcion de agregar un valor nuevo.
          </p>

          <form action={manualFormAction} className="mt-3 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="period_month" value={periodMonthInput} />

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Team ID
              </label>
              <input
                name="team_id"
                required
                className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Product Name
              </label>
              <input
                name="product_name"
                required
                className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Ranking
              </label>
              <select
                name="ranking_option"
                onChange={(event) => setRankingMode(event.target.value === "__new__" ? "new" : "select")}
                className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                defaultValue=""
              >
                <option value="">Sin valor</option>
                {rankingOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
                <option value="__new__">Agregar nuevo...</option>
              </select>
              {rankingMode === "new" ? (
                <input
                  name="ranking_custom"
                  placeholder="Nuevo ranking"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                />
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Puntos Ranking LVU
              </label>
              <select
                name="puntos_option"
                onChange={(event) => setPuntosMode(event.target.value === "__new__" ? "new" : "select")}
                className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                defaultValue=""
              >
                <option value="">Sin valor</option>
                {puntosRankingLvuOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
                <option value="__new__">Agregar nuevo...</option>
              </select>
              {puntosMode === "new" ? (
                <input
                  name="puntos_custom"
                  placeholder="Nuevo puntos_ranking_lvu"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                />
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Prod Weight (opcional)
              </label>
              <input
                name="prod_weight"
                placeholder="1"
                className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={manualPending}
                className="inline-flex items-center justify-center rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {manualPending ? "Guardando..." : "Guardar complemento"}
              </button>
            </div>
          </form>

          {manualState ? (
            <div
              className={`mt-3 rounded-2xl px-4 py-3 text-sm ${
                manualState.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              <p>{manualState.message}</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
