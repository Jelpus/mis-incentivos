"use client";

import { FormEvent, useMemo, useState } from "react";
import { AvatarUpload } from "@/components/profile/avatar-upload";

type ProfileData = {
  email: string;
  firstName: string;
  lastName: string;
  pictureUrl: string;
  globalRole: string | null;
  isActive: boolean;
};

type ProfileFormProps = {
  initialProfile: ProfileData;
  readOnlyMode?: boolean;
};

type Status = "idle" | "saving" | "success" | "error";

function getInitials(firstName: string, lastName: string, email: string) {
  const base = `${firstName} ${lastName}`.trim();
  if (base) {
    return base
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return (email[0] ?? "U").toUpperCase();
}

export function ProfileForm({ initialProfile, readOnlyMode = false }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [pictureUrl, setPictureUrl] = useState(initialProfile.pictureUrl);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const initials = useMemo(
    () => getInitials(firstName, lastName, initialProfile.email),
    [firstName, lastName, initialProfile.email],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyMode) return;
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, pictureUrl }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "No se pudo actualizar el perfil.");
        return;
      }

      setStatus("success");
      setMessage(payload.message ?? "Perfil actualizado.");
    } catch {
      setStatus("error");
      setMessage("No se pudo conectar con el servidor.");
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pictureUrl}
              alt="Foto de perfil"
              className="h-14 w-14 rounded-full border border-[#d0ddf7] object-cover"
            />
          ) : (
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#d0ddf7] bg-[#e9f1ff] text-sm font-semibold text-[#1d4ed8]">
              {initials}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">Perfil personal</p>
            <p className="text-xs text-[#64748b]">Edita solo tus datos permitidos.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="firstName" className="text-sm font-medium text-[#1e293b]">
            Nombre
          </label>
          <input
            id="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={80}
            disabled={readOnlyMode}
            className="h-11 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="lastName" className="text-sm font-medium text-[#1e293b]">
            Apellido
          </label>
          <input
            id="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            maxLength={80}
            disabled={readOnlyMode}
            className="h-11 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>
      </div>

      {!readOnlyMode ? <AvatarUpload value={pictureUrl} onChange={setPictureUrl} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">
            Correo
          </label>
          <p className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm text-[#334155]">
            {initialProfile.email}
          </p>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">
            Rol global
          </label>
          <p className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm text-[#334155]">
            {initialProfile.globalRole ?? "sin definir"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnlyMode ? (
          <button
            type="submit"
            disabled={status === "saving"}
            className="focus-ring inline-flex h-11 items-center rounded-lg bg-[linear-gradient(90deg,#002068_0%,#1748a3_100%)] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(0,32,104,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(0,32,104,0.28)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "saving" ? "Guardando..." : "Guardar cambios"}
          </button>
        ) : (
          <p className="text-sm text-[#475569]">Solo lectura durante el modo debug.</p>
        )}
        {status !== "idle" ? (
          <p
            className={
              status === "success"
                ? "text-sm text-[#047857]"
                : status === "error"
                  ? "text-sm text-[#b42318]"
                  : "text-sm text-[#475569]"
            }
          >
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
