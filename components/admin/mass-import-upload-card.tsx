"use client";

import { uploadUnifiedStatusImportAction } from "@/app/admin/status/actions";
import Link from "next/link";
import { useActionState, useState, type ChangeEvent } from "react";

type UploadState =
  | {
      ok: true;
      message: string;
      svaBatchId: string;
      svmBatchId: string;
    }
  | {
      ok: false;
      message: string;
      svaBatchId?: string;
      svmBatchId?: string;
    }
  | null;

type Props = {
  defaultPeriodMonth: string; // YYYY-MM
};

type ImportMode = "shared" | "separate";

export function MassImportUploadCard({ defaultPeriodMonth }: Props) {
  const [importMode, setImportMode] = useState<ImportMode>("shared");
  const [state, formAction, isPending] =
    useActionState<UploadState, FormData>(uploadUnifiedStatusImportAction, null);

  const [sharedSheetNames, setSharedSheetNames] = useState<string[]>([]);
  const [sharedSvaSheet, setSharedSvaSheet] = useState("");
  const [sharedSvmSheet, setSharedSvmSheet] = useState("");
  const [sharedDetectionError, setSharedDetectionError] = useState<string | null>(null);

  const [svaSheetNames, setSvaSheetNames] = useState<string[]>([]);
  const [svaSheetName, setSvaSheetName] = useState("");
  const [svaDetectionError, setSvaDetectionError] = useState<string | null>(null);

  const [svmSheetNames, setSvmSheetNames] = useState<string[]>([]);
  const [svmSheetName, setSvmSheetName] = useState("");
  const [svmDetectionError, setSvmDetectionError] = useState<string | null>(null);

  async function detectSheetNames(file: File): Promise<string[]> {
    const { read } = await import("xlsx");
    const fileBuffer = await file.arrayBuffer();
    const workbook = read(fileBuffer, { type: "array" });
    return workbook.SheetNames ?? [];
  }

  async function handleSharedFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSharedSheetNames([]);
      setSharedSvaSheet("");
      setSharedSvmSheet("");
      setSharedDetectionError(null);
      return;
    }

    try {
      const names = await detectSheetNames(file);
      setSharedSheetNames(names);
      setSharedSvaSheet(names[0] ?? "");
      setSharedSvmSheet(names[1] ?? names[0] ?? "");
      setSharedDetectionError(
        names.length === 0
          ? "No se detectaron pestanas en el archivo."
          : null,
      );
    } catch {
      setSharedSheetNames([]);
      setSharedSvaSheet("");
      setSharedSvmSheet("");
      setSharedDetectionError(
        "No se pudieron leer las pestanas del archivo. Puedes intentar con otro Excel.",
      );
    }
  }

  async function handleSvaFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSvaSheetNames([]);
      setSvaSheetName("");
      setSvaDetectionError(null);
      return;
    }

    try {
      const names = await detectSheetNames(file);
      setSvaSheetNames(names);
      setSvaSheetName(names[0] ?? "");
      setSvaDetectionError(
        names.length === 0
          ? "No se detectaron pestanas en el archivo SVA."
          : null,
      );
    } catch {
      setSvaSheetNames([]);
      setSvaSheetName("");
      setSvaDetectionError("No se pudieron leer las pestanas del archivo SVA.");
    }
  }

  async function handleSvmFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setSvmSheetNames([]);
      setSvmSheetName("");
      setSvmDetectionError(null);
      return;
    }

    try {
      const names = await detectSheetNames(file);
      setSvmSheetNames(names);
      setSvmSheetName(names[0] ?? "");
      setSvmDetectionError(
        names.length === 0
          ? "No se detectaron pestanas en el archivo SVM."
          : null,
      );
    } catch {
      setSvmSheetNames([]);
      setSvmSheetName("");
      setSvmDetectionError("No se pudieron leer las pestanas del archivo SVM.");
    }
  }

  return (
    <div className="h-full rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">Carga masiva</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Sube SVA y SVM en un solo proceso, usando el mismo Excel o dos archivos separados.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="import_mode" value={importMode} />

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setImportMode("shared")}
            className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
              importMode === "shared"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
          >
            Mismo Excel
          </button>
          <button
            type="button"
            onClick={() => setImportMode("separate")}
            className={`rounded-2xl border px-3 py-2 text-sm font-medium ${
              importMode === "separate"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
          >
            Dos Excel
          </button>
        </div>

        <div>
          <label
            htmlFor="mass_period_month"
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            Periodo
          </label>

          <input
            id="mass_period_month"
            name="period_month"
            type="month"
            required
            defaultValue={defaultPeriodMonth}
            className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
          />
        </div>

        {importMode === "shared" ? (
          <>
            <div>
              <label
                htmlFor="mass_shared_file"
                className="text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                Archivo Excel (SVA + SVM)
              </label>

              <input
                id="mass_shared_file"
                name="shared_file"
                type="file"
                accept=".xlsx,.xls"
                required={importMode === "shared"}
                onChange={handleSharedFileChange}
                className="mt-1 block w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800"
              />
            </div>

            {sharedSheetNames.length > 0 ? (
              <>
                <div>
                  <label
                    htmlFor="mass_shared_sva_sheet_name"
                    className="text-xs font-medium uppercase tracking-wide text-neutral-500"
                  >
                    Pestaña para SVA
                  </label>
                  <select
                    id="mass_shared_sva_sheet_name"
                    name="sva_sheet_name"
                    value={sharedSvaSheet}
                    onChange={(event) => setSharedSvaSheet(event.target.value)}
                    required
                    className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
                  >
                    {sharedSheetNames.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="mass_shared_svm_sheet_name"
                    className="text-xs font-medium uppercase tracking-wide text-neutral-500"
                  >
                    Pestaña para SVM
                  </label>
                  <select
                    id="mass_shared_svm_sheet_name"
                    name="svm_sheet_name"
                    value={sharedSvmSheet}
                    onChange={(event) => setSharedSvmSheet(event.target.value)}
                    required
                    className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
                  >
                    {sharedSheetNames.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {sharedDetectionError ? (
              <p className="text-xs text-amber-700">{sharedDetectionError}</p>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <label
                htmlFor="mass_sva_file"
                className="text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                Archivo Excel SVA
              </label>

              <input
                id="mass_sva_file"
                name="sva_file"
                type="file"
                accept=".xlsx,.xls"
                required={importMode === "separate"}
                onChange={handleSvaFileChange}
                className="mt-1 block w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800"
              />
            </div>

            {svaSheetNames.length > 0 ? (
              <div>
                <label
                  htmlFor="mass_sva_sheet_name"
                  className="text-xs font-medium uppercase tracking-wide text-neutral-500"
                >
                  Pestana para SVA
                </label>
                <select
                  id="mass_sva_sheet_name"
                  name="sva_sheet_name"
                  value={svaSheetName}
                  onChange={(event) => setSvaSheetName(event.target.value)}
                  required
                  className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
                >
                  {svaSheetNames.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {svaDetectionError ? (
              <p className="text-xs text-amber-700">{svaDetectionError}</p>
            ) : null}

            <div>
              <label
                htmlFor="mass_svm_file"
                className="text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                Archivo Excel SVM
              </label>

              <input
                id="mass_svm_file"
                name="svm_file"
                type="file"
                accept=".xlsx,.xls"
                required={importMode === "separate"}
                onChange={handleSvmFileChange}
                className="mt-1 block w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800"
              />
            </div>

            {svmSheetNames.length > 0 ? (
              <div>
                <label
                  htmlFor="mass_svm_sheet_name"
                  className="text-xs font-medium uppercase tracking-wide text-neutral-500"
                >
                  Pestana para SVM
                </label>
                <select
                  id="mass_svm_sheet_name"
                  name="svm_sheet_name"
                  value={svmSheetName}
                  onChange={(event) => setSvmSheetName(event.target.value)}
                  required
                  className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
                >
                  {svmSheetNames.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {svmDetectionError ? (
              <p className="text-xs text-amber-700">{svmDetectionError}</p>
            ) : null}
          </>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Procesando archivos..." : "Crear batches de SVA y SVM"}
        </button>

        {isPending ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Cargando archivo y preparando batches.
          </div>
        ) : null}

        {state ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              state.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            <p>{state.message}</p>
            {state.svaBatchId ? (
              <p className="mt-2">
                Batch SVA:{" "}
                <Link
                  href={
                    state.svmBatchId
                      ? `/admin/status/imports/${state.svaBatchId}?next_batch_id=${state.svmBatchId}&flow_step=1&flow_total=2`
                      : `/admin/status/imports/${state.svaBatchId}`
                  }
                  className="underline underline-offset-2"
                >
                  revisar importacion
                </Link>
              </p>
            ) : null}
            {state.svmBatchId ? (
              <p className="mt-1">
                Batch SVM:{" "}
                <Link
                  href={
                    state.svaBatchId
                      ? `/admin/status/imports/${state.svmBatchId}?next_batch_id=${state.svaBatchId}&flow_step=1&flow_total=2`
                      : `/admin/status/imports/${state.svmBatchId}`
                  }
                  className="underline underline-offset-2"
                >
                  revisar importacion
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
