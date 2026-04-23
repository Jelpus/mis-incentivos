"use client";

import { useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PlatformKpi, PlatformUserRow } from "@/lib/admin/platform/get-platform-page-data";

type PlatformOverviewClientProps = {
  users: PlatformUserRow[];
  kpi: PlatformKpi;
};

type InviteStatus = {
  state: "idle" | "loading" | "success" | "error";
  message: string;
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatLastLogin(value: string | null) {
  if (!value) return "Sin login";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Sin login";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function PlatformOverviewClient({ users, kpi }: PlatformOverviewClientProps) {
  const [search, setSearch] = useState("");
  const [inviteByEmail, setInviteByEmail] = useState<Record<string, InviteStatus>>({});
  const [exporting, setExporting] = useState(false);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const fields = [
        user.email,
        user.nombre ?? "",
        user.territorio ?? "",
        String(user.numeroEmpleado ?? ""),
      ];
      return fields.some((field) => field.toLowerCase().includes(query));
    });
  }, [search, users]);

  const pieData = useMemo(
    () => [
      { name: "Registrados", value: kpi.registered, color: "#1d4ed8" },
      { name: "No registrados", value: kpi.notRegistered, color: "#f97316" },
    ],
    [kpi.notRegistered, kpi.registered],
  );

  async function inviteEmail(email: string) {
    setInviteByEmail((current) => ({
      ...current,
      [email]: { state: "loading", message: "Enviando..." },
    }));

    try {
      const response = await fetch("/api/admin/platform/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setInviteByEmail((current) => ({
          ...current,
          [email]: {
            state: "error",
            message: payload.error ?? "No se pudo enviar la invitacion.",
          },
        }));
        return;
      }

      setInviteByEmail((current) => ({
        ...current,
        [email]: {
          state: "success",
          message: payload.message ?? "Invitacion enviada.",
        },
      }));
    } catch {
      setInviteByEmail((current) => ({
        ...current,
        [email]: {
          state: "error",
          message: "Error de red al enviar la invitacion.",
        },
      }));
    }
  }

  async function exportUsersExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      const rows = filteredUsers.map((user) => ({
        Correo: user.email,
        Nombre: user.nombre ?? "",
        Territorio: user.territorio ?? "",
        NumeroEmpleado: user.numeroEmpleado ?? "",
        Activo: user.isActive ? "Si" : "No",
        Registro: user.isRegistered ? "Registrado" : "No registrado",
        UltimoLogin: formatLastLogin(user.lastLogin),
      }));

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(rows),
        "Detalle_usuarios",
      );

      const dateLabel = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `detalle_usuarios_${dateLabel}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6f9a]">Total base</p>
          <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{kpi.total}</p>
        </article>
        <article className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6f9a]">Registrados</p>
          <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{kpi.registered}</p>
          <p className="mt-1 text-xs text-[#64748b]">{formatPercent(kpi.registeredRatio)}</p>
        </article>
        <article className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6f9a]">No registrados</p>
          <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{kpi.notRegistered}</p>
        </article>
        <article className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6f9a]">
            Login ultimos 30 dias
          </p>
          <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{kpi.activeInLast30Days}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#0f172a]">Registrados vs no registrados</h2>
        <div className="mt-4 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-[#0f172a]">Detalle de usuarios</h2>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <button
              type="button"
              onClick={exportUsersExcel}
              disabled={exporting || filteredUsers.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {exporting ? "Exportando..." : "Exportar Excel"}
            </button>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por correo, nombre, territorio o empleado"
              className="h-10 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe] md:w-[28rem]"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-[#e2e8f0] text-sm">
            <thead className="bg-[#f8fbff]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Correo</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Nombre</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Territorio</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">No. Empleado</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Activo</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Registro</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Ultimo login</th>
                <th className="px-3 py-2 text-left font-semibold text-[#334155]">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f7]">
              {filteredUsers.map((user) => {
                const inviteStatus = inviteByEmail[user.email] ?? {
                  state: "idle",
                  message: "",
                };
                return (
                  <tr key={user.email}>
                    <td className="whitespace-nowrap px-3 py-2 text-[#1f2937]">{user.email}</td>
                    <td className="px-3 py-2 text-[#1f2937]">{user.nombre ?? "-"}</td>
                    <td className="px-3 py-2 text-[#1f2937]">{user.territorio ?? "-"}</td>
                    <td className="px-3 py-2 text-[#1f2937]">
                      {user.numeroEmpleado !== null ? user.numeroEmpleado : "-"}
                    </td>
                    <td className="px-3 py-2 text-[#1f2937]">{user.isActive ? "Si" : "No"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          user.isRegistered
                            ? "inline-flex rounded-full bg-[#e0f2fe] px-2 py-0.5 text-xs font-medium text-[#075985]"
                            : "inline-flex rounded-full bg-[#ffedd5] px-2 py-0.5 text-xs font-medium text-[#9a3412]"
                        }
                      >
                        {user.isRegistered ? "Registrado" : "No registrado"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#475569]">
                      {formatLastLogin(user.lastLogin)}
                    </td>
                    <td className="px-3 py-2">
                      {user.isRegistered ? (
                        <span className="text-xs text-[#64748b]">-</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => void inviteEmail(user.email)}
                            disabled={inviteStatus.state === "loading"}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {inviteStatus.state === "loading" ? "Enviando..." : "Invitar"}
                          </button>
                          {inviteStatus.message ? (
                            <p
                              className={
                                inviteStatus.state === "error"
                                  ? "text-[11px] text-[#b42318]"
                                  : "text-[11px] text-[#047857]"
                              }
                            >
                              {inviteStatus.message}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-[#64748b]">
                    No hay usuarios para mostrar con ese filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
