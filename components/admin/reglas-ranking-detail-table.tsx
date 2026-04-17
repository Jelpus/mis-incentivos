"use client";

import { upsertManualReglasRankingComplementAction } from "@/app/admin/reglas-ranking/actions";
import { useActionState, useMemo, useState } from "react";

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
}: {
  row: Row;
  periodMonthInput: string;
  rankingOptions: string[];
  puntosRankingLvuOptions: string[];
}) {
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

  return (
    <tr className="border-b border-neutral-100">
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
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3">Product Name</th>
            <th className="px-4 py-3">Ranking</th>
            <th className="px-4 py-3">Puntos Ranking LVU</th>
            <th className="px-4 py-3">Prod Weight</th>
            <th className="px-4 py-3">Origen</th>
            <th className="px-4 py-3">Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <RowEditor
              key={`${row.teamId}-${row.productName}-${index}`}
              row={row}
              periodMonthInput={periodMonthInput}
              rankingOptions={rankingOptions}
              puntosRankingLvuOptions={puntosRankingLvuOptions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
