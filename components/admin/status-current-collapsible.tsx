"use client";

import { useState } from "react";
import { ManagerStatusCurrentTable } from "@/components/admin/manager-status-current-table";
import { StatusCurrentTable } from "@/components/admin/status-current-table";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import type { StatusPageRow, ManagerStatusRow } from "@/lib/admin/status/get-status-page-data";

type Props = {
  rows: StatusPageRow[];
  managers: ManagerStatusRow[];
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  totalRows: number;
  activeRows: number;
  inactiveRows: number;
  vacantRows: number;
};

function formatPeriodLabel(value: string) {
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

export function StatusCurrentCollapsible({
  rows,
  managers,
  periodMonth,
  latestAvailablePeriodMonth,
  totalRows,
  activeRows,
  inactiveRows,
  vacantRows,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const managerTotal = managers.length;
  const managerActive = managers.filter((row) => row.is_active).length;
  const managerInactive = Math.max(managerTotal - managerActive, 0);
  const managerVacant = managers.filter((row) => row.is_vacant).length;

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left transition hover:bg-neutral-100"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Status actual</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Total: {totalRows} | Activos: {activeRows} | Inactivos: {inactiveRows} | Vacantes: {vacantRows}
              {latestAvailablePeriodMonth
                ? ` | Ultimo periodo disponible: ${formatPeriodLabel(latestAvailablePeriodMonth)}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-600">
              {expanded ? "Ocultar detalle" : "Ver detalle"}
            </span>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="mt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-neutral-600">
                Catalogos vigentes para managers (SVM) y representantes (SVA).
              </p>
            </div>
            <StatusPeriodPicker value={periodMonth.slice(0, 7)} />
          </div>

          <div className="mt-6">
            <h3 className="text-base font-semibold text-neutral-900">Managers (SVM)</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Total: {managerTotal}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Activos: {managerActive}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Inactivos: {managerInactive}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                Vacantes: {managerVacant}
              </span>
            </div>
          </div>

          <ManagerStatusCurrentTable rows={managers} periodMonth={periodMonth} />

          <div className="mt-8">
            <h3 className="text-base font-semibold text-neutral-900">Representantes (SVA)</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Total: {totalRows}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Activos: {activeRows}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Inactivos: {inactiveRows}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                Vacantes: {vacantRows}
              </span>
              {latestAvailablePeriodMonth ? (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                  Ultimo periodo disponible: {formatPeriodLabel(latestAvailablePeriodMonth)}
                </span>
              ) : null}
            </div>
          </div>

          <StatusCurrentTable rows={rows} periodMonth={periodMonth} />
        </div>
      ) : null}
    </section>
  );
}


