"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import {
  deleteRankingPointAdjustmentAction,
  upsertRankingPointAdjustmentAction,
} from "@/app/admin/ajustes-ranking/actions";
import type {
  RankingAdjustmentAuditItem,
  RankingAdjustmentListItem,
  RankingAdjustmentPointRow,
} from "@/lib/admin/ajustes-ranking/get-ranking-adjustments-page-data";

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type Operation = "add" | "subtract" | "set";
type AdjustmentStatus = "all" | "adjusted" | "not_adjusted";

type Props = {
  periodInput: string;
  availablePeriodInputs: string[];
  pointRows: RankingAdjustmentPointRow[];
  adjustments: RankingAdjustmentListItem[];
  auditItems: RankingAdjustmentAuditItem[];
  messages: string[];
};

function formatPoints(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function actionLabel(value: string) {
  if (value === "create") return "Creado";
  if (value === "update") return "Editado";
  if (value === "delete") return "Desactivado";
  if (value === "restore") return "Reactivado";
  if (value === "hard_delete") return "Eliminado";
  return value || "-";
}

function parseInputNumber(value: string): number | null {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function operationFromDelta(delta: number): Operation {
  return delta < 0 ? "subtract" : "add";
}

function resolveDelta(operation: Operation, inputValue: number | null, basePoints: number) {
  if (inputValue === null) return 0;
  if (operation === "subtract") return -Math.abs(inputValue);
  if (operation === "set") return inputValue - basePoints;
  return Math.abs(inputValue);
}

export function RankingAdjustmentsCard({
  periodInput,
  availablePeriodInputs,
  pointRows,
  adjustments,
  auditItems,
  messages,
}: Props) {
  const router = useRouter();
  const [upsertState, upsertAction, upsertPending] = useActionState<ActionState, FormData>(
    upsertRankingPointAdjustmentAction,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteRankingPointAdjustmentAction,
    null,
  );

  const [query, setQuery] = useState("");
  const [representativeFilter, setRepresentativeFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [adjustmentStatus, setAdjustmentStatus] = useState<AdjustmentStatus>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [formPeriodMonth, setFormPeriodMonth] = useState("");
  const [formPeriodCode, setFormPeriodCode] = useState("");
  const [formTerritory, setFormTerritory] = useState("");
  const [formProductName, setFormProductName] = useState("");
  const [formProductLabel, setFormProductLabel] = useState("");
  const [formRepresentativeName, setFormRepresentativeName] = useState("");
  const [formBasePoints, setFormBasePoints] = useState(0);
  const [formOperation, setFormOperation] = useState<Operation>("add");
  const [formValue, setFormValue] = useState("");
  const [formReason, setFormReason] = useState("");

  useEffect(() => {
    if (upsertState?.ok) {
      router.refresh();
    }
  }, [router, upsertState]);

  useEffect(() => {
    if (deleteState?.ok) router.refresh();
  }, [deleteState, router]);

  const representativeOptions = useMemo(
    () => Array.from(new Set(pointRows.map((row) => row.participantName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [pointRows],
  );
  const periodOptions = useMemo(
    () => Array.from(new Map(pointRows.map((row) => [row.periodMonth, row.periodCode])).entries())
      .sort((a, b) => a[0].localeCompare(b[0])),
    [pointRows],
  );
  const productOptions = useMemo(
    () => Array.from(new Map(pointRows.map((row) => [row.productKey, row.productName])).entries())
      .sort((a, b) => a[1].localeCompare(b[1], "es")),
    [pointRows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return pointRows.filter((row) => {
      if (representativeFilter && row.participantName !== representativeFilter) return false;
      if (periodFilter && row.periodMonth !== periodFilter) return false;
      if (productFilter && row.productKey !== productFilter) return false;
      if (adjustmentStatus === "adjusted" && row.adjustmentDelta === 0) return false;
      if (adjustmentStatus === "not_adjusted" && row.adjustmentDelta !== 0) return false;
      if (!normalizedQuery) return true;
      return `${row.participantName} ${row.territory} ${row.productName}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [pointRows, query, representativeFilter, periodFilter, productFilter, adjustmentStatus]);

  const previewInput = parseInputNumber(formValue);
  const previewDelta = resolveDelta(formOperation, previewInput, formBasePoints);
  const previewCurrent = formBasePoints + previewDelta;

  function matchingActiveAdjustment(row: RankingAdjustmentPointRow) {
    return adjustments.find((item) =>
      item.isActive &&
      item.periodMonth === row.periodMonth &&
      item.territory === row.territory &&
      item.productKey === row.productKey,
    ) ?? null;
  }

  function openPointModal(row: RankingAdjustmentPointRow) {
    const existing = matchingActiveAdjustment(row);
    const delta = existing?.deltaPoints ?? row.adjustmentDelta;
    setEditingId(existing?.id ?? "");
    setFormPeriodMonth(row.periodMonth);
    setFormPeriodCode(row.periodCode);
    setFormTerritory(row.territory);
    setFormProductName(row.productKey);
    setFormProductLabel(row.productName);
    setFormRepresentativeName(row.participantName);
    setFormBasePoints(row.basePoints);
    setFormOperation(operationFromDelta(delta));
    setFormValue(delta === 0 ? "" : String(Math.abs(delta)));
    setFormReason(existing?.reason ?? "");
    setModalOpen(true);
  }

  function openAdjustmentModal(row: RankingAdjustmentListItem) {
    const matchingPoint = pointRows.find((item) =>
      item.periodMonth === row.periodMonth &&
      item.territory === row.territory &&
      item.productKey === row.productKey,
    ) ?? null;
    setEditingId(row.id);
    setFormPeriodMonth(row.periodMonth);
    setFormPeriodCode(row.periodCode);
    setFormTerritory(row.territory);
    setFormProductName(row.productKey);
    setFormProductLabel(row.productName);
    setFormRepresentativeName(matchingPoint?.participantName ?? row.territory);
    setFormBasePoints(matchingPoint?.basePoints ?? 0);
    setFormOperation(operationFromDelta(row.deltaPoints));
    setFormValue(String(Math.abs(row.deltaPoints)));
    setFormReason(row.reason ?? "");
    setModalOpen(true);
  }

  return (
    <div className="grid gap-6">





      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">Admin / Ranking</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Ajustes Ranking
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-neutral-600">
              Audita puntos calculados y suma, resta o define puntos por periodo, territorio y producto.
            </p>
          </div>
        </div>

        {messages.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {messages.map((message, index) => (
              <p key={`${message}-${index}`} className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {message}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Ajustes registrados</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Desactivar no borra auditoria; el registro queda disponible en la bitacora.
            </p>
          </div>
          {deleteState ? (
            <p className={`text-sm ${deleteState.ok ? "text-emerald-700" : "text-red-700"}`}>
              {deleteState.message}
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-full text-xs text-neutral-700">
            <thead className="bg-neutral-50 text-left uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Periodo</th>
                <th className="px-3 py-2">Territorio</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Delta</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-neutral-500">
                    Sin ajustes registrados para los periodos visibles.
                  </td>
                </tr>
              ) : adjustments.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.periodCode}</td>
                  <td className="px-3 py-2">{row.territory}</td>
                  <td className="px-3 py-2">{row.productName}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${row.deltaPoints >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatPoints(row.deltaPoints)}
                  </td>
                  <td className="max-w-[320px] px-3 py-2">
                    <p className="truncate">{row.reason ?? "-"}</p>
                    <p className="text-[11px] text-neutral-500">{formatDateTime(row.updatedAt)}</p>
                  </td>
                  <td className="px-3 py-2">{row.isActive ? "Activo" : "Inactivo"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openAdjustmentModal(row)}
                        className="rounded-lg border border-neutral-300 bg-white px-2 py-1 font-semibold text-neutral-800 hover:bg-neutral-50"
                      >
                        Editar
                      </button>
                      {row.isActive ? (
                        <form action={deleteAction}>
                          <input type="hidden" name="adjustment_id" value={row.id} />
                          <button
                            type="submit"
                            disabled={deletePending}
                            className="rounded-lg border border-red-300 bg-white px-2 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Desactivar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Puntos calculados</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Cada ajuste impacta cualquier concurso activo que use ese periodo, territorio y producto.
          </p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_160px_220px_160px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar territorio o representante"
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          />
          <select
            value={representativeFilter}
            onChange={(event) => setRepresentativeFilter(event.target.value)}
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            <option value="">Todos los representantes</option>
            {representativeOptions.map((representative) => (
              <option key={representative} value={representative}>
                {representative}
              </option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            <option value="">Todos los periodos</option>
            {periodOptions.map(([month, code]) => (
              <option key={month} value={month}>
                {code}
              </option>
            ))}
          </select>
          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            <option value="">Todos los productos</option>
            {productOptions.map(([productKey, productName]) => (
              <option key={productKey} value={productKey}>
                {productName}
              </option>
            ))}
          </select>
          <select
            value={adjustmentStatus}
            onChange={(event) => setAdjustmentStatus(event.target.value as AdjustmentStatus)}
            className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            <option value="all">Todos</option>
            <option value="adjusted">Ajustados</option>
            <option value="not_adjusted">No ajustados</option>
          </select>
        </div>

        <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-neutral-200">
          <table className="min-w-full text-xs text-neutral-700">
            <thead className="bg-neutral-50 text-left uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Representante</th>
                <th className="px-3 py-2">Territorio</th>
                <th className="px-3 py-2">Periodo</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">Ajuste</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-neutral-500">
                    Sin detalles de puntos para los filtros actuales.
                  </td>
                </tr>
              ) : filteredRows.slice(0, 700).map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <p className="font-medium text-neutral-900">{row.participantName}</p>
                    {row.employeeNumber ? <p className="text-[11px] text-neutral-500">Empleado {row.employeeNumber}</p> : null}
                  </td>
                  <td className="px-3 py-2">{row.territory}</td>
                  <td className="px-3 py-2">{row.periodCode}</td>
                  <td className="px-3 py-2">
                    <p>{row.productName}</p>
                    <p className="text-[11px] text-neutral-500">
                      {row.formula} | cob {formatPercent(row.cappedCoverage)} | peso {formatPercent(row.weight)}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right">{formatPoints(row.basePoints)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${row.adjustmentDelta === 0 ? "text-neutral-500" : row.adjustmentDelta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatPoints(row.adjustmentDelta)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-neutral-950">{formatPoints(row.currentPoints)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openPointModal(row)}
                      className="rounded-lg border border-neutral-300 bg-white px-2 py-1 font-semibold text-neutral-800 hover:bg-neutral-50"
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 700 ? (
          <p className="mt-2 text-xs text-neutral-500">Mostrando 700 de {filteredRows.length} filas. Usa filtros para acotar.</p>
        ) : null}
      </section>


      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Auditoria</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Ultimos eventos generados por creacion, edicion, reactivacion o desactivacion de ajustes.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="min-w-full text-xs text-neutral-700">
            <thead className="bg-neutral-50 text-left uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Accion</th>
                <th className="px-3 py-2">Periodo</th>
                <th className="px-3 py-2">Territorio</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Delta anterior</th>
                <th className="px-3 py-2 text-right">Delta nuevo</th>
                <th className="px-3 py-2">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {auditItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-neutral-500">
                    Sin eventos de auditoria.
                  </td>
                </tr>
              ) : auditItems.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{formatDateTime(row.changedAt)}</td>
                  <td className="px-3 py-2 font-semibold text-neutral-900">{actionLabel(row.action)}</td>
                  <td className="px-3 py-2">{row.periodCode ?? "-"}</td>
                  <td className="px-3 py-2">{row.territory ?? "-"}</td>
                  <td className="px-3 py-2">{row.productName ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{row.previousDelta === null ? "-" : formatPoints(row.previousDelta)}</td>
                  <td className="px-3 py-2 text-right">{row.newDelta === null ? "-" : formatPoints(row.newDelta)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-neutral-500">{row.changedBy ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  {editingId ? "Editar ajuste" : "Nuevo ajuste"}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-950">
                  {formRepresentativeName}
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  {formTerritory} | {formPeriodCode} | {formProductLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cerrar
              </button>
            </div>

            <form action={upsertAction} className="mt-4 grid gap-4">
              <input type="hidden" name="adjustment_id" value={editingId} />
              <input type="hidden" name="period_month" value={formPeriodMonth} />
              <input type="hidden" name="territory" value={formTerritory} />
              <input type="hidden" name="product_name" value={formProductName} />
              <input type="hidden" name="base_points" value={formBasePoints} />

              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <label className="grid gap-1 text-sm font-medium text-neutral-800">
                  Operacion
                  <select
                    name="operation"
                    value={formOperation}
                    onChange={(event) => setFormOperation(event.target.value as Operation)}
                    className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                  >
                    <option value="add">Agregar</option>
                    <option value="subtract">Restar</option>
                    <option value="set">Definir</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-neutral-800">
                  {formOperation === "set" ? "Puntos finales" : "Puntos"}
                  <input
                    name="points_value"
                    value={formValue}
                    onChange={(event) => setFormValue(event.target.value)}
                    placeholder={formOperation === "set" ? "Ej: 83" : "Ej: 5"}
                    required
                    className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                  />
                </label>
              </div>

              <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Base</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-950">{formatPoints(formBasePoints)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ajuste</p>
                  <p className={`mt-1 text-lg font-semibold ${previewDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatPoints(previewDelta)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Actual</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-950">{formatPoints(previewCurrent)}</p>
                </div>
              </div>

              <label className="grid gap-1 text-sm font-medium text-neutral-800">
                Motivo
                <textarea
                  name="reason"
                  value={formReason}
                  onChange={(event) => setFormReason(event.target.value)}
                  placeholder="Motivo del ajuste"
                  rows={3}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                />
              </label>

              {upsertState ? (
                <p className={`rounded-xl border px-3 py-2 text-sm ${upsertState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                  {upsertState.message}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-10 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={upsertPending}
                  className="h-10 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {upsertPending ? "Guardando..." : "Guardar ajuste"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
