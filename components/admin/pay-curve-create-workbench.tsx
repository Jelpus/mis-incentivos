"use client";

import { useMemo, useState, useTransition } from "react";
import { PayCurveChart } from "@/components/admin/pay-curve-chart";
import type { PayCurvePoint } from "@/lib/admin/pay-curves/catalog";
import { savePayCurveAction, updatePayCurveAction } from "@/app/admin/curvas-de-pago/actions";

type Props = {
  initialTemplatePoints: PayCurvePoint[];
  mode?: "create" | "edit";
  curveId?: string;
  initialName?: string;
  initialDescription?: string;
};

type ValidationResult = {
  ok: boolean;
  errors: string[];
};

function formatTemplate(points: PayCurvePoint[]): string {
  return JSON.stringify(points, null, 2);
}

function toSafeNumber(raw: string): number {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizePointValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

function validatePoints(points: PayCurvePoint[]): ValidationResult {
  const errors: string[] = [];

  if (points.length < 2) {
    errors.push("Debes incluir al menos 2 puntos en la curva.");
    return { ok: false, errors };
  }

  let previousCoverage = -Infinity;
  const seenCoverage = new Set<number>();

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Number.isFinite(point.cobertura)) {
      errors.push(`Fila ${index + 1}: cobertura invalida.`);
      continue;
    }
    if (!Number.isFinite(point.pago)) {
      errors.push(`Fila ${index + 1}: pago invalido.`);
      continue;
    }
    if (point.cobertura < previousCoverage) {
      errors.push(`Fila ${index + 1}: cobertura debe estar en orden ascendente.`);
    }
    if (seenCoverage.has(point.cobertura)) {
      errors.push(`Fila ${index + 1}: cobertura repetida (${point.cobertura}).`);
    }
    previousCoverage = point.cobertura;
    seenCoverage.add(point.cobertura);
  }

  return { ok: errors.length === 0, errors };
}

function parsePointsFromBulk(text: string): { points: PayCurvePoint[]; errors: string[] } {
  const errors: string[] = [];
  const points: PayCurvePoint[] = [];
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const parts = line.split(/[\t,;]+/g).map((part) => part.trim());
    if (parts.length < 2) {
      errors.push(`Linea ${index + 1}: se esperan 2 columnas (cobertura, pago).`);
      continue;
    }

    const coverage = Number(parts[0]);
    const payment = Number(parts[1]);

    const maybeHeader =
      Number.isNaN(coverage) &&
      Number.isNaN(payment) &&
      /[a-z]/i.test(parts[0] ?? "") &&
      /[a-z]/i.test(parts[1] ?? "");

    if (maybeHeader) continue;

    if (!Number.isFinite(coverage) || !Number.isFinite(payment)) {
      errors.push(`Linea ${index + 1}: valores invalidos.`);
      continue;
    }

    points.push({ cobertura: coverage, pago: payment });
  }

  return { points, errors };
}

function parsePointsFromJson(raw: string): { points: PayCurvePoint[] | null; error: string | null } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { points: null, error: "El JSON debe ser un arreglo de puntos." };
    }

    const points: PayCurvePoint[] = parsed.map((row) => ({
      cobertura: Number((row as { cobertura?: unknown }).cobertura),
      pago: Number((row as { pago?: unknown }).pago),
    }));

    return { points, error: null };
  } catch (error) {
    return {
      points: null,
      error: error instanceof Error ? `JSON invalido: ${error.message}` : "JSON invalido.",
    };
  }
}

export function PayCurveCreateWorkbench({
  initialTemplatePoints,
  mode = "create",
  curveId,
  initialName,
  initialDescription,
}: Props) {
  const [curveName, setCurveName] = useState(initialName ?? "Curva Nueva");
  const [curveDescription, setCurveDescription] = useState(initialDescription ?? "");
  const [rows, setRows] = useState<Array<{ cobertura: string; pago: string }>>(
    initialTemplatePoints.map((point) => ({
      cobertura: normalizePointValue(point.cobertura),
      pago: normalizePointValue(point.pago),
    })),
  );
  const [bulkText, setBulkText] = useState("");
  const [jsonText, setJsonText] = useState(formatTemplate(initialTemplatePoints));
  const [savedMessage, setSavedMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [bulkMessage, setBulkMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSavingTransition] = useTransition();

  const parsedPoints = useMemo(
    () =>
      rows.map((row) => ({
        cobertura: toSafeNumber(row.cobertura),
        pago: toSafeNumber(row.pago),
      })),
    [rows],
  );

  const validation = useMemo(() => validatePoints(parsedPoints), [parsedPoints]);
  const pointsPreview = validation.ok ? parsedPoints : initialTemplatePoints;

  function handleResetTemplate() {
    setRows(
      initialTemplatePoints.map((point) => ({
        cobertura: normalizePointValue(point.cobertura),
        pago: normalizePointValue(point.pago),
      })),
    );
    setBulkText("");
    setBulkMessage(null);
    setSavedMessage(null);
  }

  function handleAddRow() {
    setRows((previous) => [...previous, { cobertura: "", pago: "" }]);
  }

  function handleDeleteRow(index: number) {
    setRows((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleSortByCoverage() {
    setRows((previous) =>
      [...previous].sort((a, b) => toSafeNumber(a.cobertura) - toSafeNumber(b.cobertura)),
    );
  }

  function handleApplyBulkPaste() {
    const result = parsePointsFromBulk(bulkText);
    if (result.errors.length > 0) {
      setBulkMessage({
        kind: "error",
        text: `No se aplico pegado masivo. ${result.errors[0]}`,
      });
      return;
    }
    if (result.points.length < 2) {
      setBulkMessage({
        kind: "error",
        text: "El pegado masivo requiere al menos 2 filas validas.",
      });
      return;
    }

    setRows(
      result.points.map((point) => ({
        cobertura: normalizePointValue(point.cobertura),
        pago: normalizePointValue(point.pago),
      })),
    );
    setBulkMessage({
      kind: "ok",
      text: `Pegado aplicado: ${result.points.length} puntos cargados.`,
    });
  }

  function handleLoadJsonFromRows() {
    setJsonText(
      formatTemplate(
        rows.map((row) => ({
          cobertura: toSafeNumber(row.cobertura),
          pago: toSafeNumber(row.pago),
        })),
      ),
    );
  }

  function handleApplyJson() {
    const parsed = parsePointsFromJson(jsonText);
    if (parsed.error || !parsed.points) {
      setBulkMessage({
        kind: "error",
        text: parsed.error ?? "JSON invalido.",
      });
      return;
    }

    setRows(
      parsed.points.map((point) => ({
        cobertura: normalizePointValue(point.cobertura),
        pago: normalizePointValue(point.pago),
      })),
    );
    setBulkMessage({
      kind: "ok",
      text: `JSON aplicado: ${parsed.points.length} puntos cargados.`,
    });
  }

  function handleSave() {
    if (!validation.ok) {
      setSavedMessage({
        kind: "error",
        text: `La curva tiene errores de validacion. ${validation.errors[0]}`,
      });
      return;
    }

    startSavingTransition(async () => {
      const finalResult =
        mode === "edit" && curveId
          ? await updatePayCurveAction({
              curveId,
              name: curveName,
              description: curveDescription,
              points: parsedPoints,
            })
          : await savePayCurveAction({
              name: curveName,
              description: curveDescription,
              points: parsedPoints,
            });

      setSavedMessage({
        kind: finalResult.ok ? "ok" : "error",
        text: finalResult.ok
          ? `${finalResult.message} Codigo: ${finalResult.curveCode}.`
          : finalResult.message,
      });
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">
          {mode === "edit" ? "Editar curva" : "Nueva curva"}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Captura por tabla y pegado masivo. Usa JSON solo si necesitas un ajuste avanzado.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Nombre</span>
            <input
              value={curveName}
              onChange={(event) => setCurveName(event.target.value)}
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              placeholder="Ej. Curva Cobertura Onco"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Descripcion</span>
            <textarea
              value={curveDescription}
              onChange={(event) => setCurveDescription(event.target.value)}
              rows={2}
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              placeholder="Breve descripcion funcional de la curva"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResetTemplate}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Cargar plantilla base
          </button>
          <button
            type="button"
            onClick={handleAddRow}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Agregar fila
          </button>
          <button
            type="button"
            onClick={handleSortByCoverage}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Ordenar por cobertura
          </button>
        </div>

        <div className="mt-4 max-h-[26rem] overflow-auto rounded-2xl border border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Cobertura</th>
                <th className="px-3 py-2">Pago</th>
                <th className="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`row-${index}`} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-3 py-2 text-neutral-600">{index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.cobertura}
                      onChange={(event) =>
                        setRows((previous) =>
                          previous.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, cobertura: event.target.value }
                              : current,
                          ),
                        )
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.pago}
                      onChange={(event) =>
                        setRows((previous) =>
                          previous.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, pago: event.target.value }
                              : current,
                          ),
                        )
                      }
                      placeholder="0.00"
                      className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(index)}
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Pegado masivo (cobertura y pago)
          </label>
          <textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={4}
            placeholder={"Pega desde Excel con 2 columnas.\nEj:\n0.00\t0.00\n1.00\t1.00\n1.10\t1.50"}
            className="rounded-xl border border-neutral-300 px-3 py-2 font-mono text-xs text-neutral-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApplyBulkPaste}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Aplicar pegado
            </button>
          </div>
        </div>

        <details className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-600">
            Modo avanzado (JSON)
          </summary>
          <div className="mt-3 grid gap-2">
            <textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              rows={8}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLoadJsonFromRows}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Refrescar JSON desde tabla
              </button>
              <button
                type="button"
                onClick={handleApplyJson}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Aplicar JSON a tabla
              </button>
            </div>
          </div>
        </details>

        {bulkMessage ? (
          <p
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              bulkMessage.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {bulkMessage.text}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? "Guardando..." : "Guardar curva"}
          </button>
        </div>

        {savedMessage ? (
          <p
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              savedMessage.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {savedMessage.text}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-neutral-950">Validacion</h3>
          {validation.ok ? (
            <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Curva valida. Puntos: {parsedPoints.length}.
            </p>
          ) : (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <ul className="list-disc pl-4">
                {validation.errors.slice(0, 6).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-neutral-950">Preview cobertura vs pago</h3>
          <p className="mt-1 text-sm text-neutral-600">
            La grafica usa tus puntos si la validacion es correcta; si no, muestra la plantilla base.
          </p>
          <div className="mt-4">
            <PayCurveChart points={pointsPreview} />
          </div>
        </div>
      </section>
    </div>
  );
}
