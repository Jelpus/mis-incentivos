"use client";

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from "react";
import { uploadSourceRankingFileAction } from "@/app/admin/source-ranking/actions";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";

type SourceRankingFileRow = {
  fileCode: string;
  displayName: string;
  description: string;
  uploaded: boolean;
  uploadedAt: string | null;
  originalFileName: string | null;
};

type SourceRankingFilesState = {
  storageReady: boolean;
  storageMessage: string | null;
  totalRequired: number;
  uploadedCount: number;
  missingCount: number;
  rows: SourceRankingFileRow[];
};

type Props = {
  periodMonthInput: string; // YYYY-MM
  sourceFiles: SourceRankingFilesState;
};

type UploadState =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    fileCode: string;
    uploadedPath: string;
    normalizedRows?: number;
    normalizationSummary?: string;
  }
  | {
    ok: false;
    message: string;
  }
  | null;

function formatDateTime(value: string | null) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

function SourceRankingFileUploadRowItem({
  periodMonthInput,
  row,
}: {
  periodMonthInput: string;
  row: SourceRankingFileRow;
}) {
  const [state, setState] = useState<UploadState>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => {
    if (row.fileCode === "kpi_local_ytd") {
      return [
        "Validando archivo y periodo...",
        "Subiendo archivo a storage...",
        "Normalizando BASE VISITAS YTD...",
        "Aplicando fuzzy match por nombre y fallback por territorio...",
        "Actualizando tabla normalizada...",
      ];
    }

    if (row.fileCode === "icva_48hrs") {
      return [
        "Validando archivo y periodo...",
        "Subiendo archivo a storage...",
        "Normalizando ICVA + 48 hrs...",
        "Ejecutando fuzzy match por nombre...",
        "Actualizando tablas raw y agregada...",
      ];
    }

    return [
      "Validando archivo y periodo...",
      "Subiendo archivo a storage...",
      "Actualizando metadata del periodo...",
    ];
  }, [row.fileCode]);

  useEffect(() => {
    if (!showProgressModal || !isPending) return;

    const interval = setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    }, 1400);

    return () => clearInterval(interval);
  }, [isPending, showProgressModal, steps.length]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setState(null);
  }

  function handleUpload() {
    if (!selectedFile) {
      setState({ ok: false, message: "Debes seleccionar un archivo." });
      return;
    }

    const formData = new FormData();
    formData.append("period_month", periodMonthInput);
    formData.append("file_code", row.fileCode);
    formData.append("display_name", row.displayName);
    formData.append("file", selectedFile);

    setShowProgressModal(true);
    setStepIndex(0);
    startTransition(async () => {
      try {
        const result = await uploadSourceRankingFileAction(null, formData);
        setState(result);
      } catch (error) {
        setState({
          ok: false,
          message:
            error instanceof Error
              ? `Error inesperado en la carga: ${error.message}`
              : "Error inesperado en la carga.",
        });
      }
    });
  }

  return (
    <>
      <tr className="border-b border-neutral-100">
        <td className="px-4 py-3 text-sm">
          <p className="font-medium text-neutral-900">{row.displayName}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{row.description}</p>
        </td>
        <td className="px-4 py-3 text-sm text-neutral-700">
          {row.uploaded ? (
            <div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                Cargado
              </span>
              <p className="mt-2 truncate text-xs font-medium text-neutral-900">{row.originalFileName}</p>
              <p className="text-xs text-neutral-500">{formatDateTime(row.uploadedAt)}</p>
            </div>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              Pendiente
            </span>
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
            <button
              type="button"
              onClick={handleUpload}
              disabled={isPending || !selectedFile}
              className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (row.uploaded ? "Reemplazando..." : "Subiendo...") : row.uploaded ? "Reemplazar" : "Subir"}
            </button>
            {state ? (
              <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
                {state.message}
              </p>
            ) : null}
          </div>
        </td>
      </tr>

      {showProgressModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">Proceso de carga</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Archivo: <span className="font-medium">{row.displayName}</span>
                </p>
              </div>
              {!isPending ? (
                <button
                  type="button"
                  onClick={() => setShowProgressModal(false)}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                >
                  Cerrar
                </button>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {steps.map((step, index) => {
                const isDone = isPending ? index < stepIndex : state?.ok ? true : index < stepIndex;
                const isActive = isPending ? index === stepIndex : false;
                return (
                  <div key={`${row.fileCode}-step-${index}`} className="flex items-center gap-2 text-sm">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold ${
                        isDone
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : isActive
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-neutral-300 bg-white text-neutral-500"
                      }`}
                    >
                      {isDone ? "✓" : isActive ? "…" : index + 1}
                    </span>
                    <p className={`${isDone ? "text-emerald-800" : isActive ? "text-blue-800" : "text-neutral-600"}`}>
                      {step}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                  Procesando archivo, espera un momento...
                </span>
              ) : state?.ok ? (
                <span className="text-emerald-700">
                  Proceso completado. {state.normalizationSummary ?? state.message}
                </span>
              ) : (
                <span className="text-red-700">
                  Proceso con error. {state?.message ?? "No se recibio respuesta del servidor."}
                </span>
              )}
            </div>

            {!isPending && !state?.ok ? (
              <p className="mt-3 text-xs text-neutral-500">
                Tip: revisa que el archivo no supere 50MB y que la estructura de hojas sea valida.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SourceRankingFilesCard({ periodMonthInput, sourceFiles }: Props) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-neutral-950">Archivos requeridos</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-600">
          Carga los dos insumos base para ranking del periodo. Esta etapa solo guarda los archivos y su metadata;
          la normalizacion y consolidacion en BigQuery se agregan en el siguiente paso.
        </p>
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
          {sourceFiles.storageMessage}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Archivo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            {sourceFiles.rows.map((row) => (
              <SourceRankingFileUploadRowItem
                key={row.fileCode}
                periodMonthInput={periodMonthInput}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
