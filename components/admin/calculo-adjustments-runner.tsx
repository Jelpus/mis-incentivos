"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  applyManualAdjustmentAction,
  deleteManualAdjustmentAction,
  uploadAdjustmentsBatchAction,
} from "@/app/admin/calculo/adjustments/actions";

type AdjustmentActionState =
  | { ok: true; message: string; applied: number; invalid: number; errors: string[] }
  | { ok: false; message: string; errors?: string[] }
  | null;

type Props = {
  periodMonth: string;
  rutas: string[];
  productNames: string[];
  optionsMessage?: string | null;
  existingAdjustments: Array<{
    adjustmentId: string;
    ruta: string;
    productName: string;
    kind: string;
    deltaPagoResultado: number;
    comment: string | null;
    isActive: boolean;
    updatedAt: string | null;
  }>;
  existingAdjustmentsMessage?: string | null;
};

export function CalculoAdjustmentsRunner({
  periodMonth,
  rutas,
  productNames,
  optionsMessage = null,
  existingAdjustments,
  existingAdjustmentsMessage = null,
}: Props) {
  const periodLabel = useMemo(() => periodMonth.slice(0, 7), [periodMonth]);
  const [manualRutaValue, setManualRutaValue] = useState("");
  const [manualRutaOther, setManualRutaOther] = useState("");
  const [manualProductValue, setManualProductValue] = useState("");
  const [manualProductOther, setManualProductOther] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [readingSheets, setReadingSheets] = useState(false);

  const resolvedManualRuta = manualRutaValue === "__other__" ? manualRutaOther : manualRutaValue;
  const resolvedManualProduct = manualProductValue === "__other__" ? manualProductOther : manualProductValue;
  const [batchState, batchAction, batchPending] = useActionState<AdjustmentActionState, FormData>(
    uploadAdjustmentsBatchAction,
    null,
  );
  const [manualState, manualAction, manualPending] = useActionState<AdjustmentActionState, FormData>(
    applyManualAdjustmentAction,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<AdjustmentActionState, FormData>(
    deleteManualAdjustmentAction,
    null,
  );

  async function onBatchFileChange(file: File | null) {
    if (!file) {
      setSheetNames([]);
      setSelectedSheetName("");
      return;
    }

    setReadingSheets(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const names = (workbook.SheetNames ?? []).map((name) => String(name).trim()).filter((name) => name.length > 0);
      setSheetNames(names);
      setSelectedSheetName(names[0] ?? "");
    } catch {
      setSheetNames([]);
      setSelectedSheetName("");
    } finally {
      setReadingSheets(false);
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex justify-end">
        <Link
          href="/admin/calculo"
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Volver a calculo
        </Link>
      </div>

      <p className="text-sm text-neutral-600">
        Periodo: <span className="font-semibold text-neutral-900">{periodLabel}</span>
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Ajusta `pagoresultado` por key (`ruta` + `product_name`) en `resultados_v2`.
        Los cambios se registran con `kind = ajustes` y `comment`.
      </p>
      {optionsMessage ? (
        <p className="mt-2 text-xs text-amber-700">{optionsMessage}</p>
      ) : null}

      <form action={batchAction} className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Carga por Excel/CSV</h3>
        <p className="mt-1 text-xs text-neutral-600">
          Columnas esperadas: `ruta` (o `territorio_individual`), `product_name` (o `plan`), `pagoresultado_delta` (monto a sumar) y opcional `comment`.
        </p>
        <input type="hidden" name="period_month" value={periodMonth} />
        <input type="hidden" name="kind" value="ajuste_batch" />
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              void onBatchFileChange(file);
            }}
            className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-neutral-800"
          />
          {sheetNames.length > 0 ? (
            <select
              name="sheet_name"
              value={selectedSheetName}
              onChange={(event) => setSelectedSheetName(event.target.value)}
              className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-xs text-neutral-900"
            >
              {sheetNames.map((sheetName) => (
                <option key={`sheet-${sheetName}`} value={sheetName}>
                  {sheetName}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              name="sheet_name"
              placeholder={readingSheets ? "Leyendo pestañas..." : "Pestaña (opcional)"}
              className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-xs text-neutral-900"
            />
          )}
          <button
            type="submit"
            disabled={batchPending}
            className="h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {batchPending ? "Procesando..." : "Subir ajustes"}
          </button>
        </div>

        {batchState ? (
          <div className={`mt-2 text-sm ${batchState.ok ? "text-emerald-700" : "text-red-700"}`}>
            <p>{batchState.message}</p>
            {"applied" in batchState ? (
              <p className="mt-1 text-xs text-neutral-600">
                Exitosas: {batchState.applied} | Invalidas: {batchState.invalid}
              </p>
            ) : null}
            {batchState.errors?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {batchState.errors.slice(0, 8).map((error, index) => (
                  <li key={`batch-adjustment-error-${index}`}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>

      <form action={manualAction} className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Ajuste manual</h3>
        <input type="hidden" name="period_month" value={periodMonth} />
        <input type="hidden" name="kind" value="ajuste_manual" />
        <input type="hidden" name="ruta" value={resolvedManualRuta} />
        <input type="hidden" name="product_name" value={resolvedManualProduct} />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            value={manualRutaValue}
            onChange={(event) => setManualRutaValue(event.target.value)}
            required
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="">Selecciona ruta...</option>
            {rutas.map((ruta) => (
              <option key={`manual-ruta-${ruta}`} value={ruta}>
                {ruta}
              </option>
            ))}
            <option value="__other__">Otro...</option>
          </select>
          <select
            value={manualProductValue}
            onChange={(event) => setManualProductValue(event.target.value)}
            required
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="">Selecciona product_name...</option>
            {productNames.map((productName) => (
              <option key={`manual-product-${productName}`} value={productName}>
                {productName}
              </option>
            ))}
            <option value="__other__">Otro...</option>
          </select>
          {manualRutaValue === "__other__" ? (
            <input
              value={manualRutaOther}
              onChange={(event) => setManualRutaOther(event.target.value)}
              placeholder="ruta / territorio_individual"
              required
              className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
            />
          ) : null}
          {manualProductValue === "__other__" ? (
            <input
              value={manualProductOther}
              onChange={(event) => setManualProductOther(event.target.value)}
              placeholder="product_name"
              required
              className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
            />
          ) : null}
          <input
            name="pagoresultado_delta"
            placeholder="monto a sumar (ej: 1500.5)"
            required
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
          />
          <input
            name="comment"
            placeholder="comentario"
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={manualPending}
          className="mt-3 h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {manualPending ? "Aplicando..." : "Aplicar ajuste manual"}
        </button>

        {manualState ? (
          <div className={`mt-2 text-sm ${manualState.ok ? "text-emerald-700" : "text-red-700"}`}>
            <p>{manualState.message}</p>
            {"applied" in manualState ? (
              <p className="mt-1 text-xs text-neutral-600">
                Exitosas: {manualState.applied} | Invalidas: {manualState.invalid}
              </p>
            ) : null}
            {manualState.errors?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {manualState.errors.slice(0, 8).map((error, index) => (
                  <li key={`manual-adjustment-error-${index}`}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-semibold text-red-900">Desactivar ajustes</h3>
        <p className="mt-1 text-xs text-red-800">
          Lista de ajustes del periodo con accion directa por fila.
        </p>
        {existingAdjustmentsMessage ? (
          <p className="mt-2 text-xs text-amber-700">{existingAdjustmentsMessage}</p>
        ) : null}
        <div className="mt-3 overflow-x-auto rounded-xl border border-red-200 bg-white">
          <table className="min-w-full text-xs text-neutral-700">
            <thead>
              <tr className="border-b border-red-100 bg-red-50 text-left uppercase tracking-wide text-red-700">
                <th className="px-2 py-1">Ruta</th>
                <th className="px-2 py-1">Product</th>
                <th className="px-2 py-1">Kind</th>
                <th className="px-2 py-1">Delta PR</th>
                <th className="px-2 py-1">Comment</th>
                <th className="px-2 py-1">Estado</th>
                <th className="px-2 py-1">Accion</th>
              </tr>
            </thead>
            <tbody>
              {existingAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-neutral-500">
                    Sin ajustes registrados para este periodo.
                  </td>
                </tr>
              ) : (
                existingAdjustments.map((row) => (
                  <tr key={row.adjustmentId} className="border-b border-red-50">
                    <td className="px-2 py-1">{row.ruta}</td>
                    <td className="px-2 py-1">{row.productName}</td>
                    <td className="px-2 py-1">{row.kind}</td>
                    <td className="px-2 py-1">{row.deltaPagoResultado}</td>
                    <td className="px-2 py-1">{row.comment ?? "-"}</td>
                    <td className="px-2 py-1">{row.isActive ? "Activo" : "Inactivo"}</td>
                    <td className="px-2 py-1">
                      {row.isActive ? (
                        <form action={deleteAction}>
                          <input type="hidden" name="adjustment_id" value={row.adjustmentId} />
                          <button
                            type="submit"
                            disabled={deletePending}
                            className="rounded-lg border border-red-300 bg-white px-2 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Desactivar
                          </button>
                        </form>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {deleteState ? (
          <div className={`mt-2 text-sm ${deleteState.ok ? "text-emerald-700" : "text-red-700"}`}>
            <p>{deleteState.message}</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}
