"use client";

import {
  batchUpsertManualReglasRankingComplementAction,
  upsertManualReglasRankingComplementAction,
} from "@/app/admin/reglas-ranking/actions";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

type Row = {
  teamId: string;
  productName: string;
  ranking: string;
  puntosRankingLvu: string;
  prodWeight: string;
  source: "rules" | "complement";
};

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

function RowEditor({
  row,
  periodMonthInput,
  rankingOptions,
  puntosRankingLvuOptions,
  selected,
  onSelectedChange,
}: {
  row: Row;
  periodMonthInput: string;
  rankingOptions: string[];
  puntosRankingLvuOptions: string[];
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ManualActionState, FormData>(
    upsertManualReglasRankingComplementAction,
    null,
  );

  const rankingChoices = useMemo(() => {
    const set = new Set(rankingOptions);
    if (row.ranking) set.add(row.ranking);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [rankingOptions, row.ranking]);

  const puntosChoices = useMemo(() => {
    const set = new Set(puntosRankingLvuOptions);
    if (row.puntosRankingLvu) set.add(row.puntosRankingLvu);
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [puntosRankingLvuOptions, row.puntosRankingLvu]);

  const [rankingMode, setRankingMode] = useState<"select" | "new">("select");
  const [puntosMode, setPuntosMode] = useState<"select" | "new">("select");
  const formId = `ranking-row-${row.teamId}-${row.productName}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  return (
    <tr className="border-b border-neutral-100">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          aria-label={`Seleccionar ${row.teamId} ${row.productName}`}
          className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
        />
      </td>
      <td className="px-4 py-3 text-neutral-900">{row.teamId}</td>
      <td className="px-4 py-3 text-neutral-900">{row.productName}</td>
      <td className="px-4 py-3">
        <select
          form={formId}
          name="ranking_option"
          defaultValue={row.ranking || ""}
          onChange={(event) =>
            setRankingMode(event.target.value === "__new__" ? "new" : "select")
          }
          className="w-full rounded-xl border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900"
        >
          <option value="">Sin valor</option>
          {rankingChoices.map((value) => (
            <option key={`${row.teamId}-${row.productName}-ranking-${value}`} value={value}>
              {value}
            </option>
          ))}
          <option value="__new__">Agregar nuevo...</option>
        </select>
        {rankingMode === "new" ? (
          <input
            form={formId}
            name="ranking_custom"
            placeholder="Nuevo ranking"
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900"
          />
        ) : null}
      </td>
      <td className="px-4 py-3">
        <select
          form={formId}
          name="puntos_option"
          defaultValue={row.puntosRankingLvu || ""}
          onChange={(event) =>
            setPuntosMode(event.target.value === "__new__" ? "new" : "select")
          }
          className="w-full rounded-xl border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900"
        >
          <option value="">Sin valor</option>
          {puntosChoices.map((value) => (
            <option key={`${row.teamId}-${row.productName}-puntos-${value}`} value={value}>
              {value}
            </option>
          ))}
          <option value="__new__">Agregar nuevo...</option>
        </select>
        {puntosMode === "new" ? (
          <input
            form={formId}
            name="puntos_custom"
            type="number"
            step="0.01"
            placeholder="Nuevo valor"
            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900"
          />
        ) : null}
      </td>
      <td className="px-4 py-3 text-neutral-700">{row.prodWeight || "-"}</td>
      <td className="px-4 py-3 text-neutral-700">
        {row.source === "complement" ? "Complemento Excel" : "Regla base"}
      </td>
      <td className="px-4 py-3">
        <form id={formId} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="period_month" value={periodMonthInput} />
          <input type="hidden" name="team_id" value={row.teamId} />
          <input type="hidden" name="product_name" value={row.productName} />
          <input type="hidden" name="prod_weight" value={row.prodWeight} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </button>
          {state ? (
            <p className={`mt-1 text-[11px] ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
              {state.message}
            </p>
          ) : null}
        </form>
      </td>
    </tr>
  );
}

export function ReglasRankingDetailTable({
  rows,
  periodMonthInput,
  rankingOptions,
  puntosRankingLvuOptions,
}: {
  rows: Row[];
  periodMonthInput: string;
  rankingOptions: string[];
  puntosRankingLvuOptions: string[];
}) {
  const router = useRouter();
  const [batchState, batchAction, batchPending] = useActionState<ManualActionState, FormData>(
    batchUpsertManualReglasRankingComplementAction,
    null,
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [applyRanking, setApplyRanking] = useState(false);
  const [applyPuntos, setApplyPuntos] = useState(false);
  const [batchRankingMode, setBatchRankingMode] = useState<"select" | "new">("select");
  const [batchPuntosMode, setBatchPuntosMode] = useState<"select" | "new">("select");

  const rowKey = (row: Row) => `${row.teamId.toUpperCase()}|${row.productName.toUpperCase()}`;
  const selectedRows = rows.filter((row) => selectedKeys.has(rowKey(row)));
  const allRowsSelected = rows.length > 0 && selectedRows.length === rows.length;

  const rankingChoices = useMemo(() => {
    const set = new Set(rankingOptions);
    for (const row of rows) {
      if (row.ranking) set.add(row.ranking);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [rankingOptions, rows]);

  const puntosChoices = useMemo(() => {
    const set = new Set(puntosRankingLvuOptions);
    for (const row of rows) {
      if (row.puntosRankingLvu) set.add(row.puntosRankingLvu);
    }
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [puntosRankingLvuOptions, rows]);

  const updateSelected = (key: string, selected: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAllRows = (selected: boolean) => {
    setSelectedKeys(selected ? new Set(rows.map((row) => rowKey(row))) : new Set());
  };

  useEffect(() => {
    if (!batchState?.ok) return;
    router.refresh();
  }, [batchState, router]);

  return (
    <div className="space-y-4">
      <form action={batchAction} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <input type="hidden" name="period_month" value={periodMonthInput} />
        {selectedRows.map((row) => (
          <div key={`batch-hidden-${rowKey(row)}`}>
            <input type="hidden" name="team_id[]" value={row.teamId} />
            <input type="hidden" name="product_name[]" value={row.productName} />
          </div>
        ))}

        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              <input
                type="checkbox"
                name="apply_ranking"
                checked={applyRanking}
                onChange={(event) => setApplyRanking(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
              />
              Ranking
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              <input
                type="checkbox"
                name="apply_puntos"
                checked={applyPuntos}
                onChange={(event) => setApplyPuntos(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
              />
              Puntos Ranking LVU
            </label>

            <div className="space-y-2">
              <select
                name="batch_ranking_option"
                disabled={!applyRanking}
                onChange={(event) =>
                  setBatchRankingMode(event.target.value === "__new__" ? "new" : "select")
                }
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
              >
                <option value="">Sin valor</option>
                {rankingChoices.map((value) => (
                  <option key={`batch-ranking-${value}`} value={value}>
                    {value}
                  </option>
                ))}
                <option value="__new__">Agregar nuevo...</option>
              </select>
              {applyRanking && batchRankingMode === "new" ? (
                <input
                  name="batch_ranking_custom"
                  placeholder="Nuevo ranking"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <select
                name="batch_puntos_option"
                disabled={!applyPuntos}
                onChange={(event) =>
                  setBatchPuntosMode(event.target.value === "__new__" ? "new" : "select")
                }
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
              >
                <option value="">Sin valor</option>
                {puntosChoices.map((value) => (
                  <option key={`batch-puntos-${value}`} value={value}>
                    {value}
                  </option>
                ))}
                <option value="__new__">Agregar nuevo...</option>
              </select>
              {applyPuntos && batchPuntosMode === "new" ? (
                <input
                  name="batch_puntos_custom"
                  type="number"
                  step="0.01"
                  placeholder="Nuevo valor"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 xl:items-end">
            <p className="text-sm text-neutral-600">Seleccionadas: {selectedRows.length}</p>
            <button
              type="submit"
              disabled={batchPending || selectedRows.length === 0 || (!applyRanking && !applyPuntos)}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {batchPending ? "Guardando batch..." : "Guardar batch"}
            </button>
            {batchState ? (
              <p className={`text-xs ${batchState.ok ? "text-emerald-700" : "text-red-700"}`}>
                {batchState.message}
              </p>
            ) : null}
          </div>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allRowsSelected}
                  onChange={(event) => toggleAllRows(event.target.checked)}
                  aria-label="Seleccionar todas las filas"
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
                />
              </th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Product Name</th>
              <th className="px-4 py-3">Ranking</th>
              <th className="px-4 py-3">Puntos Ranking LVU</th>
              <th className="px-4 py-3">Prod Weight</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = rowKey(row);
              return (
                <RowEditor
                  key={`${row.teamId}-${row.productName}-${row.ranking}-${row.puntosRankingLvu}-${index}`}
                  row={row}
                  periodMonthInput={periodMonthInput}
                  rankingOptions={rankingOptions}
                  puntosRankingLvuOptions={puntosRankingLvuOptions}
                  selected={selectedKeys.has(key)}
                  onSelectedChange={(selected) => updateSelected(key, selected)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
