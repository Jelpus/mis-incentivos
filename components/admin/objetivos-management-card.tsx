"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  previewObjetivosImportAction,
  uploadObjetivosImportAction,
  type PreviewObjetivosResult,
  type UploadObjetivosResult,
} from "@/app/admin/objetivos/actions";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";
import { formatPeriodMonthForInput, formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";

type VersionRow = {
  id: string;
  versionNo: number;
  sourceFileName: string | null;
  sheetName: string | null;
  hasPrivateFile: boolean;
  hasDrillDownFile: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingRequiredCount: number;
  createdAt: string | null;
  createdBy: string | null;
};

type Props = {
  periodMonth: string;
  availablePeriods: string[];
  latestVersion: {
    versionNo: number;
    createdAt: string | null;
    sourceFileName: string | null;
    sheetName: string | null;
    validRows: number;
    invalidRows: number;
    missingRequiredCount: number;
  } | null;
  versions: VersionRow[];
};

function formatDateTime(value: string | null) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

function formatSourceLabel(sourceType: "private" | "drilldown") {
  return sourceType === "private" ? "Objetivos Privados" : "Drill Down Cuotas";
}

function formatDetailedSourceLabel(sourceType: "private" | "drilldown" | "private+drilldown") {
  if (sourceType === "private") return "Objetivos Privados";
  if (sourceType === "drilldown") return "Drill Down Cuotas";
  return "Objetivos Privados + Drill Down Cuotas";
}

function formatInvalidCodeLabel(code: string) {
  if (code === "unknown_route") return "Ruta no encontrada";
  if (code === "product_not_in_team_rules") return "Producto fuera de reglas";
  if (code === "negative_target") return "Target/Cuota negativo";
  if (code === "invalid_target") return "Target/Cuota invalido";
  if (code === "missing_required_fields") return "Campos requeridos faltantes";
  if (code === "missing_required_columns") return "Columnas requeridas faltantes";
  if (code === "header_not_detected") return "Encabezado no detectado";
  if (code === "empty_workbook") return "Archivo sin hojas";
  return code;
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/"/g, "\"\"");
  return `"${normalized}"`;
}

export function ObjetivosManagementCard({
  periodMonth,
  availablePeriods,
  latestVersion,
  versions,
}: Props) {
  const router = useRouter();
  const [selectedPrivateFile, setSelectedPrivateFile] = useState<File | null>(null);
  const [privateSheetNames, setPrivateSheetNames] = useState<string[]>([]);
  const [selectedPrivateSheetName, setSelectedPrivateSheetName] = useState("");
  const [privateSheetError, setPrivateSheetError] = useState<string | null>(null);
  const [selectedDrillDownFile, setSelectedDrillDownFile] = useState<File | null>(null);
  const [drillDownSheetNames, setDrillDownSheetNames] = useState<string[]>([]);
  const [selectedDrillDownSheetName, setSelectedDrillDownSheetName] = useState("");
  const [drillDownSheetError, setDrillDownSheetError] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [previewState, setPreviewState] = useState<PreviewObjetivosResult | null>(null);
  const [uploadState, setUploadState] = useState<UploadObjetivosResult | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const periodInput = formatPeriodMonthForInput(periodMonth);

  const periodOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        availablePeriods
          .map((value) => formatPeriodMonthForInput(value))
          .filter((value) => value.length > 0),
      ),
    );
    return unique.length > 0 ? unique : [periodInput];
  }, [availablePeriods, periodInput]);

  const invalidGroups = useMemo(() => {
    if (!previewState?.ok) return [] as Array<{ code: string; count: number }>;
    const countByCode = new Map<string, number>();
    for (const detail of previewState.summary.invalidDetails) {
      const current = countByCode.get(detail.code) ?? 0;
      countByCode.set(detail.code, current + 1);
    }
    return Array.from(countByCode.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [previewState]);

  const sortedInvalidDetails = useMemo(() => {
    if (!previewState?.ok) return [];
    return [...previewState.summary.invalidDetails].sort((a, b) => {
      const teamA = String(a.teamId ?? "").trim().toUpperCase();
      const teamB = String(b.teamId ?? "").trim().toUpperCase();
      if (teamA && !teamB) return -1;
      if (!teamA && teamB) return 1;
      const byTeam = teamA.localeCompare(teamB);
      if (byTeam !== 0) return byTeam;
      return a.rowNumber - b.rowNumber;
    });
  }, [previewState]);

  function downloadInvalidRowsCsv() {
    if (!previewState?.ok) return;
    const warningRows = previewState.summary.invalidDetails;
    const criticalRows = previewState.summary.criticalDetails;
    const rowsToExport = [...warningRows, ...criticalRows];
    if (rowsToExport.length === 0) return;

    const headers = [
      "severity",
      "code",
      "archivo",
      "hoja",
      "fila",
      "ruta",
      "product_name",
      "team_id",
      "mensaje",
      "accion_sugerida",
    ];
    const lines = [headers.map(escapeCsvValue).join(",")];
    for (const detail of rowsToExport) {
      const row = [
        detail.severity,
        detail.code,
        detail.sourceFileName ?? formatDetailedSourceLabel(detail.sourceType),
        detail.sourceSheetName ?? "",
        detail.rowNumber > 0 ? String(detail.rowNumber) : "",
        detail.route ?? "",
        detail.productName ?? "",
        detail.teamId ?? "",
        detail.message,
        detail.actionSuggestion,
      ];
      lines.push(row.map((value) => escapeCsvValue(String(value))).join(","));
    }
    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `objetivos-advertencias-${periodInput}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function readSheetNamesFromFile(file: File | null) {
    if (!file) return { names: [] as string[], error: null as string | null };
    try {
      const { read } = await import("xlsx");
      const fileBuffer = await file.arrayBuffer();
      const workbook = read(fileBuffer, { type: "array" });
      const names = workbook.SheetNames ?? [];
      return {
        names,
        error: names.length === 0 ? "No se detectaron pestanas en el archivo." : null,
      };
    } catch {
      return { names: [], error: "No se pudieron leer pestanas del archivo." };
    }
  }

  async function handlePrivateFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedPrivateFile(file);
    setPreviewState(null);
    setUploadState(null);
    setPrivateSheetError(null);
    setPrivateSheetNames([]);
    setSelectedPrivateSheetName("");

    const parsed = await readSheetNamesFromFile(file);
    setPrivateSheetNames(parsed.names);
    setSelectedPrivateSheetName(parsed.names[0] ?? "");
    setPrivateSheetError(parsed.error);
  }

  async function handleDrillDownFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedDrillDownFile(file);
    setPreviewState(null);
    setUploadState(null);
    setDrillDownSheetError(null);
    setDrillDownSheetNames([]);
    setSelectedDrillDownSheetName("");

    const parsed = await readSheetNamesFromFile(file);
    setDrillDownSheetNames(parsed.names);
    setSelectedDrillDownSheetName(parsed.names[0] ?? "");
    setDrillDownSheetError(parsed.error);
  }

  function buildFormData(allowWithAlerts: boolean): FormData | null {
    if (!selectedPrivateFile || !selectedDrillDownFile) {
      setPreviewState({
        ok: false,
        message: "Debes seleccionar ambos archivos: Objetivos Privados y Drill Down Cuotas.",
      });
      return null;
    }

    const formData = new FormData();
    formData.append("period_month", periodInput);
    formData.append("private_file", selectedPrivateFile);
    formData.append("drilldown_file", selectedDrillDownFile);
    formData.append("private_sheet_name", selectedPrivateSheetName);
    formData.append("drilldown_sheet_name", selectedDrillDownSheetName);
    formData.append("allow_with_alerts", allowWithAlerts ? "true" : "false");
    formData.append("change_note", changeNote);
    return formData;
  }

  function handlePreview() {
    const formData = buildFormData(false);
    if (!formData) return;

    startPreview(async () => {
      try {
        const result = await previewObjetivosImportAction(null, formData);
        setPreviewState(result);
      } catch (error) {
        setPreviewState({
          ok: false,
          message:
            error instanceof Error
              ? `No se pudo procesar preview: ${error.message}`
              : "No se pudo procesar preview.",
        });
      }
    });
  }

  function handleUpload() {
    const hasAlerts =
      previewState?.ok &&
      (previewState.summary.warningCount > 0 || previewState.summary.criticalCount > 0);
    const formData = buildFormData(Boolean(hasAlerts));
    if (!formData) return;

    startUpload(async () => {
      try {
        const result = await uploadObjetivosImportAction(null, formData);
        setUploadState(result);
        if (result.ok) {
          setPreviewState(null);
          setSelectedPrivateFile(null);
          setPrivateSheetNames([]);
          setSelectedPrivateSheetName("");
          setPrivateSheetError(null);
          setSelectedDrillDownFile(null);
          setDrillDownSheetNames([]);
          setSelectedDrillDownSheetName("");
          setDrillDownSheetError(null);
          setChangeNote("");
          router.refresh();
        }
      } catch (error) {
        setUploadState({
          ok: false,
          message:
            error instanceof Error
              ? `No se pudo guardar version: ${error.message}`
              : "No se pudo guardar version.",
        });
      }
    });
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-950">Carga de objetivos</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-600">
            Importa 2 archivos del periodo: Objetivos Privados y Drill Down Cuotas. El sistema unifica ambos,
            agrega cuotas por ruta + product_name y valida match con Status y Reglas antes de guardar version.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Periodo</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">
              {formatPeriodMonthLabel(periodInput)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Ultima version</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">
              {latestVersion ? `v${latestVersion.versionNo}` : "Sin versiones"}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Faltantes ultima version</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">
              {latestVersion ? latestVersion.missingRequiredCount : 0}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Periodo disponible</label>
        <form method="get" className="flex items-center gap-2">
          <select
            name="period"
            defaultValue={periodInput}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
          >
            {periodOptions.map((period) => (
              <option key={period} value={period}>
                {formatPeriodMonthLabel(period)}
              </option>
            ))}
          </select>
        </form>
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Archivo Objetivos Privados</label>
            <input
              type="file"
              required
              accept=".xlsx,.xls,.csv"
              onChange={handlePrivateFileChange}
              className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-neutral-800"
            />
            {privateSheetError ? <p className="mt-1 text-xs text-amber-700">{privateSheetError}</p> : null}
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Hoja Objetivos Privados</label>
            <select
              value={selectedPrivateSheetName}
              onChange={(event) => setSelectedPrivateSheetName(event.target.value)}
              disabled={privateSheetNames.length === 0}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm disabled:bg-neutral-100"
            >
              {privateSheetNames.length === 0 ? (
                <option value="">Sin hojas detectadas</option>
              ) : (
                privateSheetNames.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Archivo Drill Down Cuotas</label>
            <input
              type="file"
              required
              accept=".xlsx,.xls,.csv"
              onChange={handleDrillDownFileChange}
              className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-neutral-800"
            />
            {drillDownSheetError ? <p className="mt-1 text-xs text-amber-700">{drillDownSheetError}</p> : null}
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Hoja Drill Down Cuotas</label>
            <select
              value={selectedDrillDownSheetName}
              onChange={(event) => setSelectedDrillDownSheetName(event.target.value)}
              disabled={drillDownSheetNames.length === 0}
              className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm disabled:bg-neutral-100"
            >
              {drillDownSheetNames.length === 0 ? (
                <option value="">Sin hojas detectadas</option>
              ) : (
                drillDownSheetNames.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Nota de cambio</label>
          <input
            type="text"
            value={changeNote}
            onChange={(event) => setChangeNote(event.target.value)}
            placeholder="Contexto de la carga (opcional)"
            className="mt-1 h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={
              previewPending ||
              uploadPending ||
              !selectedPrivateFile ||
              !selectedDrillDownFile ||
              Boolean(privateSheetError) ||
              Boolean(drillDownSheetError)
            }
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
          >
            {previewPending ? "Validando..." : "Validar archivos"}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={
              previewPending ||
              uploadPending ||
              !previewState?.ok ||
              previewState.summary.validRows <= 0
            }
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {uploadPending ? "Guardando version..." : "Guardar nueva version"}
          </button>
        </div>

        {previewState ? (
          <p className={`mt-2 text-sm ${previewState.ok ? "text-emerald-700" : "text-red-700"}`}>
            {previewState.message}
          </p>
        ) : null}

        {uploadState ? (
          <p className={`mt-2 text-sm ${uploadState.ok ? "text-emerald-700" : "text-red-700"}`}>
            {uploadState.message}
          </p>
        ) : null}
      </div>

      {previewState?.ok ? (
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Resumen de validacion</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center md:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Filas validas</p>
              <p className="text-sm font-semibold text-neutral-900">{previewState.summary.validRows}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Advertencias</p>
              <p className="text-sm font-semibold text-neutral-900">{previewState.summary.warningCount}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Criticos</p>
              <p className="text-sm font-semibold text-neutral-900">
                {previewState.summary.criticalCount}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Duplicadas</p>
              <p className="text-sm font-semibold text-neutral-900">{previewState.summary.duplicatedRows}</p>
            </div>
          </div>

          {previewState.summary.sourceBreakdown.length > 0 ? (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-800">
              <p className="font-semibold text-neutral-900">Desglose por archivo</p>
              {previewState.summary.sourceBreakdown.map((item, index) => (
                <p key={`${item.sourceType}-${index}`}>
                  - {formatSourceLabel(item.sourceType)} ({item.sourceFileName ?? "sin nombre"}, hoja {item.sheetName || "-"}): parseadas {item.parsedRows}, advertencias {item.invalidRows}, fuera de periodo {item.skippedByPeriod}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <p className="font-semibold">
                Criticos: {previewState.summary.criticalCount}
              </p>
              <p>
                Falta objetivo para combinaciones requeridas de ruta + product_name.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">
                Advertencias: {previewState.summary.warningCount}
              </p>
              <p>
                Incluye filas atipicas (ruta/producto no mapeado, target invalido, duplicadas, fuera de periodo).
              </p>
            </div>
          </div>

          {previewState.summary.criticalExamples.length > 0 ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <p className="font-semibold">Ejemplos de criticos</p>
              {previewState.summary.criticalExamples.slice(0, 8).map((example, index) => (
                <p key={`critical-${index}`}>- {example}</p>
              ))}
            </div>
          ) : null}

          {invalidGroups.length > 0 ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <p className="font-semibold">Advertencias agrupadas por tipo</p>
              {invalidGroups.map((group) => (
                <p key={group.code}>- {formatInvalidCodeLabel(group.code)}: {group.count}</p>
              ))}
            </div>
          ) : null}

          {previewState.summary.invalidDetails.length > 0 ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-xs text-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Detalle de advertencias por fila</p>
                <button
                  type="button"
                  onClick={downloadInvalidRowsCsv}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
                >
                  Descargar alertas (CSV)
                </button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500">
                      <th className="px-2 py-1">Severidad</th>
                      <th className="px-2 py-1">Hoja</th>
                      <th className="px-2 py-1">Fila</th>
                      <th className="px-2 py-1">Ruta</th>
                      <th className="px-2 py-1">Producto</th>
                      <th className="px-2 py-1">Team</th>
                      <th className="px-2 py-1">Error</th>
                      <th className="px-2 py-1">Accion sugerida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInvalidDetails.slice(0, 50).map((detail, index) => (
                      <tr key={`${detail.code}-${detail.rowNumber}-${index}`} className="border-b border-neutral-100">
                        <td className="px-2 py-1">{detail.severity === "critical" ? "Critico" : "Advertencia"}</td>
                        <td className="px-2 py-1">{detail.sourceSheetName ?? "-"}</td>
                        <td className="px-2 py-1">{detail.rowNumber}</td>
                        <td className="px-2 py-1">{detail.route ?? "-"}</td>
                        <td className="px-2 py-1">{detail.productName ?? "-"}</td>
                        <td className="px-2 py-1">{detail.teamId ?? "-"}</td>
                        <td className="px-2 py-1">{detail.message}</td>
                        <td className="px-2 py-1">{detail.actionSuggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sortedInvalidDetails.length > 50 ? (
                <p className="mt-2 text-[11px] text-neutral-500">
                  Mostrando 50 filas. Descarga el CSV para ver el detalle completo.
                </p>
              ) : null}
            </div>
          ) : null}

          {previewState.summary.teamAlerts.length > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">Criticos por team</p>
              {previewState.summary.teamAlerts.slice(0, 8).map((alert) => (
                <p key={alert.teamId}>
                  - {alert.teamId}: {alert.missingCount} faltantes criticos ({alert.missingExamples.join(" | ")})
                </p>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Sin criticos: cobertura completa para las combinaciones requeridas.
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Historial de versiones</h3>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Archivo</th>
              <th className="px-3 py-2">Cobertura</th>
              <th className="px-3 py-2">Creado</th>
              <th className="px-3 py-2">Descargas</th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                  Aun no hay versiones registradas para este periodo.
                </td>
              </tr>
            ) : (
              versions.map((version) => (
                <tr key={version.id} className="border-b border-neutral-100">
                  <td className="px-3 py-2 font-medium text-neutral-900">v{version.versionNo}</td>
                  <td className="px-3 py-2 text-neutral-700">
                    <p>{version.sourceFileName ?? "-"}</p>
                    <p className="text-xs text-neutral-500">{version.sheetName ?? "-"}</p>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">
                    <p>Validas: {version.validRows}</p>
                    <p className="text-xs text-neutral-500">
                      Advertencias: {version.invalidRows} | Criticos: {version.missingRequiredCount}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{formatDateTime(version.createdAt)}</td>
                  <td className="px-3 py-2 text-neutral-700">
                    <div className="flex flex-wrap gap-2">
                      {version.hasPrivateFile ? (
                        <a
                          href={`/api/admin/objetivos/versions/${encodeURIComponent(version.id)}/download?source=private`}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                        >
                          Privados
                        </a>
                      ) : null}
                      {version.hasDrillDownFile ? (
                        <a
                          href={`/api/admin/objetivos/versions/${encodeURIComponent(version.id)}/download?source=drilldown`}
                          className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                        >
                          Drill Down
                        </a>
                      ) : null}
                      {!version.hasPrivateFile && !version.hasDrillDownFile ? (
                        <span className="text-xs text-neutral-500">No disponible</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
