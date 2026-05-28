"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type RelationTypeFilter = "all" | "sales_force" | "manager";
type RequestState = "idle" | "loading" | "success" | "error";
type ActionType = "search" | "start" | "stop" | null;

type ResultMeta = {
  total: number;
  returned: number;
  truncated: boolean;
};

const RELATION_FILTERS: Array<{ value: RelationTypeFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "sales_force", label: "Sales force" },
  { value: "manager", label: "Manager" },
];

const INITIAL_RESULT_META: ResultMeta = { total: 0, returned: 0, truncated: false };

function getDisplayName(profile: ProfileOption) {
  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return fullName || profile.email || profile.user_id;
}

function getInitials(profile: ProfileOption) {
  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  const source = fullName || profile.email || profile.user_id;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getRelationLabel(value: ProfileOption["relation_type"]) {
  if (value === "sales_force") return "Sales force";
  if (value === "manager") return "Manager";
  return "Sin relación";
}

function getProfileSearchText(profile: ProfileOption) {
  return [
    profile.user_id,
    profile.email,
    profile.first_name,
    profile.last_name,
    profile.global_role,
    profile.relation_type,
    profile.is_active ? "activo" : "inactivo",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "brand" }) {
  const toneClass = {
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    brand: "border-blue-200 bg-blue-50 text-blue-700",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function ProfileSkeletonList() {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ImpersonationDebugCard({ currentImpersonation }: ImpersonationDebugCardProps) {
  const router = useRouter();
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(currentImpersonation?.userId ?? "");
  const [relationTypeFilter, setRelationTypeFilter] = useState<RelationTypeFilter>("all");
  const [state, setState] = useState<RequestState>("idle");
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [message, setMessage] = useState("");
  const [resultMeta, setResultMeta] = useState<ResultMeta>(INITIAL_RESULT_META);

  const isLoading = state === "loading";
  const isSearching = isLoading && activeAction === "search";
  const isStarting = isLoading && activeAction === "start";
  const isStopping = isLoading && activeAction === "stop";

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.user_id === selectedUserId) ?? null,
    [profiles, selectedUserId],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const locallyRankedProfiles = useMemo(() => {
    if (!normalizedQuery) return profiles;

    return [...profiles].sort((first, second) => {
      const firstDisplayName = getDisplayName(first).toLowerCase();
      const secondDisplayName = getDisplayName(second).toLowerCase();
      const firstStartsWith = firstDisplayName.startsWith(normalizedQuery) ? 0 : 1;
      const secondStartsWith = secondDisplayName.startsWith(normalizedQuery) ? 0 : 1;

      if (firstStartsWith !== secondStartsWith) return firstStartsWith - secondStartsWith;
      return firstDisplayName.localeCompare(secondDisplayName);
    });
  }, [normalizedQuery, profiles]);

  const loadProfiles = useCallback(
    async (searchTerm = query, relationType: RelationTypeFilter = relationTypeFilter) => {
      searchAbortControllerRef.current?.abort();

      const abortController = new AbortController();
      searchAbortControllerRef.current = abortController;

      setState("loading");
      setActiveAction("search");
      setMessage("");

      try {
        const params = new URLSearchParams({
          q: searchTerm.trim(),
          relation_type: relationType,
          limit: "1000",
        });

        const response = await fetch(`/api/admin/debug/users?${params.toString()}`, {
          cache: "no-store",
          signal: abortController.signal,
        });

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
          setResultMeta(INITIAL_RESULT_META);
          setState("error");
          setActiveAction(null);
          setMessage(payload.error ?? "No se pudieron cargar los perfiles.");
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
          if (currentImpersonation?.userId && nextProfiles.some((profile) => profile.user_id === currentImpersonation.userId)) {
            return currentImpersonation.userId;
          }
          return nextProfiles[0]?.user_id ?? "";
        });

        setState("idle");
        setActiveAction(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        setProfiles([]);
        setSelectedUserId("");
        setResultMeta(INITIAL_RESULT_META);
        setState("error");
        setActiveAction(null);
        setMessage("No se pudo conectar para cargar los perfiles.");
      }
    },
    [currentImpersonation?.userId, query, relationTypeFilter],
  );

  useEffect(() => {
    const debounceTimeout = window.setTimeout(() => {
      void loadProfiles(query, relationTypeFilter);
    }, 350);

    return () => {
      window.clearTimeout(debounceTimeout);
      searchAbortControllerRef.current?.abort();
    };
  }, [loadProfiles, query, relationTypeFilter]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProfiles(query, relationTypeFilter);
  }

  async function handleStartImpersonation() {
    if (!selectedProfile) {
      setState("error");
      setMessage("Selecciona un usuario de la lista antes de continuar.");
      return;
    }

    setState("loading");
    setActiveAction("start");
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
        setActiveAction(null);
        setMessage(payload.error ?? "No se pudo activar el modo debug.");
        return;
      }

      setState("success");
      setActiveAction(null);
      setMessage(payload.message ?? "Modo debug activado correctamente.");
      router.push("/mi-cuenta");
      router.refresh();
    } catch {
      setState("error");
      setActiveAction(null);
      setMessage("No se pudo conectar para activar el modo debug.");
    }
  }

  async function handleStopImpersonation() {
    setState("loading");
    setActiveAction("stop");
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
        setActiveAction(null);
        setMessage(payload.error ?? "No se pudo desactivar el modo debug.");
        return;
      }

      setState("success");
      setActiveAction(null);
      setMessage(payload.message ?? "Modo debug desactivado correctamente.");
      router.refresh();
    } catch {
      setState("error");
      setActiveAction(null);
      setMessage("No se pudo conectar para desactivar el modo debug.");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_35%),linear-gradient(135deg,#f8fbff_0%,#ffffff_52%,#f8fafc_100%)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-blue-700">Debug tools</p>
              {currentImpersonation ? <Badge tone="warning">Impersonación activa</Badge> : <Badge tone="neutral">Sin impersonación</Badge>}
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Vista previa como otro usuario</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Busca un perfil, valida su estado y replica su experiencia para revisar permisos, navegación y contenido asignado.
            </p>
          </div>

          {currentImpersonation ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm lg:min-w-[280px]">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Sesión actual</p>
              <p className="mt-1 truncate font-semibold">{currentImpersonation.email ?? currentImpersonation.userId}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="warning">Rol {currentImpersonation.globalRole ?? "sin definir"}</Badge>
                <Badge tone={currentImpersonation.isActive ? "success" : "warning"}>
                  {currentImpersonation.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]" onSubmit={handleSearch}>
          <div className="grid gap-2">
            <label htmlFor="debugUserSearch" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Buscar perfil
            </label>
            <div className="relative">
              <input
                id="debugUserSearch"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Correo, nombre, apellido, rol o territorio"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              {isSearching ? (
                <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
              ) : null}
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="debugRelationTypeFilter" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Relación
            </label>
            <select
              id="debugRelationTypeFilter"
              value={relationTypeFilter}
              onChange={(event) => setRelationTypeFilter(event.target.value as RelationTypeFilter)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              {RELATION_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isSearching}
            className="inline-flex h-11 items-center justify-center self-end rounded-xl border border-slate-200 bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
          >
            {isSearching ? "Buscando..." : "Buscar"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultados</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {resultMeta.returned} de {resultMeta.total} perfiles
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {resultMeta.truncated ? <Badge tone="warning">Refina la búsqueda para ver más coincidencias</Badge> : null}
              {normalizedQuery ? <Badge tone="brand">Filtro: {query.trim()}</Badge> : null}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-inner" role="listbox" aria-label="Perfiles disponibles">
            {isSearching && profiles.length === 0 ? (
              <ProfileSkeletonList />
            ) : locallyRankedProfiles.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-800">No hay perfiles para mostrar</p>
                <p className="mt-1 text-sm text-slate-500">Prueba con otro término de búsqueda o cambia el tipo de relación.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {locallyRankedProfiles.map((profile) => {
                  const selected = selectedUserId === profile.user_id;
                  const profileSearchText = getProfileSearchText(profile);
                  const isExactMatch = normalizedQuery ? profileSearchText.includes(normalizedQuery) : true;

                  return (
                    <button
                      key={profile.user_id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setSelectedUserId(profile.user_id)}
                      className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition focus:outline-none focus:ring-4 focus:ring-inset focus:ring-blue-100 ${
                        selected ? "bg-blue-50/90" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                          selected ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                        }`}
                      >
                        {getInitials(profile)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-950">{getDisplayName(profile)}</span>
                          {selected ? <Badge tone="brand">Seleccionado</Badge> : null}
                          {!isExactMatch && normalizedQuery ? <Badge tone="neutral">Coincidencia relacionada</Badge> : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{profile.email ?? profile.user_id}</span>
                        <span className="mt-2 flex flex-wrap gap-2">
                          <Badge tone="neutral">{getRelationLabel(profile.relation_type)}</Badge>
                          <Badge tone="brand">Rol {profile.global_role ?? "sin definir"}</Badge>
                          <Badge tone={profile.is_active ? "success" : "warning"}>{profile.is_active ? "Activo" : "Inactivo"}</Badge>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">Acción de depuración</p>
              <p className="mt-1 text-sm text-slate-500">
                {selectedProfile
                  ? `Listo para previsualizar como ${getDisplayName(selectedProfile)}.`
                  : "Selecciona un perfil para activar la previsualización."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleStartImpersonation()}
                disabled={isLoading || !selectedProfile}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(90deg,#002068_0%,#1748a3_100%)] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,32,104,0.20)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
              >
                {isStarting ? "Activando..." : selectedProfile ? `Ver como ${getDisplayName(selectedProfile)}` : "Ver como usuario"}
              </button>

              <button
                type="button"
                onClick={() => void handleStopImpersonation()}
                disabled={isLoading || !currentImpersonation}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStopping ? "Saliendo..." : "Salir debug"}
              </button>
            </div>
          </div>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {state !== "idle" && message ? (
            <p
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                state === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : state === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
