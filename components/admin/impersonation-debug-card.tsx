"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProfileOption = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  global_role: string | null;
  is_active: boolean;
  relation_type: "sales_force" | "manager" | null;
};

type ImpersonationSnapshot = {
  userId: string;
  email: string | null;
  globalRole: string | null;
  isActive: boolean;
};

type ImpersonationDebugCardProps = {
  currentImpersonation: ImpersonationSnapshot | null;
};

type RequestState = "idle" | "loading" | "success" | "error";

function getDisplayName(profile: ProfileOption) {
  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return fullName || profile.email || profile.user_id;
}

function getRelationLabel(value: ProfileOption["relation_type"]) {
  if (value === "sales_force") return "Sales force";
  if (value === "manager") return "Manager";
  return "Sin relacion";
}

export function ImpersonationDebugCard({ currentImpersonation }: ImpersonationDebugCardProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(currentImpersonation?.userId ?? "");
  const [relationTypeFilter, setRelationTypeFilter] = useState<"all" | "sales_force" | "manager">("all");
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const [resultMeta, setResultMeta] = useState({ total: 0, returned: 0, truncated: false });

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.user_id === selectedUserId) ?? null,
    [profiles, selectedUserId],
  );

  async function loadProfiles(
    searchTerm = "",
    relationType: "all" | "sales_force" | "manager" = relationTypeFilter,
  ) {
    setState("loading");
    setMessage("");
    try {
      const encoded = encodeURIComponent(searchTerm);
      const encodedRelationType = encodeURIComponent(relationType);
      const response = await fetch(
        `/api/admin/debug/users?q=${encoded}&relation_type=${encodedRelationType}&limit=100`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        profiles?: ProfileOption[];
        total?: number;
        returned?: number;
        truncated?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setProfiles([]);
        setSelectedUserId("");
        setResultMeta({ total: 0, returned: 0, truncated: false });
        setState("error");
        setMessage(payload.error ?? "No se pudo cargar perfiles.");
        return;
      }

      const nextProfiles = payload.profiles ?? [];
      setProfiles(nextProfiles);
      setResultMeta({
        total: Number(payload.total ?? nextProfiles.length),
        returned: Number(payload.returned ?? nextProfiles.length),
        truncated: Boolean(payload.truncated),
      });

      setSelectedUserId((current) => {
        if (current && nextProfiles.some((profile) => profile.user_id === current)) return current;
        return nextProfiles[0]?.user_id ?? "";
      });

      setState("idle");
    } catch {
      setProfiles([]);
      setSelectedUserId("");
      setResultMeta({ total: 0, returned: 0, truncated: false });
      setState("error");
      setMessage("No se pudo conectar para cargar perfiles.");
    }
  }

  useEffect(() => {
    void loadProfiles(query, relationTypeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationTypeFilter]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProfiles(query, relationTypeFilter);
  }

  async function handleStartImpersonation() {
    if (!selectedProfile) {
      setState("error");
      setMessage("Selecciona un usuario de la lista.");
      return;
    }

    setState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/admin/debug/impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedProfile.user_id }),
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setState("error");
        setMessage(payload.error ?? "No se pudo activar el modo debug.");
        return;
      }

      setState("success");
      setMessage(payload.message ?? "Modo debug activado.");
      router.push("/mi-cuenta");
      router.refresh();
    } catch {
      setState("error");
      setMessage("No se pudo conectar para activar el modo debug.");
    }
  }

  async function handleStopImpersonation() {
    setState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/admin/debug/impersonation", {
        method: "DELETE",
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setState("error");
        setMessage(payload.error ?? "No se pudo desactivar el modo debug.");
        return;
      }

      setState("success");
      setMessage(payload.message ?? "Modo debug desactivado.");
      router.refresh();
    } catch {
      setState("error");
      setMessage("No se pudo conectar para desactivar el modo debug.");
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-medium text-[#1e293b]">Vista previa como otro usuario</p>
        <p className="mt-1 text-xs text-[#64748b]">
          Solo para debug: selecciona un perfil concreto para replicar su rol y navegacion.
        </p>
      </div>

      <form className="grid gap-3 md:grid-cols-[1fr_200px_auto]" onSubmit={handleSearch}>
        <div className="grid gap-2">
          <label htmlFor="debugUserSearch" className="text-xs font-medium text-[#475467]">
            Buscar perfil
          </label>
          <input
            id="debugUserSearch"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="correo, nombre, apellido o territorio"
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="debugRelationTypeFilter" className="text-xs font-medium text-[#475467]">
            Relation type
          </label>
          <select
            id="debugRelationTypeFilter"
            value={relationTypeFilter}
            onChange={(event) => setRelationTypeFilter(event.target.value as "all" | "sales_force" | "manager")}
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          >
            <option value="all">Todos</option>
            <option value="sales_force">Sales force</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={state === "loading"}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-[#d0d5dd] bg-white px-4 text-sm font-medium text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {state === "loading" ? "Buscando..." : "Buscar"}
        </button>
      </form>

      <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">
            Resultados: {resultMeta.returned} de {resultMeta.total}
          </p>
          {resultMeta.truncated ? (
            <p className="text-xs text-[#b45309]">Refina la busqueda para ver mas coincidencias.</p>
          ) : null}
        </div>

        <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[#e2e8f0] bg-white">
          {profiles.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[#64748b]">
              {state === "loading" ? "Cargando perfiles..." : "No hay perfiles para mostrar."}
            </p>
          ) : (
            profiles.map((profile) => {
              const selected = selectedUserId === profile.user_id;
              return (
                <button
                  key={profile.user_id}
                  type="button"
                  onClick={() => setSelectedUserId(profile.user_id)}
                  className={`grid w-full grid-cols-1 gap-1 border-b border-[#e2e8f0] px-3 py-2 text-left transition last:border-b-0 hover:bg-[#f8fafc] ${
                    selected ? "bg-[#eff6ff]" : "bg-white"
                  }`}
                >
                  <span className="text-sm font-medium text-[#0f172a]">{getDisplayName(profile)}</span>
                  <span className="text-xs text-[#64748b]">
                    {profile.email ?? profile.user_id} | {getRelationLabel(profile.relation_type)} | rol{" "}
                    {profile.global_role ?? "sin-definir"} | {profile.is_active ? "activo" : "inactivo"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleStartImpersonation()}
          disabled={state === "loading" || !selectedProfile}
          className="inline-flex h-10 items-center rounded-lg bg-[linear-gradient(90deg,#002068_0%,#1748a3_100%)] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,32,104,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {selectedProfile ? `Ver como ${getDisplayName(selectedProfile)}` : "Ver como usuario"}
        </button>
        <button
          type="button"
          onClick={() => void handleStopImpersonation()}
          disabled={state === "loading" || !currentImpersonation}
          className="inline-flex h-10 items-center rounded-lg border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-70"
        >
          Salir debug
        </button>
      </div>

      {currentImpersonation ? (
        <p className="text-xs text-[#475467]">
          Activo: {currentImpersonation.email ?? currentImpersonation.userId} | rol{" "}
          {currentImpersonation.globalRole ?? "sin-definir"} |{" "}
          {currentImpersonation.isActive ? "activo" : "inactivo"}
        </p>
      ) : null}

      {state !== "idle" && message ? (
        <p
          className={
            state === "success"
              ? "text-sm text-[#047857]"
              : state === "error"
                ? "text-sm text-[#b42318]"
                : "text-sm text-[#475569]"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
