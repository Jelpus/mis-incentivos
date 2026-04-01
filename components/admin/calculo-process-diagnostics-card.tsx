"use client";

import { Fragment, useState } from "react";
import { formatPeriodMonthLabel } from "@/lib/admin/incentive-rules/shared";
import type { CalculoProcessData } from "@/lib/admin/calculo/get-calculo-process-data";

type Props = {
  data: CalculoProcessData;
};

function rowIdFromIndex(index: number, teamId: string, route: string, noEmpleado: string | null): string {
  return `${index}-${teamId}-${route}-${noEmpleado ?? "sin-no-empleado"}`;
}

export function CalculoProcessDiagnosticsCard({ data }: Props) {
  const rowsToRender = data.rows.slice(0, 200);
  const hasTruncatedRows = data.rows.length > rowsToRender.length;
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  function toggleRow(rowId: string) {
    setExpandedRowId((current) => (current === rowId ? null : rowId));
  }

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900">Diagnostico process</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Periodo {formatPeriodMonthLabel(data.periodMonth)}. Base por miembro desde status activo/no vacante.
      </p>

      {!data.storageReady ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Hay dependencias de storage pendientes.</p>
          <ul className="mt-2 list-disc pl-5">
            {data.storageMessages.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Miembros elegibles</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{data.summary.eligibleMembers}</p>
          <p className="text-xs text-neutral-500">
            Status total: {data.summary.totalMembersInStatus} | vacantes excluidos: {data.summary.excludedVacant}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Teams</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{data.summary.teamsDetected}</p>
          <p className="text-xs text-neutral-500">
            Con reglas: {data.summary.teamsWithRules} | sin reglas: {data.summary.teamsWithoutRules}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Cobertura objetivos</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{data.summary.coveredMemberProducts}</p>
          <p className="text-xs text-neutral-500">
            Requeridos: {data.summary.requiredMemberProducts} | faltantes: {data.summary.missingMemberProducts}
          </p>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-neutral-200" open>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-neutral-800">
          Tabla de diagnostico por miembro
        </summary>
        <div className="overflow-x-auto border-t border-neutral-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Ruta</th>
                <th className="px-3 py-2">Empleado</th>
                <th className="px-3 py-2">Targets</th>
                <th className="px-3 py-2">Faltantes</th>
                <th className="px-3 py-2">Ver detalles</th>
              </tr>
            </thead>
            <tbody>
              {rowsToRender.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    No hay miembros elegibles para process en este periodo.
                  </td>
                </tr>
              ) : (
                rowsToRender.map((row, index) => {
                  const rowId = rowIdFromIndex(index, row.teamId, row.territorioIndividual, row.noEmpleado);
                  const isExpanded = expandedRowId === rowId;

                  return (
                    <Fragment key={rowId}>
                      <tr className="border-b border-neutral-100 align-top">
                        <td className="px-3 py-2 font-medium text-neutral-900">{row.teamId}</td>
                        <td className="px-3 py-2 text-neutral-700">{row.territorioIndividual}</td>
                        <td className="px-3 py-2 text-neutral-700">
                          <p>{row.nombreCompleto}</p>
                          <p className="text-xs text-neutral-500">{row.noEmpleado ?? "-"}</p>
                        </td>
                        <td className="px-3 py-2 text-neutral-700">
                          {row.targetProductsCovered}/{row.ruleProductsCount}
                        </td>
                        <td className="px-3 py-2 text-neutral-700">
                          {row.missingTargetProducts > 0 ? (
                            <span>
                              {row.missingTargetProducts}{" "}
                              {row.missingTargetExamples.length > 0
                                ? `(${row.missingTargetExamples.join(", ")})`
                                : ""}
                            </span>
                          ) : (
                            <span className="text-emerald-700">OK</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleRow(rowId)}
                            className="text-xs font-semibold text-neutral-700 underline underline-offset-2"
                          >
                            {isExpanded ? "Ocultar" : "Ver detalles"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="grid gap-3 lg:grid-cols-3">
                              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-700">
                                <p className="font-semibold text-neutral-900">Status Data</p>
                                <p className="mt-2">Team: {row.teamId}</p>
                                <p>Ruta: {row.territorioIndividual}</p>
                                <p>Empleado: {row.nombreCompleto}</p>
                                <p>No empleado: {row.noEmpleado ?? "-"}</p>
                              </div>

                              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-700">
                                <p className="font-semibold text-neutral-900">Rules</p>
                                <p className="mt-2">Version: {row.rulesVersionNo ?? "-"}</p>
                                <p>Productos en regla: {row.ruleProductsCount}</p>
                                <p>Productos con source: {row.productsWithSourcesCount}</p>
                                <p>Sources (files): {row.sourceFilesCount}</p>
                                <p>Sources (metrics): {row.sourceMetricsCount}</p>
                                <p>Sources (fuentes): {row.sourceFuentesCount}</p>
                              </div>

                              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-700">
                                <p className="font-semibold text-neutral-900">Targets</p>
                                <p className="mt-2">Productos cubiertos: {row.targetProductsCovered}</p>
                                <p>Productos faltantes: {row.missingTargetProducts}</p>
                                <p>
                                  Ejemplos faltantes:{" "}
                                  {row.missingTargetExamples.length > 0
                                    ? row.missingTargetExamples.join(", ")
                                    : "-"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="border-b border-neutral-200 text-left uppercase tracking-wide text-neutral-500">
                                    <th className="px-3 py-2">Product name</th>
                                    <th className="px-3 py-2">Source rows</th>
                                    <th className="px-3 py-2">Target total</th>
                                    <th className="px-3 py-2">Filas target</th>
                                    <th className="px-3 py-2">Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.productDetails.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-3 text-neutral-500">
                                        Sin productos de regla para este miembro.
                                      </td>
                                    </tr>
                                  ) : (
                                    row.productDetails.map((product) => (
                                      <tr key={product.productName} className="border-b border-neutral-100">
                                        <td className="px-3 py-2 text-neutral-700">{product.productName}</td>
                                        <td className="px-3 py-2 text-neutral-700">{product.sourceCount}</td>
                                        <td className="px-3 py-2 text-neutral-700">{product.targetTotal.toFixed(6)}</td>
                                        <td className="px-3 py-2 text-neutral-700">{product.targetDetailCount}</td>
                                        <td className="px-3 py-2">
                                          {product.hasTarget ? (
                                            <span className="text-emerald-700">Cubierto</span>
                                          ) : (
                                            <span className="text-red-700">Faltante</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </details>

      {hasTruncatedRows ? (
        <p className="mt-3 text-xs text-neutral-500">
          Mostrando {rowsToRender.length} de {data.rows.length} filas para mantener respuesta rapida.
        </p>
      ) : null}
    </section>
  );
}
