"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { updateCalculoStatusAction, type CalculoActionResult } from "@/app/admin/calculo/actions";
import { requestManagersApprovalAction, type ManagerApprovalRequestResult } from "@/app/admin/calculo/aprobar/actions";
import type { AprobarPreviewAdjustment, AprobarPreviewRow } from "@/lib/admin/calculo/get-aprobar-preview-data";

type Props = {
  periodMonth: string;
  rows: AprobarPreviewRow[];
  adjustments: AprobarPreviewAdjustment[];
  summary: {
    rowsCount: number;
    totalPagoVariable: number;
    totalPagoResultadoOriginal: number;
    totalAjusteDelta: number;
    totalPagoResultadoAjustado: number;
  };
  message?: string | null;
};

function formatNumberGrouped(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(parsed));
}

function formatCurrencyGrouped(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "$0.000";
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(parsed)}`;
}

function formatPercentOneDecimal(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.0%";
  return `${(parsed * 100).toFixed(1)}%`;
}

function formatSignedCurrency(value: number): string {
  const base = formatCurrencyGrouped(Math.abs(value));
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
}

export function CalculoApproveRunner({
  periodMonth,
  rows,
  adjustments,
  summary,
  message = null,
}: Props) {
  const periodLabel = useMemo(() => periodMonth.slice(0, 7), [periodMonth]);
  const [isExporting, setIsExporting] = useState(false);
  const [approveState, approveAction, approvePending] = useActionState<CalculoActionResult | null, FormData>(
    updateCalculoStatusAction,
    null,
  );
  const [requestState, requestAction, requestPending] = useActionState<ManagerApprovalRequestResult | null, FormData>(
    requestManagersApprovalAction,
    null,
  );

  const groupedRows = useMemo(() => {
    const map = new Map<
      string,
      {
        ruta: string;
        rows: AprobarPreviewRow[];
        totals: {
          objetivo: number;
          valor: number;
          resultado: number;
          prFinal: number;
          ajusteDelta: number;
          pvFinal: number;
          prodWeight: number;
        };
      }
    >();

    for (const row of rows) {
      const key = row.ruta || "-";
      const current = map.get(key) ?? {
        ruta: key,
        rows: [],
        totals: {
          objetivo: 0,
          valor: 0,
          resultado: 0,
          prFinal: 0,
          ajusteDelta: 0,
          pvFinal: 0,
          prodWeight: 0,
        },
      };

      current.rows.push(row);
      current.totals.objetivo += row.objetivo;
      current.totals.valor += row.actual;
      current.totals.resultado += row.resultado;
      current.totals.prFinal += row.pagoResultadoAjustado;
      current.totals.ajusteDelta += row.ajusteDelta;
      current.totals.pvFinal += row.pagoResultadoAjustado;
      current.totals.prodWeight += row.prodWeight;
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => a.ruta.localeCompare(b.ruta, "es"));
  }, [rows]);

  async function exportExcel() {
    setIsExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      const detailRows = rows.map((row) => ({
        Ruta: row.ruta,
        Team: row.teamId,
        NoEmpleado: row.empleado ?? "",
        Nombre: row.nombre ?? "",
        Manager: row.manager ?? "",
        Linea: row.linea ?? "",
        Representante: row.representante ?? "",
        ProductName: row.productName,
        PlanType: row.planTypeName ?? "",
        Agrupador: row.agrupador ?? "",
        Elemento: row.elemento ?? "",
        Objetivo: row.objetivo,
        Valor: row.actual,
        Resultado: row.resultado,
        Cobertura: row.cobertura,
        CoberturaPago: row.coberturaPago,
        Parrilla: row.prodWeight,
        PR: row.pagoResultadoAjustado,
        AjusteDelta: row.ajusteDelta,
        PV: row.pagoResultadoAjustado,
        AjusteKinds: row.ajusteKinds ?? "",
        AjusteComments: row.ajusteComments ?? "",
        Garantia: row.garantia ? "Si" : "No",
      }));

      const totalsRows = groupedRows.map((group) => ({
        Ruta: group.ruta,
        Objetivo: group.totals.objetivo,
        Valor: group.totals.valor,
        Resultado: group.totals.resultado,
        Parrilla: group.totals.prodWeight,
        PR: group.totals.prFinal,
        AjusteDelta: group.totals.ajusteDelta,
        PV: group.totals.pvFinal,
      }));

      const adjustmentsRows = adjustments.map((row) => ({
        AdjustmentId: row.adjustmentId,
        Ruta: row.ruta,
        ProductName: row.productName,
        Kind: row.kind,
        DeltaPagoResultado: row.deltaPagoResultado,
        Comment: row.comment ?? "",
        UpdatedAt: row.updatedAt ?? "",
      }));

      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "Resultados Aprobacion");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(totalsRows), "Totales Ruta");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(adjustmentsRows), "Ajustes Activos");

      const safePeriod = periodLabel.replace(/[^0-9A-Za-z_-]/g, "-");
      XLSX.writeFile(workbook, `Aprobacion_${safePeriod}.xlsx`);
    } finally {
      setIsExporting(false);
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
        Vista de aprobacion sobre `resultados_v2` aplicando ajustes activos de `precalculo`.
      </p>
      {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <p className="text-neutral-500">Filas</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">{formatNumberGrouped(summary.rowsCount)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <p className="text-neutral-500">PR total</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">{formatCurrencyGrouped(summary.totalPagoResultadoAjustado)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <p className="text-neutral-500">Ajuste total</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">{formatSignedCurrency(summary.totalAjusteDelta)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="text-emerald-700">PV total</p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">{formatCurrencyGrouped(summary.totalPagoResultadoAjustado)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <p className="text-neutral-500">PR base</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">
            {formatCurrencyGrouped(summary.totalPagoResultadoOriginal)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportExcel}
          disabled={isExporting}
          className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
        >
          {isExporting ? "Exportando..." : "Exportar a Excel"}
        </button>
        <form action={requestAction}>
          <input type="hidden" name="period_month" value={periodMonth} />
          <button
            type="submit"
            disabled={requestPending}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-60"
          >
            {requestPending ? "Enviando..." : "Solicitar aprobacion a managers"}
          </button>
        </form>
        <form action={approveAction}>
          <input type="hidden" name="period_month" value={periodMonth} />
          <input type="hidden" name="action" value="aprobar" />
          <button
            type="submit"
            disabled={approvePending}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {approvePending ? "Aprobando..." : "Aprobar periodo"}
          </button>
        </form>
      </div>

      {requestState ? (
        <p className={`mt-3 text-sm ${requestState.ok ? "text-emerald-700" : "text-red-700"}`}>
          {requestState.message}
        </p>
      ) : null}
      {approveState ? (
        <p className={`mt-2 text-sm ${approveState.ok ? "text-emerald-700" : "text-red-700"}`}>
          {approveState.message}
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
        <p className="font-semibold text-neutral-900">Glosario rapido</p>
        <p className="mt-1">`Obj`: Objetivo | `V`: Valor (actual) | `Res`: Resultado | `Cob`: Cobertura | `Cob Pago`: Cobertura de pago</p>
        <p className="mt-1">`Parr %`: Prod weight | `PR`: pago resultado final (`pagoresultado + ajuste`) | `Ajuste`: monto de ajustes aplicado | `PV`: pago final integrado</p>
      </div>

      <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-neutral-200">
        <table className="min-w-full text-xs text-neutral-700">
          <thead className="sticky top-0 z-20 bg-white">
            <tr className="border-b border-neutral-200 text-left uppercase tracking-wide text-neutral-500">
              <th className="px-2 py-1">Ruta</th>
              <th className="px-2 py-1">Team</th>
              <th className="px-2 py-1">Producto</th>
              <th className="px-2 py-1">Obj</th>
              <th className="px-2 py-1">V</th>
              <th className="px-2 py-1">Res</th>
              <th className="px-2 py-1">Cob</th>
              <th className="px-2 py-1">Cob Pago</th>
              <th className="px-2 py-1">Parr %</th>
              <th className="px-2 py-1">PR</th>
              <th className="px-2 py-1">Ajuste</th>
              <th className="px-2 py-1">PV</th>
              <th className="px-2 py-1">Garantia</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-2 py-3 text-neutral-500">
                  Sin filas para resultados_v2 en este periodo.
                </td>
              </tr>
            ) : (
              groupedRows.map((routeGroup, routeIndex) => (
                <Fragment key={`${routeGroup.ruta}-${routeIndex}`}>
                  <tr className="border-y border-blue-200 bg-blue-100/70">
                    <td colSpan={13} className="px-2 py-1 text-[11px] font-semibold text-blue-900">
                      Ruta: {routeGroup.ruta}
                    </td>
                  </tr>
                  {routeGroup.rows.map((row, index) => (
                    <tr key={`${row.ruta}-${row.teamId}-${row.productName}-${index}`} className="border-b border-neutral-100">
                      <td className="px-2 py-1">{row.ruta}</td>
                      <td className="px-2 py-1">{row.teamId}</td>
                      <td className="px-2 py-1">{row.productName}</td>
                      <td className="px-2 py-1">{formatNumberGrouped(row.objetivo)}</td>
                      <td className="px-2 py-1">{formatNumberGrouped(row.actual)}</td>
                      <td className="px-2 py-1">{formatNumberGrouped(row.resultado)}</td>
                      <td className="px-2 py-1">{formatPercentOneDecimal(row.cobertura)}</td>
                      <td className="px-2 py-1">{formatPercentOneDecimal(row.coberturaPago)}</td>
                      <td className="px-2 py-1">{formatPercentOneDecimal(row.prodWeight)}</td>
                      <td className="px-2 py-1">{formatCurrencyGrouped(row.pagoResultadoAjustado)}</td>
                      <td className="px-2 py-1">{formatSignedCurrency(row.ajusteDelta)}</td>
                      <td className="px-2 py-1">{formatCurrencyGrouped(row.pagoResultadoAjustado)}</td>
                      <td className="px-2 py-1">{row.garantia ? "Si" : "No"}</td>
                    </tr>
                  ))}
                  <tr className="border-y border-blue-200 bg-blue-50 font-semibold text-blue-900">
                    <td className="px-2 py-1">Total ruta</td>
                    <td className="px-2 py-1">-</td>
                    <td className="px-2 py-1">-</td>
                    <td className="px-2 py-1">{formatNumberGrouped(routeGroup.totals.objetivo)}</td>
                    <td className="px-2 py-1">{formatNumberGrouped(routeGroup.totals.valor)}</td>
                    <td className="px-2 py-1">{formatNumberGrouped(routeGroup.totals.resultado)}</td>
                    <td className="px-2 py-1">-</td>
                    <td className="px-2 py-1">-</td>
                    <td className="px-2 py-1">{formatPercentOneDecimal(routeGroup.totals.prodWeight)}</td>
                    <td className="px-2 py-1">{formatCurrencyGrouped(routeGroup.totals.prFinal)}</td>
                    <td className="px-2 py-1">{formatSignedCurrency(routeGroup.totals.ajusteDelta)}</td>
                    <td className="px-2 py-1">{formatCurrencyGrouped(routeGroup.totals.pvFinal)}</td>
                    <td className="px-2 py-1">{Math.abs(routeGroup.totals.prodWeight - 1) <= 0.01 ? "OK" : "Revisar"}</td>
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
