"use client";

import { useCallback, useEffect, useState } from "react";

type AdminRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  global_role: string | null;
  is_active: boolean;
};

type AdminRolesPanelProps = {
  currentRole: "admin" | "super_admin";
  refreshToken?: number;
};

export function AdminRolesPanel({ currentRole, refreshToken = 0 }: AdminRolesPanelProps) {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/roles", { cache: "no-store" });
      const payload = (await response.json()) as {
        admins?: AdminRow[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo cargar administradores.");
        setRows([]);
        return;
      }

      setRows(payload.admins ?? []);
    } catch {
      setError("No se pudo conectar para cargar administradores.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  async function handleDemote(userId: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo degradar el rol.");
        return;
      }

      setMessage(payload.message ?? "Rol actualizado.");
      await loadRows();
    } catch {
      setError("No se pudo conectar para cambiar el rol.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#1e293b]">Admins y super-admins</p>
        <button
          type="button"
          onClick={() => void loadRows()}
          className="focus-ring inline-flex h-9 items-center rounded-md border border-[#d0d5dd] bg-white px-3 text-xs font-medium text-[#334155] transition hover:bg-[#f8fafc]"
        >
          Actualizar
        </button>
      </div>

      {loading ? <p className="text-sm text-[#64748b]">Cargando...</p> : null}
      {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
      {message ? <p className="text-sm text-[#047857]">{message}</p> : null}

      {!loading && !rows.length ? (
        <p className="text-sm text-[#64748b]">No hay roles administrativos registrados.</p>
      ) : null}

      <div className="grid gap-3">
        {rows.map((row) => {
          const role = (row.global_role ?? "user").toLowerCase();
          const canDemote =
            currentRole === "super_admin" || (currentRole === "admin" && role === "admin");

          return (
            <div
              key={row.user_id}
              className="flex flex-col gap-3 rounded-xl border border-[#e3ebfa] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">
                  {row.first_name || row.last_name
                    ? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
                    : row.email ?? row.user_id}
                </p>
                <p className="text-xs text-[#64748b]">{row.email ?? "sin correo"}</p>
                <p className="mt-1 text-xs text-[#475569]">
                  Rol: <span className="font-semibold">{role}</span> | Estado:{" "}
                  <span className="font-semibold">{row.is_active ? "activo" : "inactivo"}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={!canDemote}
                onClick={() => void handleDemote(row.user_id)}
                className="focus-ring inline-flex h-10 items-center rounded-lg border border-[#f1cdd2] bg-[#fff5f6] px-4 text-sm font-semibold text-[#b42318] transition hover:bg-[#ffe9ec] disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  canDemote
                    ? "Degradar a user"
                    : "No tienes permisos para degradar este rol"
                }
              >
                Quitar admin
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
