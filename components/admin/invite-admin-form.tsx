"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

type InviteAdminFormProps = {
  onCompleted?: () => void;
};

export function InviteAdminForm({ onCompleted }: InviteAdminFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function sendInvitation(confirmRoleChange: boolean) {
    setStatus("loading");
    setMessage("");
    setNeedsConfirmation(false);

    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, confirmRoleChange }),
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        code?: string;
      };

      if (response.status === 409 && payload.code === "ROLE_CHANGE_CONFIRM_REQUIRED") {
        setStatus("error");
        setMessage(payload.message ?? "Confirma el cambio de rol a admin.");
        setNeedsConfirmation(true);
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "No se pudo enviar la invitacion.");
        return;
      }

      setStatus("success");
      setMessage(payload.message ?? "Invitacion enviada.");
      setEmail("");
      onCompleted?.();
    } catch {
      setStatus("error");
      setMessage("No se pudo conectar con el servidor.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendInvitation(false);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label htmlFor="inviteAdminEmail" className="text-sm font-medium text-[#1e293b]">
          Correo corporativo a invitar
        </label>
        <input
          id="inviteAdminEmail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nombre@novartis.com o @jelpus.com"
          required
          className="h-11 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm text-[#0f172a] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#dbeafe]"
        />
        <p className="text-xs text-[#64748b]">
          Solo se permiten dominios <code>@novartis.com</code> y <code>@jelpus.com</code>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "loading"}
          className="focus-ring inline-flex h-11 items-center rounded-lg bg-[linear-gradient(90deg,#002068_0%,#1748a3_100%)] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(0,32,104,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(0,32,104,0.28)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? "Enviando..." : "Invitar admin"}
        </button>
        {needsConfirmation ? (
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => void sendInvitation(true)}
            className="focus-ring inline-flex h-11 items-center rounded-lg border border-[#b8c8ea] bg-white px-5 text-sm font-semibold text-[#1e3a8a] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Confirmar cambio de rol
          </button>
        ) : null}
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
