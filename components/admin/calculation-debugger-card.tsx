"use client";

import { FormEvent, ReactNode, useMemo, useState, useTransition } from "react";
import type { CalculationDebuggerPageData } from "@/lib/admin/calculation-debugger/types";

type DiagnosisResponse = {
  bugReportId: string;
  diagnosisId: string | null;
  diagnosis: {
    diagnosisSummary: string;
    suspectedCause: string;
    recommendedFix: string;
    confidenceScore: number;
    difference: number;
    evidence: string[];
    traceData: Record<string, unknown>;
  };
};

type Props = {
  data: CalculationDebuggerPageData;
};

function formatNumber(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0%";
  return `${(parsed * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function getNumber(row: Record<string, unknown>, key: string): number {
  const parsed = Number(row[key]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumRows(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((sum, row) => sum + getNumber(row, key), 0);
}

function formatText(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw || "-";
}

function normalizeFileCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function DownloadLink({ href, label }: { href: unknown; label: string }) {
  const url = String(href ?? "").trim();
  if (!url) return null;
  return (
    <a
      href={url}
      className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100"
    >
      {label}
    </a>
  );
}

function statusClass(status: unknown): string {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "ok" || normalized === "exact") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "warning" || normalized === "fuzzy") return "border-amber-200 bg-amber-50 text-amber-800";
  if (normalized === "error" || normalized === "none") return "border-red-200 bg-red-50 text-red-800";
  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

function StatusPill({ value }: { value: unknown }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(value)}`}>
      {formatText(value)}
    </span>
  );
}

function DataTable({
  rows,
  columns,
  empty,
}: {
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; format?: "number" | "percent" | "status" }>;
  empty: string;
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full text-xs">
        <thead className="bg-neutral-50 text-left uppercase tracking-wide text-neutral-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-2 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-neutral-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column.key} className="max-w-[16rem] truncate px-3 py-2 align-top">
                    {column.format === "number" ? (
                      formatNumber(row[column.key])
                    ) : column.format === "percent" ? (
                      formatPercent(row[column.key])
                    ) : column.format === "status" ? (
                      <StatusPill value={row[column.key]} />
                    ) : (
                      formatText(row[column.key])
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StageSection({
  title,
  verdict,
  children,
}: {
  title: string;
  verdict: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-neutral-950">{title}</h3>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-700">
          {verdict}
        </span>
      </div>
      {children}
    </section>
  );
}

const PROGRESS_STEPS = [
  "Localizando representante y team_id",
  "Leyendo Pay Components y fuentes",
  "Abriendo archivos fuente en Storage",
  "Reconstruyendo objetivos y asignacion",
  "Calculando resultado, cobertura y pago",
  "Revisando garantias y overrides",
  "Preparando evidencia",
];

function ProgressModal() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/45 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Investigacion en progreso</p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">Reconstruyendo el calculo</h2>
          </div>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
        <div className="mt-4 grid gap-2">
          {PROGRESS_STEPS.map((step) => (
            <div
              key={step}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
            >
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              {step}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Estos pasos se ejecutan en servidor. La pantalla se cerrara cuando el diagnostico este listo.
        </p>
      </div>
    </div>
  );
}

function CalculationEvidence({ result }: { result: DiagnosisResponse }) {
  const trace = asRecord(result.diagnosis.traceData);
  const preview = asRecord(trace.calculationPreview);
  const objectiveSource = asRecord(trace.objectiveSource);
  const objectiveDownloads = asRecord(objectiveSource.downloads);
  const objectives = asRows(trace.objectives);
  const assignments = asRows(preview.matchingAssignments);
  const includedSourceRows = asRows(preview.includedSourceRows);
  const finalRows = asRows(preview.finalRows);
  const groupingDetails = asRows(preview.groupingDetails);
  const sourceFiles = asRows(trace.sourceFiles);
  const ruleItems = asRows(trace.ruleItems);
  const payCurves = asRows(trace.payCurves);
  const guarantees = asRows(trace.guarantees);
  const overrides = asRows(asRecord(trace.overrides).rows);

  const objectiveTotal = sumRows(objectives, "target");
  const resultTotal = sumRows(assignments, "resultado");
  const finalRow = finalRows[0] ?? {};
  const cobertura = getNumber(finalRow, "cobertura");
  const coberturaPago = getNumber(finalRow, "coberturapago");
  const pagoVariable = getNumber(finalRow, "pagovariable");
  const pagoResultado = getNumber(finalRow, "pagoresultado");
  const prodWeight = getNumber(finalRow, "prod_weight");

  return (
    <div className="grid min-w-0 gap-4">
      <StageSection
        title="Calculo de Objetivo"
        verdict={`${objectives.length} filas | total ${formatNumber(objectiveTotal)}`}
      >
        <div className="mb-3 min-w-0 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Archivo de origen</p>
              <p className="mt-1 max-w-full truncate text-sm font-semibold text-neutral-900">
                {formatText(objectiveSource.sourceFileName)}
              </p>
              <p className="text-xs text-neutral-500">
                Version {formatText(objectiveSource.versionNo)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DownloadLink href={objectiveDownloads.private} label="Descargar objetivos privados" />
              <DownloadLink href={objectiveDownloads.drilldown} label="Descargar drill down" />
            </div>
          </div>
        </div>
        <p className="mb-3 text-sm text-neutral-600">
          Estas filas son las cuotas que forman el objetivo para la ruta/producto. Si aqui falta una fila,
          esta duplicada o tiene brick/cuenta incorrecto, el error nace antes del calculo.
        </p>
        <DataTable
          rows={objectives}
          empty="No hay filas de objetivo para esta ruta/producto."
          columns={[
            { key: "territorio_individual", label: "Ruta" },
            { key: "product_name", label: "Producto" },
            { key: "plan_type_name", label: "Tipo" },
            { key: "brick", label: "Brick" },
            { key: "cuenta", label: "Cuenta" },
            { key: "metodo", label: "Metodo" },
            { key: "sales_credity", label: "Sales Credity", format: "number" },
            { key: "source_row_number", label: "Fila archivo", format: "number" },
            { key: "target", label: "Target", format: "number" },
          ]}
        />
        {includedSourceRows.length > 0 ? (
          <details className="mt-3 min-w-0 overflow-hidden rounded-lg border border-neutral-200" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700">
              Filas normalizadas incluidas desde BigQuery
            </summary>
            <div className="grid min-w-0 gap-3 p-3">
              <DataTable
                rows={includedSourceRows}
                empty="No se encontraron filas normalizadas para estas asignaciones."
                columns={[
                  { key: "assignmentKey", label: "Asignacion" },
                  { key: "sourceLookupMode", label: "Busqueda" },
                  { key: "normalizedRows", label: "Filas BQ", format: "number" },
                  { key: "normalizedTotal", label: "Total BQ", format: "number" },
                  { key: "assignmentValor", label: "Valor asignado", format: "number" },
                  { key: "differenceVsAssignment", label: "Diferencia", format: "number" },
                ]}
              />
              {includedSourceRows.map((group, index) => (
                <details key={`${group.assignmentKey ?? index}`} className="min-w-0 overflow-hidden rounded-lg border border-neutral-200">
                  <summary className="cursor-pointer truncate px-3 py-2 text-xs font-semibold text-neutral-700">
                    Ver filas: {formatText(group.assignmentKey)}
                  </summary>
                  <div className="p-3">
                    <DataTable
                      rows={asRows(group.rows)}
                      empty="Sin filas."
                      columns={[
                        { key: "archivo", label: "Archivo" },
                        { key: "fuente", label: "Fuente" },
                        { key: "metric", label: "Metric" },
                        { key: "molecula_producto", label: "Molecula" },
                        { key: "brick", label: "Brick" },
                        { key: "estado", label: "Estado" },
                        { key: "codigo_estado", label: "Cod estado" },
                        { key: "ytd", label: "YTD", format: "number" },
                        { key: "valor", label: "Valor", format: "number" },
                        { key: "effective_value", label: "Usado", format: "number" },
                      ]}
                    />
                  </div>
                </details>
              ))}
            </div>
          </details>
        ) : null}
      </StageSection>

      <StageSection
        title="Origen del Archivo"
        verdict={`${sourceFiles.length} archivos auditados`}
      >
        <p className="mb-3 text-sm text-neutral-600">
          Archivos almacenados que alimentan las fuentes del Pay Component. Revisa headers detectados,
          columnas resueltas y alertas.
        </p>
        <div className="max-w-full overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full text-xs">
            <thead className="bg-neutral-50 text-left uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">File code</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Archivo</th>
                <th className="px-3 py-2">Hoja</th>
                <th className="px-3 py-2">Filas</th>
                <th className="px-3 py-2">Filtros esperados</th>
                <th className="px-3 py-2">Alertas</th>
                <th className="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
              {sourceFiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-neutral-500">
                    No se auditaron archivos fuente. Revisa si el Pay Component tiene fuentes configuradas
                    o si el archivo usado en asignacion no coincide con team_incentive_source_files.
                  </td>
                </tr>
              ) : (
                sourceFiles.map((file, index) => {
                  const metadata = asRecord(file.metadata);
                  const workbook = asRecord(file.workbook);
                  const expectedSources = asRows(file.expectedFromPayComponents);
                  const expectedFilters = expectedSources
                    .map((source) => {
                      const parts = [
                        source.fuente ? `fuente=${formatText(source.fuente)}` : "",
                        source.metric ? `metric=${formatText(source.metric)}` : "",
                        source.molecula_producto ? `molecula=${formatText(source.molecula_producto)}` : "",
                      ].filter(Boolean);
                      return parts.join(" / ");
                    })
                    .filter(Boolean)
                    .join(" | ");
                  const issues = Array.isArray(file.issues) ? file.issues.join(" | ") : "";
                  return (
                    <tr key={`${file.fileCode ?? index}`}>
                      <td className="px-3 py-2 font-semibold">{formatText(file.fileCode)}</td>
                      <td className="px-3 py-2"><StatusPill value={file.status} /></td>
                      <td className="max-w-[16rem] truncate px-3 py-2 align-top">{formatText(metadata.original_file_name)}</td>
                      <td className="px-3 py-2">{formatText(workbook.inspectedSheet)}</td>
                      <td className="px-3 py-2">{formatNumber(workbook.inspectedRows)}</td>
                      <td className="max-w-[20rem] whitespace-normal break-words px-3 py-2 align-top">{expectedFilters || "-"}</td>
                      <td className="max-w-[22rem] whitespace-normal break-words px-3 py-2 align-top">{issues || "-"}</td>
                      <td className="px-3 py-2"><DownloadLink href={file.downloadUrl} label="Descargar" /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </StageSection>

      <StageSection
        title="Calculo de Resultados"
        verdict={`${assignments.length} filas | resultado ${formatNumber(resultTotal)}`}
      >
        <p className="mb-3 text-sm text-neutral-600">
          Estas filas muestran que data original entro al calculo. `none` significa que la cuota no encontro
          match contra archivo/filtros y suele explicar resultados en cero.
        </p>
        {sourceFiles.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {sourceFiles.map((file, index) => (
              <DownloadLink
                key={`${file.fileCode ?? index}`}
                href={file.downloadUrl}
                label={`Descargar ${formatText(file.fileCode)}`}
              />
            ))}
          </div>
        ) : null}
        <DataTable
          rows={assignments.map((row) => {
            const fileCode = normalizeFileCode(row.file_code || row.archivo);
            const sourceFile = sourceFiles.find((file) => normalizeFileCode(file.fileCode) === fileCode);
            const metadata = asRecord(sourceFile?.metadata);
            return {
              ...row,
              archivo_descarga: metadata.original_file_name ?? row.archivo,
              sales_credity: row.peso,
            };
          })}
          empty="No hay filas de asignacion para esta ruta/producto."
          columns={[
            { key: "archivo_descarga", label: "Archivo usado" },
            { key: "fuente", label: "Fuente" },
            { key: "metric", label: "Metric" },
            { key: "molecula_producto", label: "Molecula" },
            { key: "brick", label: "Brick" },
            { key: "cuenta", label: "Cuenta" },
            { key: "objetivo", label: "Objetivo", format: "number" },
            { key: "valor", label: "Valor", format: "number" },
            { key: "sales_credity", label: "SC", format: "number" },
            { key: "resultado", label: "Resultado", format: "number" },
            { key: "match_mode", label: "Match", format: "status" },
            { key: "none_reason", label: "Razon" },
          ]}
        />
      </StageSection>

      <StageSection
        title="Calculo de Cobertura"
        verdict={`${formatNumber(resultTotal)} / ${formatNumber(objectiveTotal)} = ${formatPercent(cobertura)}`}
      >
        <DataTable
          rows={finalRows}
          empty="No hay fila final para calcular cobertura."
          columns={[
            { key: "product_name", label: "Producto" },
            { key: "objetivo", label: "Objetivo", format: "number" },
            { key: "resultado", label: "Resultado", format: "number" },
            { key: "actual", label: "Actual", format: "number" },
            { key: "cobertura", label: "Cobertura", format: "percent" },
            { key: "calcular_en_valores", label: "Valores" },
          ]}
        />
        {groupingDetails.length > 0 ? (
          <details className="mt-3 min-w-0 overflow-hidden rounded-lg border border-neutral-200">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700">
              Detalle de agrupacion / conversion a valores
            </summary>
            <div className="p-3">
              <DataTable
                rows={groupingDetails}
                empty="Sin detalle de agrupacion."
                columns={[
                  { key: "product_name_origen", label: "Producto origen" },
                  { key: "product_name_final", label: "Producto final" },
                  { key: "precio_promedio", label: "Precio prom", format: "number" },
                  { key: "objetivo_unidades", label: "Obj unidades", format: "number" },
                  { key: "resultado_unidades", label: "Res unidades", format: "number" },
                  { key: "objetivo_dinero", label: "Obj dinero", format: "number" },
                  { key: "resultado_dinero", label: "Res dinero", format: "number" },
                ]}
              />
            </div>
          </details>
        ) : null}
      </StageSection>

      <StageSection
        title="Calculo de Cobertura Pago"
        verdict={`cobertura ${formatPercent(cobertura)} -> pago ${formatPercent(coberturaPago)}`}
      >
        <p className="mb-3 text-sm text-neutral-600">
          La cobertura se cruza contra la curva configurada en el Pay Component. Si la curva o puntos no corresponden,
          la falla esta en la configuracion de pago.
        </p>
        <DataTable
          rows={ruleItems}
          empty="No hay Pay Component para mostrar curva."
          columns={[
            { key: "product_name", label: "Producto" },
            { key: "plan_type_name", label: "Tipo" },
            { key: "prod_weight", label: "Peso", format: "percent" },
            { key: "curva_pago", label: "Curva id" },
            { key: "agrupador", label: "Agrupador" },
          ]}
        />
        {payCurves.map((curve, index) => (
          <details key={`${curve.id ?? index}`} className="mt-3 min-w-0 overflow-hidden rounded-lg border border-neutral-200">
            <summary className="cursor-pointer truncate px-3 py-2 text-xs font-semibold text-neutral-700">
              {formatText(curve.curve_name)} ({formatText(curve.id)})
            </summary>
            <div className="p-3">
              <DataTable
                rows={asRows(curve.points)}
                empty="Curva sin puntos."
                columns={[
                  { key: "cobertura", label: "Cobertura", format: "percent" },
                  { key: "pago", label: "Pago", format: "percent" },
                ]}
              />
            </div>
          </details>
        ))}
      </StageSection>

      <StageSection
        title="Calculo de Pago"
        verdict={`${formatPercent(prodWeight)} x base = ${formatNumber(pagoVariable)}; pago final ${formatNumber(pagoResultado)}`}
      >
        <DataTable
          rows={finalRows}
          empty="No hay fila final de pago."
          columns={[
            { key: "prod_weight", label: "Parrilla", format: "percent" },
            { key: "pagovariable", label: "Pago variable", format: "number" },
            { key: "coberturapago", label: "Cob pago", format: "percent" },
            { key: "pagoresultado", label: "Pago resultado", format: "number" },
            { key: "garantia", label: "Garantia" },
          ]}
        />
      </StageSection>

      <StageSection
        title="Override de Garantias y Ajustes"
        verdict={`${guarantees.length} garantias | ${overrides.length} overrides`}
      >
        <div className="grid gap-3">
          <DataTable
            rows={guarantees}
            empty="No hay garantia activa aplicable."
            columns={[
              { key: "scope_type", label: "Scope" },
              { key: "scope_value", label: "Valor" },
              { key: "rule_scope", label: "Regla" },
              { key: "rule_key", label: "Producto" },
              { key: "target_coverage", label: "Coverage", format: "number" },
              { key: "guarantee_payment_preference", label: "Preferencia" },
            ]}
          />
          <DataTable
            rows={overrides}
            empty="No hay override manual activo para este producto."
            columns={[
              { key: "stage", label: "Stage" },
              { key: "kind", label: "Tipo" },
              { key: "delta_pagoresultado", label: "Delta", format: "number" },
              { key: "is_active", label: "Activo" },
              { key: "comment", label: "Comentario" },
            ]}
          />
        </div>
      </StageSection>
    </div>
  );
}

export function CalculationDebuggerCard({ data }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(data.periods[0]?.value ?? "");
  const [selectedRepresentative, setSelectedRepresentative] = useState("");
  const [representativeQuery, setRepresentativeQuery] = useState("");
  const [representativeSearchOpen, setRepresentativeSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [metric, setMetric] = useState("resultado");
  const [expectedValue, setExpectedValue] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<DiagnosisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const representatives = useMemo(() => {
    return data.representatives.filter((item) => item.period === selectedPeriod);
  }, [data.representatives, selectedPeriod]);

  const filteredRepresentatives = useMemo(() => {
    const query = normalizeSearch(representativeQuery);
    if (!query) return representatives;
    return representatives.filter((item) => {
      return (
        normalizeSearch(item.label).includes(query) ||
        normalizeSearch(item.value).includes(query) ||
        normalizeSearch(item.territory).includes(query) ||
        normalizeSearch(item.representativeName).includes(query) ||
        normalizeSearch(item.teamId).includes(query)
      );
    });
  }, [representativeQuery, representatives]);

  const products = useMemo(() => {
    return data.products.filter(
      (item) => item.period === selectedPeriod && item.representativeValue === selectedRepresentative,
    );
  }, [data.products, selectedPeriod, selectedRepresentative]);

  const difference = useMemo(() => {
    const expected = Number(String(expectedValue).replace(",", "."));
    const actual = Number(String(actualValue).replace(",", "."));
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) return 0;
    return actual - expected;
  }, [actualValue, expectedValue]);

  function onPeriodChange(value: string) {
    setSelectedPeriod(value);
    setSelectedRepresentative("");
    setRepresentativeQuery("");
    setRepresentativeSearchOpen(false);
    setSelectedProduct("");
    setResult(null);
    setError(null);
  }

  function selectRepresentative(value: string) {
    const representative = representatives.find((item) => item.value === value);
    setSelectedRepresentative(value);
    setRepresentativeQuery(representative?.label ?? value);
    setRepresentativeSearchOpen(false);
    setSelectedProduct("");
    setResult(null);
    setError(null);
  }

  function onRepresentativeQueryChange(value: string) {
    setRepresentativeQuery(value);
    setRepresentativeSearchOpen(true);
    const exactMatch = representatives.find((item) => {
      return normalizeSearch(item.label) === normalizeSearch(value) || normalizeSearch(item.value) === normalizeSearch(value);
    });
    setSelectedRepresentative(exactMatch?.value ?? "");
    setSelectedProduct("");
    setResult(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/find-bugs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            period: selectedPeriod,
            representativeName: selectedRepresentative,
            product: selectedProduct,
            metric,
            expectedValue,
            actualValue,
            description,
          }),
        });
        const payload = (await response.json()) as DiagnosisResponse & { error?: string };
        if (!response.ok && response.status !== 207) {
          throw new Error(payload.error ?? "No se pudo investigar el calculo.");
        }
        if (payload.error) {
          setError(payload.error);
        }
        if (payload.diagnosis) {
          setResult(payload);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "No se pudo investigar el calculo.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {isPending ? <ProgressModal /> : null}
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-neutral-700">
            Period
            <select
              value={selectedPeriod}
              onChange={(event) => onPeriodChange(event.target.value)}
              required
              className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500"
            >
              <option value="" disabled>
                Selecciona periodo
              </option>
              {data.periods.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-neutral-700">
            Territory / name
            <div className="relative">
              <input
                value={representativeQuery}
                onChange={(event) => onRepresentativeQueryChange(event.target.value)}
                onFocus={() => setRepresentativeSearchOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setRepresentativeSearchOpen(false), 120);
                }}
                required
                placeholder="Escribe territorio o nombre"
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500"
              />
              {representativeSearchOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                  {filteredRepresentatives.length === 0 ? (
                    <div className="px-3 py-2 text-sm font-normal text-neutral-500">
                      Sin coincidencias.
                    </div>
                  ) : (
                    filteredRepresentatives.map((representative) => (
                      <button
                        key={`${representative.period}-${representative.value}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectRepresentative(representative.value)}
                        className="grid w-full gap-0.5 border-b border-neutral-100 px-3 py-2 text-left text-sm font-normal text-neutral-900 hover:bg-blue-50"
                      >
                        <span>{representative.label}</span>
                        <span className="text-[11px] text-neutral-500">
                          Team {representative.teamId ?? "-"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            {representativeQuery && !selectedRepresentative ? (
              <span className="text-[11px] font-normal text-amber-700">
                Selecciona una opcion de la lista para cargar productos.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1 text-xs font-semibold text-neutral-700">
            Product
            <select
              value={selectedProduct}
              onChange={(event) => setSelectedProduct(event.target.value)}
              required
              disabled={!selectedRepresentative}
              className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500 disabled:bg-neutral-100"
            >
              <option value="" disabled>
                Selecciona producto
              </option>
              {products.map((product) => (
                <option key={`${product.teamId}-${product.value}`} value={product.value}>
                  {product.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-neutral-700">
            Metric
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value)}
              className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500"
            >
              <option value="resultado">resultado</option>
              <option value="pagoresultado">pagoresultado</option>
              <option value="actual">actual</option>
              <option value="objetivo">objetivo</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-neutral-700">
            Expected value
            <input
              value={expectedValue}
              onChange={(event) => setExpectedValue(event.target.value)}
              required
              inputMode="decimal"
              className="h-10 rounded-lg border border-neutral-300 px-3 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500"
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-neutral-700">
            Actual value
            <input
              value={actualValue}
              onChange={(event) => setActualValue(event.target.value)}
              required
              inputMode="decimal"
              className="h-10 rounded-lg border border-neutral-300 px-3 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500"
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-neutral-700 sm:col-span-2">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows={5}
              className="resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900 outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <aside className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Diferencia</p>
          <p className={`mt-2 text-3xl font-semibold ${Math.abs(difference) > 0 ? "text-red-700" : "text-emerald-700"}`}>
            {formatNumber(difference)}
          </p>
          <div className="mt-4 grid gap-2 text-xs text-neutral-600">
            <div className="flex justify-between gap-3">
              <span>Expected</span>
              <span className="font-semibold text-neutral-900">{formatNumber(expectedValue)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Actual</span>
              <span className="font-semibold text-neutral-900">{formatNumber(actualValue)}</span>
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Investigando..." : "Investigar"}
          </button>
          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
            </p>
          ) : null}
        </aside>
      </form>

      {result ? (
        <div className="mt-5 grid gap-4">
  
          <CalculationEvidence result={result} />

        </div>
      ) : null}
    </section>
  );
}
