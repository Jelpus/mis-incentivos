"use client";

import { Fragment, useMemo, useState } from "react";
import type { ResultadoRecord } from "@/lib/results/get-resultados-v2-data";

type DetailLevel = "basic" | "team" | "full";

type ResultadosTableCardProps = {
  rows: ResultadoRecord[];
  detailLevel: DetailLevel;
  title?: string;
};

type AsignacionDetalleRow = {
  asignacion: string | null;
  ruta: string | null;
  teamId: string | null;
  brick: string | null;
  moleculaProducto: string | null;
  valor: number | null;
  periodo: string | null;
  referencia: string | null;
};

function formatNumberElement(value: number | null, element: string | null) {
  if (value === null || value === undefined) return "-";

  if (element === "MS") {
    return new Intl.NumberFormat("es-MX", {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
}

function formatPercentage(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatInteger(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("es-MX");
}

function formatManagerLabel(row: ResultadoRecord) {
  const managerCode = String(row.manager ?? "").trim();
  const managerName = String(row.managerName ?? "").trim();
  if (managerName && managerCode && managerName.toLowerCase() !== managerCode.toLowerCase()) {
    return `${managerName} (${managerCode})`;
  }
  return managerName || managerCode || "-";
}

export function ResultadosTableCard({
  rows,
  detailLevel,
  title = "Detalle de resultados",
}: ResultadosTableCardProps) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [loadingRowKey, setLoadingRowKey] = useState<string | null>(null);
  const [detailRowsByKey, setDetailRowsByKey] = useState<Record<string, AsignacionDetalleRow[]>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [mobileExpandedByKey, setMobileExpandedByKey] = useState<Record<string, boolean>>({});
  const [collapsedRouteByKey, setCollapsedRouteByKey] = useState<Record<string, boolean>>({});
  const [nameFilter, setNameFilter] = useState("");
  const [teamIdFilter, setTeamIdFilter] = useState("");
  const [lineaFilter, setLineaFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");

  const showTeamColumns = detailLevel === "team" || detailLevel === "full";
  const showGlobalColumns = detailLevel === "full";
  const isManagerMode = detailLevel === "team";
  const isAdminLikeMode = detailLevel === "full";
  const isGroupedMode = isManagerMode || isAdminLikeMode;
  const isBasicMode = detailLevel === "basic";

  const teamFilterOptions = useMemo(() => {
    if (!isAdminLikeMode) return [];
    return Array.from(
      new Set(
        rows
          .map((row) => String(row.teamId ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [isAdminLikeMode, rows]);

  const lineaFilterOptions = useMemo(() => {
    if (!isAdminLikeMode) return [];
    return Array.from(
      new Set(
        rows
          .map((row) => String(row.linea ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [isAdminLikeMode, rows]);

  const managerFilterOptions = useMemo(() => {
    if (!isAdminLikeMode) return [];
    const options = new Map<string, string>();
    for (const row of rows) {
      const key = String(row.manager ?? row.managerName ?? "").trim();
      if (!key) continue;
      if (!options.has(key)) {
        options.set(key, formatManagerLabel(row));
      }
    }
    return Array.from(options.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [isAdminLikeMode, rows]);

  const sortedRows = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLowerCase();
    const selectedTeam = teamIdFilter.trim();
    const selectedLinea = lineaFilter.trim();
    const selectedManager = managerFilter.trim();

    const filteredByStructured = rows.filter((row) => {
      if (isAdminLikeMode && selectedTeam && String(row.teamId ?? "").trim() !== selectedTeam) {
        return false;
      }
      if (isAdminLikeMode && selectedLinea && String(row.linea ?? "").trim() !== selectedLinea) {
        return false;
      }
      if (isAdminLikeMode && selectedManager) {
        const managerKey = String(row.manager ?? row.managerName ?? "").trim();
        if (managerKey !== selectedManager) {
          return false;
        }
      }
      return true;
    });

    const filtered = normalizedFilter
      ? filteredByStructured.filter((row) => {
          const name = String(row.nombre ?? "").toLowerCase();
          const rep = String(row.representante ?? "").toLowerCase();
          const ruta = String(row.ruta ?? "").toLowerCase();
          const product = String(row.productName ?? "").toLowerCase();
          return (
            name.includes(normalizedFilter) ||
            rep.includes(normalizedFilter) ||
            ruta.includes(normalizedFilter) ||
            product.includes(normalizedFilter)
          );
        })
      : filteredByStructured;

    return [...filtered].sort((a, b) => (b.prodWeight ?? 0) - (a.prodWeight ?? 0));
  }, [rows, nameFilter, teamIdFilter, lineaFilter, managerFilter, isAdminLikeMode]);

  const groupedByRoute = useMemo(() => {
    if (!isManagerMode) return [];
    const map = new Map<
      string,
      {
        route: string;
        displayName: string;
        rows: ResultadoRecord[];
      }
    >();

    for (const row of sortedRows) {
      const route = String(row.representante ?? row.ruta ?? "").trim() || "Sin ruta";
      const current = map.get(route);
      if (!current) {
        map.set(route, {
          route,
          displayName: String(row.nombre ?? "").trim() || "Sin nombre",
          rows: [row],
        });
      } else {
        current.rows.push(row);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.route.localeCompare(b.route));
  }, [isManagerMode, sortedRows]);

  const groupedByName = useMemo(() => {
    if (!isAdminLikeMode) return [];
    const map = new Map<
      string,
      {
        key: string;
        displayName: string;
        rows: ResultadoRecord[];
        routes: string[];
        teams: string[];
        managers: string[];
        lineas: string[];
      }
    >();

    for (const row of sortedRows) {
      const displayName = String(row.nombre ?? "").trim() || "Sin nombre";
      const employee = row.empleado !== null && row.empleado !== undefined ? String(row.empleado) : "na";
      const key = `${displayName.toLowerCase()}|${employee}`;
      const route = String(row.representante ?? row.ruta ?? "").trim();
      const team = String(row.teamId ?? "").trim();
      const manager = formatManagerLabel(row);
      const linea = String(row.linea ?? "").trim();

      const current = map.get(key);
      if (!current) {
        map.set(key, {
          key,
          displayName,
          rows: [row],
          routes: route ? [route] : [],
          teams: team ? [team] : [],
          managers: manager !== "-" ? [manager] : [],
          lineas: linea ? [linea] : [],
        });
      } else {
        current.rows.push(row);
        if (route && !current.routes.includes(route)) current.routes.push(route);
        if (team && !current.teams.includes(team)) current.teams.push(team);
        if (manager !== "-" && !current.managers.includes(manager)) current.managers.push(manager);
        if (linea && !current.lineas.includes(linea)) current.lineas.push(linea);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [isAdminLikeMode, sortedRows]);

  const colSpan = showGlobalColumns ? (showTeamColumns ? 9 : 8) : showTeamColumns ? 8 : 7;

  async function toggleDetalle(row: ResultadoRecord, rowKey: string) {
    if (openRowKey === rowKey) {
      setOpenRowKey(null);
      return;
    }

    setOpenRowKey(rowKey);
    if (detailRowsByKey[rowKey]) return;

    const periodo = String(row.periodo ?? "").trim();
    const ruta = String(row.ruta ?? row.representante ?? "").trim();
    const plan = String(row.productName ?? "").trim();

    if (!periodo || !ruta || !plan) {
      setErrorByKey((prev) => ({
        ...prev,
        [rowKey]: "Faltan datos en la fila para consultar detalle.",
      }));
      return;
    }

    setLoadingRowKey(rowKey);
    setErrorByKey((prev) => ({ ...prev, [rowKey]: "" }));

    try {
      const query = new URLSearchParams({ periodo, ruta, plan });
      if (row.teamId) query.set("teamId", row.teamId);

      const response = await fetch(`/api/profile/resultados/asignacion-detalle?${query.toString()}`, {
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        rows?: AsignacionDetalleRow[];
        error?: string;
      };

      if (!response.ok) {
        setErrorByKey((prev) => ({
          ...prev,
          [rowKey]: payload.error ?? "No se pudo cargar el detalle.",
        }));
        return;
      }

      setDetailRowsByKey((prev) => ({
        ...prev,
        [rowKey]: payload.rows ?? [],
      }));
    } catch {
      setErrorByKey((prev) => ({
        ...prev,
        [rowKey]: "No se pudo conectar para cargar detalle.",
      }));
    } finally {
      setLoadingRowKey((prev) => (prev === rowKey ? null : prev));
    }
  }

  function toggleMobileExpanded(rowKey: string) {
    setMobileExpandedByKey((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  }

  function toggleRouteCollapsed(routeKey: string) {
    setCollapsedRouteByKey((prev) => ({
      ...prev,
      [routeKey]: !(prev[routeKey] ?? true),
    }));
  }

  function renderDetailPanel(rowKey: string) {
    const detailRows = detailRowsByKey[rowKey] ?? [];
    const error = errorByKey[rowKey] ?? "";
    const isLoading = loadingRowKey === rowKey;
    const totalValor = detailRows.reduce((acc, current) => acc + (current.valor ?? 0), 0);

    if (isLoading) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#334155]">Cargando detalle de asignacion...</p>
          <div className="h-3 w-full animate-pulse rounded bg-[#dbe6f9]" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-[#dbe6f9]" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-[#dbe6f9]" />
        </div>
      );
    }

    if (error) return <p className="text-sm text-[#b42318]">{error}</p>;
    if (!detailRows.length) {
      return <p className="text-sm text-[#64748b]">Sin detalle de asignacion para esta fila.</p>;
    }

    return (
      <div className="space-y-3">
        <div className="grid gap-2 md:hidden">
          {detailRows.map((detail, i) => (
            <div key={`${rowKey}-card-${i}`} className="rounded-lg border border-[#d9e5fb] bg-white p-3">
              <p className="truncate text-sm font-semibold text-[#1d4ed8]">{detail.asignacion ?? "-"}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#475467]">
                <p className="truncate">Ruta: {detail.ruta ?? "-"}</p>
                <p className="truncate">Team: {detail.teamId ?? "-"}</p>
                <p className="col-span-2 truncate">Molecula: {detail.moleculaProducto ?? "-"}</p>
                <p className="truncate">Valor: {formatInteger(detail.valor)}</p>
                <p className="truncate">Ref: {detail.referencia ?? "-"}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="text-[#475467]">
                <th className="px-3 py-2">Asignacion</th>
                <th className="px-3 py-2">Ruta</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Molecula</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((detail, i) => (
                <tr key={`${rowKey}-d-${i}`} className="border-t border-[#eef2fb]">
                  <td className="px-3 py-2 text-[#344054]">{detail.asignacion ?? "-"}</td>
                  <td className="px-3 py-2 text-[#344054]">{detail.ruta ?? "-"}</td>
                  <td className="px-3 py-2 text-[#344054]">{detail.teamId ?? "-"}</td>
                  <td className="max-w-[20rem] truncate px-3 py-2 text-[#344054]">{detail.moleculaProducto ?? "-"}</td>
                  <td className="px-3 py-2 text-right text-[#344054]">{formatInteger(detail.valor)}</td>
                  <td className="px-3 py-2 text-[#344054]">{detail.referencia ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end border-t border-[#d9e5fb] pt-2">
          <p className="text-sm font-semibold text-[#0f172a]">Total valor: {formatInteger(totalValor)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e3ebfa] bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1e3a8a]">{title}</p>

      {isGroupedMode ? (
        <div className="mt-3">
          <label htmlFor="resultsNameFilter" className="mb-1 block text-xs font-medium text-[#475467]">
            Filtrar por nombre, ruta o producto
          </label>
          <input
            id="resultsNameFilter"
            type="text"
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Ej. Mora, MXPCRM0102R1..."
            className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>
      ) : null}

      {isAdminLikeMode ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <select
            value={teamIdFilter}
            onChange={(event) => setTeamIdFilter(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="">Todos los team_id</option>
            {teamFilterOptions.map((option) => (
              <option key={`team-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={lineaFilter}
            onChange={(event) => setLineaFilter(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="">Todas las lineas</option>
            {lineaFilterOptions.map((option) => (
              <option key={`linea-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={managerFilter}
            onChange={(event) => setManagerFilter(event.target.value)}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="">Todos los managers</option>
            {managerFilterOptions.map((option) => (
              <option key={`manager-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!sortedRows.length ? (
        <p className="mt-3 text-sm text-[#64748b]">No hay resultados para este filtro.</p>
      ) : (
        <>
          {isManagerMode ? (
            <div className="mt-4 grid gap-4">
              {groupedByRoute.map((group, groupIndex) => {
                const routeKey = `${group.route}-${groupIndex}`;
                const isCollapsed = collapsedRouteByKey[routeKey] ?? true;
                const groupTotal = group.rows.reduce((acc, row) => acc + (row.pagoResultado ?? 0), 0);

                return (
                  <section
                    key={routeKey}
                    className="rounded-xl border border-[#d9e5fb] bg-[#f8fbff] p-3 sm:p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#e5ecfa] pb-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0f172a]">{group.displayName}</p>
                        <p className="truncate text-xs text-[#475467]">Ruta: {group.route}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#475467]">Productos: {group.rows.length}</p>
                        <p className="text-sm font-semibold text-[#0f172a]">
                          Pago total: {formatCurrency(groupTotal)}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleRouteCollapsed(routeKey)}
                          className="mt-1 text-xs font-medium text-[#1d4ed8] underline-offset-2 hover:underline"
                        >
                          {isCollapsed ? "Expandir ruta" : "Contraer ruta"}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed ? (
                    <div className="grid gap-3">
                      {group.rows.map((row, rowIndex) => {
                        const rowKey = `${group.route}-${row.periodo ?? "na"}-${row.productName ?? "na"}-${rowIndex}`;
                        const canShowDetalle =
                          (row.planTypeName ?? "").toUpperCase() === "SALES VS. TARGET PLAN";
                        const isOpen = openRowKey === rowKey;
                        const mobileExpanded = mobileExpandedByKey[rowKey] === true;

                        return (
                          <div key={rowKey} className="rounded-lg border border-[#d9e5fb] bg-white p-3">
                            <div className="space-y-1">
                              <p className="truncate text-sm font-semibold text-[#0f172a]">
                                {row.productName ?? "-"}
                              </p>
                              <p className="truncate text-xs text-[#475467]">{row.planTypeName ?? "-"}</p>
                              {row.garantia ? (
                                <p className="text-[11px] text-[#64748b]">Garantia</p>
                              ) : null}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#334155]">
                              <p className="truncate">Parrilla: {formatPercentage(row.prodWeight)}</p>
                              <p className="truncate text-right">Cobertura: {formatPercent(row.cobertura)}</p>
                              <p className="truncate">Resultado: {formatNumberElement(row.resultado, row.elemento)}</p>
                              <p className="truncate text-right">Objetivo: {formatNumberElement(row.objetivo, row.elemento)}</p>
                              <p className="col-span-2 text-right text-sm font-semibold text-[#0f172a]">
                                Pago: {formatCurrency(row.pagoResultado)}
                              </p>
                            </div>

                            {mobileExpanded ? (
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#475467]">
                                <p className="truncate">Team: {row.teamId ?? "-"}</p>
                                <p className="truncate text-right">Linea: {row.linea ?? "-"}</p>
                                <p className="col-span-2 truncate">Elemento: {row.elemento ?? "-"}</p>
                                <p className="col-span-2 truncate">Agrupador: {row.agrupador ?? "-"}</p>
                              </div>
                            ) : null}

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleMobileExpanded(rowKey)}
                                className="text-xs font-medium text-[#475467] underline-offset-2 hover:underline"
                              >
                                {mobileExpanded ? "Ver menos" : "Ver mas"}
                              </button>
                              {canShowDetalle ? (
                                <button
                                  type="button"
                                  onClick={() => void toggleDetalle(row, rowKey)}
                                  className="text-xs font-medium text-[#1d4ed8] underline-offset-2 hover:underline"
                                >
                                  {isOpen ? "Ocultar detalle" : "Ver detalle"}
                                </button>
                              ) : <span />}
                            </div>

                            {isOpen ? (
                              <div className="mt-3 rounded-lg border border-[#d9e5fb] bg-[#f8fbff] p-3">
                                {renderDetailPanel(rowKey)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : null}

          {isAdminLikeMode ? (
            <div className="mt-4 grid gap-4">
              {groupedByName.map((group, groupIndex) => {
                const groupKey = `${group.key}-${groupIndex}`;
                const isCollapsed = collapsedRouteByKey[groupKey] ?? true;
                const groupTotal = group.rows.reduce((acc, row) => acc + (row.pagoResultado ?? 0), 0);
                const routeSummary = group.routes.length ? group.routes.join(", ") : "-";
                const teamSummary = group.teams.length ? group.teams.join(", ") : "-";
                const managerSummary = group.managers.length ? group.managers.join(", ") : "-";

                return (
                  <section
                    key={groupKey}
                    className="rounded-xl border border-[#d9e5fb] bg-[#f8fbff] p-3 sm:p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#e5ecfa] pb-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0f172a]">{group.displayName}</p>
                        <p className="truncate text-xs text-[#475467]">Rutas: {routeSummary}</p>
                        <p className="truncate text-xs text-[#475467]">Team(s): {teamSummary}</p>
                        <p className="truncate text-xs text-[#475467]">Manager(es): {managerSummary}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#475467]">Productos: {group.rows.length}</p>
                        <p className="text-sm font-semibold text-[#0f172a]">
                          Pago total: {formatCurrency(groupTotal)}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleRouteCollapsed(groupKey)}
                          className="mt-1 text-xs font-medium text-[#1d4ed8] underline-offset-2 hover:underline"
                        >
                          {isCollapsed ? "Expandir bloque" : "Contraer bloque"}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed ? (
                      <div className="grid gap-3">
                        {group.rows.map((row, rowIndex) => {
                          const rowKey = `${group.key}-${row.periodo ?? "na"}-${row.productName ?? "na"}-${rowIndex}`;
                          const canShowDetalle =
                            (row.planTypeName ?? "").toUpperCase() === "SALES VS. TARGET PLAN";
                          const isOpen = openRowKey === rowKey;
                          const mobileExpanded = mobileExpandedByKey[rowKey] === true;

                          return (
                            <div key={rowKey} className="rounded-lg border border-[#d9e5fb] bg-white p-3">
                              <div className="space-y-1">
                                <p className="truncate text-sm font-semibold text-[#0f172a]">
                                  {row.productName ?? "-"}
                                </p>
                                <p className="truncate text-xs text-[#475467]">{row.planTypeName ?? "-"}</p>
                                {row.garantia ? (
                                  <p className="text-[11px] text-[#64748b]">Garantia</p>
                                ) : null}
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#334155]">
                                <p className="truncate">Parrilla: {formatPercentage(row.prodWeight)}</p>
                                <p className="truncate text-right">Cobertura: {formatPercent(row.cobertura)}</p>
                                <p className="truncate">Resultado: {formatNumberElement(row.resultado, row.elemento)}</p>
                                <p className="truncate text-right">Objetivo: {formatNumberElement(row.objetivo, row.elemento)}</p>
                                <p className="col-span-2 text-right text-sm font-semibold text-[#0f172a]">
                                  Pago: {formatCurrency(row.pagoResultado)}
                                </p>
                              </div>

                              {mobileExpanded ? (
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#475467]">
                                  <p className="truncate">Ruta: {row.ruta ?? row.representante ?? "-"}</p>
                                  <p className="truncate text-right">Team: {row.teamId ?? "-"}</p>
                                  <p className="truncate">Linea: {row.linea ?? "-"}</p>
                                  <p className="truncate text-right">Manager: {formatManagerLabel(row)}</p>
                                  <p className="col-span-2 truncate">Elemento: {row.elemento ?? "-"}</p>
                                  <p className="col-span-2 truncate">Agrupador: {row.agrupador ?? "-"}</p>
                                </div>
                              ) : null}

                              <div className="mt-2 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleMobileExpanded(rowKey)}
                                  className="text-xs font-medium text-[#475467] underline-offset-2 hover:underline"
                                >
                                  {mobileExpanded ? "Ver menos" : "Ver mas"}
                                </button>
                                {canShowDetalle ? (
                                  <button
                                    type="button"
                                    onClick={() => void toggleDetalle(row, rowKey)}
                                    className="text-xs font-medium text-[#1d4ed8] underline-offset-2 hover:underline"
                                  >
                                    {isOpen ? "Ocultar detalle" : "Ver detalle"}
                                  </button>
                                ) : <span />}
                              </div>

                              {isOpen ? (
                                <div className="mt-3 rounded-lg border border-[#d9e5fb] bg-[#f8fbff] p-3">
                                  {renderDetailPanel(rowKey)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : null}

          {isBasicMode ? (
          <div className="mt-4 grid gap-3 md:hidden">
            {sortedRows.map((row, index) => {
              const rowKey = `${row.periodo ?? "na"}-${row.ruta ?? row.representante ?? "na"}-${row.productName ?? "na"}-${index}`;
              const canShowDetalle =
                (row.planTypeName ?? "").toUpperCase() === "SALES VS. TARGET PLAN";
              const isOpen = openRowKey === rowKey;
              const mobileExpanded = mobileExpandedByKey[rowKey] === true;

              return (
                <div key={`mobile-${rowKey}`} className="rounded-lg border border-[#d9e5fb] bg-[#f8fbff] p-3">
                  <div className="space-y-1">
                    <p className="truncate text-sm font-semibold text-[#0f172a]">{row.productName ?? "-"}</p>
                    <p className="truncate text-xs text-[#475467]">{row.planTypeName ?? "-"}</p>
                    {row.garantia ? <p className="text-[11px] text-[#64748b]">Garantia</p> : null}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#334155]">
                    <p className="truncate">Parrilla: {formatPercentage(row.prodWeight)}</p>
                    <p className="truncate text-right">Cobertura: {formatPercent(row.cobertura)}</p>
                    <p className="truncate">Resultado: {formatNumberElement(row.resultado, row.elemento)}</p>
                    <p className="truncate text-right">Objetivo: {formatNumberElement(row.objetivo, row.elemento)}</p>
                    <p className="col-span-2 text-right text-sm font-semibold text-[#0f172a]">
                      Pago: {formatCurrency(row.pagoResultado)}
                    </p>
                  </div>

                  {mobileExpanded ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#475467]">
                      <p className="truncate">Ruta: {row.ruta ?? "-"}</p>
                      <p className="truncate text-right">Rep: {row.representante ?? "-"}</p>
                      <p className="truncate">Team: {row.teamId ?? "-"}</p>
                      <p className="truncate text-right">Linea: {row.linea ?? "-"}</p>
                      <p className="col-span-2 truncate">Elemento: {row.elemento ?? "-"}</p>
                      <p className="col-span-2 truncate">Agrupador: {row.agrupador ?? "-"}</p>
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMobileExpanded(rowKey)}
                      className="text-xs font-medium text-[#475467] underline-offset-2 hover:underline"
                    >
                      {mobileExpanded ? "Ver menos" : "Ver mas"}
                    </button>
                    {canShowDetalle ? (
                      <button
                        type="button"
                        onClick={() => void toggleDetalle(row, rowKey)}
                        className="text-xs font-medium text-[#1d4ed8] underline-offset-2 hover:underline"
                      >
                        {isOpen ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    ) : <span />}
                  </div>

                  {isOpen ? (
                    <div className="mt-3 rounded-lg border border-[#d9e5fb] bg-white p-3">{renderDetailPanel(rowKey)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
          ) : null}

          {isBasicMode ? (
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr className="bg-[#f8fbff] text-[#475467]">
                  {showGlobalColumns ? <th className="border-b border-[#e5e7eb] px-3 py-2">Nombre</th> : null}
                  {showTeamColumns ? <th className="border-b border-[#e5e7eb] px-3 py-2">Ruta</th> : null}
                  <th className="border-b border-[#e5e7eb] px-3 py-2">Producto</th>
                  <th className="border-b border-[#e5e7eb] px-3 py-2">Plan</th>
                  <th className="border-b border-[#e5e7eb] px-3 py-2">Parrilla</th>
                  <th className="border-b border-[#e5e7eb] px-3 py-2 text-right">Resultado</th>
                  <th className="border-b border-[#e5e7eb] px-3 py-2 text-right">Objetivo</th>
                  <th className="border-b border-[#e5e7eb] px-3 py-2 text-right">Cobertura</th>
                  <th className="border-b border-[#e5e7eb] px-3 py-2 text-right">Pago resultado</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, index) => {
                  const rowKey = `${row.periodo ?? "na"}-${row.ruta ?? row.representante ?? "na"}-${row.productName ?? "na"}-${index}`;
                  const canShowDetalle =
                    (row.planTypeName ?? "").toUpperCase() === "SALES VS. TARGET PLAN";
                  const isOpen = openRowKey === rowKey;

                  return (
                    <Fragment key={rowKey}>
                      <tr>
                        {showGlobalColumns ? (
                          <td className="border-b border-[#f2f4f7] px-3 py-2 text-[#344054]">{row.nombre ?? "-"}</td>
                        ) : null}
                        {showTeamColumns ? (
                          <td className="border-b border-[#f2f4f7] px-3 py-2 text-[#344054]">
                            {row.representante ?? row.ruta ?? "-"}
                          </td>
                        ) : null}
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-[#344054]">
                          <div className="flex max-w-[14rem] flex-col">
                            <span className="truncate">{row.productName ?? "-"}</span>
                            {row.garantia ? <span className="text-[11px] text-[#64748b]">Garantia</span> : null}
                          </div>
                        </td>
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-[#344054]">{row.planTypeName ?? "-"}</td>
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-[#344054]">{formatPercentage(row.prodWeight)}</td>
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-right text-[#344054]">
                          {formatNumberElement(row.resultado, row.elemento)}
                        </td>
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-right text-[#344054]">
                          {formatNumberElement(row.objetivo, row.elemento)}
                        </td>
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-right text-[#344054]">{formatPercent(row.cobertura)}</td>
                        <td className="border-b border-[#f2f4f7] px-3 py-2 text-right font-semibold text-[#0f172a]">
                          {formatCurrency(row.pagoResultado)}
                          {canShowDetalle ? (
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={() => void toggleDetalle(row, rowKey)}
                                className="text-[11px] font-medium text-[#1d4ed8] underline-offset-2 hover:underline"
                              >
                                {isOpen ? "Ocultar detalle" : "Ver detalle"}
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>

                      {isOpen ? (
                        <tr>
                          <td colSpan={colSpan} className="border-b border-[#e8eefb] bg-[#f8fbff] px-3 py-3">
                            {renderDetailPanel(rowKey)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : null}
        </>
      )}
    </div>
  );
}
