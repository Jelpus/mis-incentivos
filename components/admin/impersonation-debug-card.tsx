"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProfileOption = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  global_role: string | null;
  is_active: boolean;
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

export function ImpersonationDebugCard({ currentImpersonation }: ImpersonationDebugCardProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(currentImpersonation?.userId ?? "");
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  async function loadProfiles(searchTerm = "") {
    setState("loading");
    setMessage("");
    try {
      const encoded = encodeURIComponent(searchTerm);
      const response = await fetch(`/api/admin/debug/users?q=${encoded}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        profiles?: ProfileOption[];
        error?: string;
      };

      if (!response.ok) {
        setProfiles([]);
        setState("error");
        setMessage(payload.error ?? "No se pudo cargar perfiles.");
        return;
      }

      const nextProfiles = payload.profiles ?? [];
      setProfiles(nextProfiles);

      if (!selectedUserId && nextProfiles.length > 0) {
        setSelectedUserId(nextProfiles[0].user_id);
      }

      setState("idle");
    } catch {
      setProfiles([]);
      setState("error");
      setMessage("No se pudo conectar para cargar perfiles.");
    }
  }

  useEffect(() => {
    void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProfiles(query);
  }

  async function handleStartImpersonation() {
    if (!selectedUserId) {
      setState("error");
      setMessage("Selecciona un usuario.");
      return;
    }

    setState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/admin/debug/impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
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
          Solo para debug: replica rol y vistas de navegacion del perfil seleccionado.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={handleSearch}>
        <div className="grid min-w-[220px] flex-1 gap-2">
          <label htmlFor="debugUserSearch" className="text-xs font-medium text-[#475467]">
            Buscar perfil
          </label>
          <input
            id="debugUserSearch"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="correo, nombre o apellido"
            className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>
        <button
          type="submit"
          disabled={state === "loading"}
          className="focus-ring inline-flex h-10 items-center rounded-lg border border-[#d0d5dd] bg-white px-4 text-sm font-medium text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-70"
        >
          Buscar
        </button>
      </form>

      <div className="grid gap-2">
        <label htmlFor="debugProfileSelect" className="text-xs font-medium text-[#475467]">
          Usuario objetivo
        </label>
        <select
          id="debugProfileSelect"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          className="h-10 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
        >
          {profiles.map((profile) => (
            <option key={profile.user_id} value={profile.user_id}>
              {`${getDisplayName(profile)} | rol ${profile.global_role ?? "sin-definir"} | ${profile.is_active ? "activo" : "inactivo"}`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleStartImpersonation()}
          disabled={state === "loading" || !selectedUserId}
          className="focus-ring inline-flex h-10 items-center rounded-lg bg-[linear-gradient(90deg,#002068_0%,#1748a3_100%)] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(0,32,104,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Ver como usuario
        </button>
        <button
          type="button"
          onClick={() => void handleStopImpersonation()}
          disabled={state === "loading" || !currentImpersonation}
          className="focus-ring inline-flex h-10 items-center rounded-lg border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-70"
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
