"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import {
  previewTeamSourceFileAction,
  reprocessTeamSourceFileFromStorageAction,
  uploadTeamSourceFileAction,
} from "@/app/admin/incentive-rules/actions";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";

type SourceFileRow = {
  fileCode: string;
  displayName: string;
  usageCount: number;
  uploaded: boolean;
  uploadedAt: string | null;
  originalFileName: string | null;
};

type SourceFilesState = {
  storageReady: boolean;
  storageMessage: string | null;
  totalRequired: number;
  uploadedCount: number;
  missingCount: number;
  rows: SourceFileRow[];
};

type Props = {
  periodMonthInput: string; // YYYY-MM
  sourceFiles: SourceFilesState;
};

type UploadState =
  | {
    ok: true;
    message: string;
    fileCode: string;
    periodMonth: string;
    uploadedPath: string;
    normalizedRows: number;
    bigQueryStatus: "uploaded" | "skipped";
  }
  | {
    ok: false;
    message: string;
  }
  | null;

type PreviewState =
  | {
    ok: true;
    message: string;
    summary: {
      normalizedRows: number;
      rowsEligibleForBigQuery: number;
      droppedRowsBySchema: number;
      teamsWithRequirements: number;
      teamsFullyCovered: number;
      distinctMetrics: string[];
      distinctFuentes: string[];
      distinctMoleculas: string[];
      teamAlerts: Array<{
        teamId: string;
        missingCount: number;
        missingExamples: string[];
      }>;
    };
  }
  | {
    ok: false;
    message: string;
  }
  | null;

function formatDateTime(value: string | null) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

function TeamSourceFileUploadRowItem({
  periodMonthInput,
  row,
}: {
  periodMonthInput: string;
  row: SourceFileRow;
}) {
  const [state, setState] = useState<UploadState>(null);
  const [previewState, setPreviewState] = useState<PreviewState>(null);
  const [isPending, startUploadTransition] = useTransition();
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [isReprocessPending, startReprocessTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setState(null);
    setPreviewState(null);

    if (!file) {
      setSelectedFile(null);
      setSheetNames([]);
      setSelectedSheetName("");
      setSheetError(null);
      return;
    }

    try {
      const { read } = await import("xlsx");
      const fileBuffer = await file.arrayBuffer();
      const workbook = read(fileBuffer, { type: "array" });
      const names = workbook.SheetNames ?? [];

      setSelectedFile(file);
      setSheetNames(names);
      setSelectedSheetName(names[0] ?? "");
      setSheetError(names.length === 0 ? "No se detectaron pestanas en el archivo." : null);
    } catch {
      setSelectedFile(null);
      setSheetNames([]);
      setSelectedSheetName("");
      setSheetError("No se pudieron leer pestanas del archivo.");
    }
  }

  function buildFormData(): FormData | null {
    if (!selectedFile) {
      setPreviewState({ ok: false, message: "Debes seleccionar un archivo." });
      return null;
    }

    const formData = new FormData();
    formData.append("period_month", periodMonthInput);
    formData.append("file_code", row.fileCode);
    formData.append("display_name", row.displayName);
    formData.append("file", selectedFile);
    if (selectedSheetName) formData.append("sheet_name", selectedSheetName);
    return formData;
  }

  function handlePreview() {
    const formData = buildFormData();
    if (!formData) return;

    setShowPreviewModal(true);
    startPreviewTransition(async () => {
      try {
        const result = await previewTeamSourceFileAction(null, formData);
        setPreviewState(result);
      } catch (error) {
        setPreviewState({
          ok: false,
          message:
            error instanceof Error
              ? `No se pudo validar archivo: ${error.message}`
              : "No se pudo validar archivo.",
        });
      }
    });
  }

  function handleUpload() {
    const formData = buildFormData();
    if (!formData) return;

    startUploadTransition(async () => {
      try {
        const result = await uploadTeamSourceFileAction(null, formData);
        setState(result);
        if (result.ok) {
          setShowPreviewModal(false);
        }
      } catch (error) {
        setState({
          ok: false,
          message:
            error instanceof Error
              ? `No se pudo subir archivo: ${error.message}`
              : "No se pudo subir archivo.",
        });
      }
    });
  }

  function handleReprocessFromStorage() {
    setState(null);
    startReprocessTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("period_month", periodMonthInput);
        formData.append("file_code", row.fileCode);
        if (selectedSheetName) formData.append("sheet_name", selectedSheetName);
        const result = await reprocessTeamSourceFileFromStorageAction(null, formData);
        setState(result);
      } catch (error) {
        setState({
          ok: false,
          message:
            error instanceof Error
              ? `No se pudo reprocesar archivo: ${error.message}`
              : "No se pudo reprocesar archivo.",
        });
      }
    });
  }

  return (
    <tr className="border-b border-neutral-100">

      <td className="px-4 py-3 text-sm uppercase font-medium text-neutral-900">
        {row.uploaded ? (
          <span className="rounded-full bg-emerald-50 px-3 pb-1.5 text-xs font-medium text-emerald-700">
            Cargado
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-3 pb-1.5 text-xs font-medium text-amber-700">
            Pendiente
          </span>
        )}

        <br />
        {row.displayName}
      </td>

      <td className="px-4 py-3 text-sm text-neutral-700">{row.usageCount}</td>


      <td className="px-4 py-3 text-sm text-neutral-700">
        {row.originalFileName ? (
          <div>
            <p className="truncate font-medium text-neutral-900">{row.originalFileName}</p>
            <p className="text-xs text-neutral-500">{formatDateTime(row.uploadedAt)}</p>
          </div>
        ) : (
          <span>-</span>
        )}

      </td>

      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <input
            type="file"
            required
            onChange={handleFileChange}
            className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-neutral-800"
          />
          {sheetNames.length > 0 ? (
            <select
              value={selectedSheetName}
              onChange={(event) => {
                setSelectedSheetName(event.target.value);
                setPreviewState(null);
              }}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900"
            >
              {sheetNames.map((sheetName) => (
                <option key={sheetName} value={sheetName}>
                  {sheetName}
                </option>
              ))}
            </select>
          ) : null}
          {sheetError ? <p className="text-xs text-amber-700">{sheetError}</p> : null}
          <button
            type="button"
            disabled={isPreviewPending || Boolean(sheetError) || !selectedFile}
            onClick={handlePreview}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreviewPending ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                Validando...
              </span>
            ) : (
              "Validar"
            )}
          </button>
          {row.uploaded ? (
            <button
              type="button"
              disabled={isReprocessPending}
              onClick={handleReprocessFromStorage}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReprocessPending ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                  Reprocesando...
                </span>
              ) : (
                "Reprocesar Storage"
              )}
            </button>
          ) : null}
          {state ? (
            <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
              {state.message}
              {state.ok ? ` Filas normalizadas: ${state.normalizedRows}.` : ""}
            </p>
          ) : null}
          {previewState && !previewState.ok ? (
            <p className="text-xs text-red-700">{previewState.message}</p>
          ) : null}
        </div>
        {showPreviewModal && previewState?.ok ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-neutral-950">Validacion previa</h3>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                >
                  Cerrar
                </button>
              </div>
              <p className="mt-2 text-sm text-neutral-700">{previewState.message}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">Filas</p>
                  <p className="text-sm font-semibold text-neutral-900">
                    {previewState.summary.normalizedRows}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">Teams req.</p>
                  <p className="text-sm font-semibold text-neutral-900">
                    {previewState.summary.teamsWithRequirements}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">Teams OK</p>
                  <p className="text-sm font-semibold text-neutral-900">
                    {previewState.summary.teamsFullyCovered}
                  </p>
                </div>
              </div>
              <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                Para BigQuery: <strong>{previewState.summary.rowsEligibleForBigQuery}</strong> filas validas y{" "}
                <strong>{previewState.summary.droppedRowsBySchema}</strong> filas omitidas por schema minimo (archivo/periodo).
              </p>
              {previewState.summary.teamAlerts.length > 0 ? (
                <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {previewState.summary.teamAlerts.map((alert) => (
                    <div key={alert.teamId} className="mb-2 border-b border-amber-200 pb-2 last:mb-0 last:border-b-0 last:pb-0">
                      <p className="font-semibold">
                        {alert.teamId}: {alert.missingCount} combinacion(es) requerida(s) sin cubrir
                      </p>
                      {alert.missingExamples.map((example, index) => (
                        <p key={`${alert.teamId}-${index}`}>- {example}</p>
                      ))}
                      <div className="mt-2">
                        <Link
                          href={`/admin/incentive-rules/${encodeURIComponent(alert.teamId)}?period=${encodeURIComponent(periodMonthInput)}`}
                          className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100"
                        >
                          Ver Reglas
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Sin alertas: el archivo cumple con las condiciones detectadas.
                </p>
              )}
              <p className="mt-4 text-xs text-neutral-600">
                Si estas conforme, confirma desde este modal para {row.uploaded ? "reemplazar" : "subir"} el archivo.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleUpload}
                  className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      {row.uploaded ? "Reemplazando..." : "Subiendo..."}
                    </span>
                  ) : row.uploaded ? (
                    "Confirmar reemplazo"
                  ) : (
                    "Confirmar subida"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function TeamSourceFilesCard({ periodMonthInput, sourceFiles }: Props) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <div>
          <h2 className="text-xl font-semibold text-neutral-950">Archivos fuente del periodo</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-600">
            Con base en los Pay Components definidos para el periodo, se listan los archivos fuente requeridos para alimentar las reglas de incentivos. Sube los archivos con la informacion correspondiente para que las reglas puedan procesarla correctamente.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Requeridos</p>
            <p className="mt-1 text-xl font-semibold text-neutral-900">{sourceFiles.totalRequired}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700">Cargados</p>
            <p className="mt-1 text-xl font-semibold text-emerald-800">{sourceFiles.uploadedCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-amber-700">Pendientes</p>
            <p className="mt-1 text-xl font-semibold text-amber-800">{sourceFiles.missingCount}</p>
          </div>
        </div>
      </div>

      {!sourceFiles.storageReady && sourceFiles.storageMessage ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sourceFiles.storageMessage} Referencia:{" "}
          <code>docs/team-incentive-source-files-schema.sql</code>
        </div>
      ) : null}

      {sourceFiles.rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          No hay archivos fuente requeridos para este periodo.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Archivo</th>
                <th className="px-4 py-3">Uso en reglas</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Accion</th>
              </tr>
            </thead>
            <tbody>
              {sourceFiles.rows.map((row) => (
                <TeamSourceFileUploadRowItem
                  key={row.fileCode}
                  periodMonthInput={periodMonthInput}
                  row={row}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

