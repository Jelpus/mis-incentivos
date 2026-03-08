"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  getAllowedDomainsText,
  isAllowedEmailDomain,
  normalizeEmail,
} from "@/lib/auth/email-domain";

type Status = "idle" | "loading" | "success" | "error";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const helperText = useMemo(
    () => `Solo se permiten cuentas ${getAllowedDomainsText()}.`,
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeEmail(email);

    if (!normalized || !normalized.includes("@")) {
      setStatus("error");
      setMessage("Ingresa un correo valido.");
      return;
    }

    if (!isAllowedEmailDomain(normalized)) {
      setStatus("error");
      setMessage(helperText);
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });

      const rawPayload = await response.text();
      let payload: { message?: string; error?: string } = {};

      if (rawPayload) {
        try {
          payload = JSON.parse(rawPayload) as { message?: string; error?: string };
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? `No se pudo iniciar sesion (HTTP ${response.status}).`);
        return;
      }

      setStatus("success");
      setMessage(payload.message ?? "Revisa tu correo para ingresar.");
    } catch {
      setStatus("error");
      setMessage("No se pudo conectar con el servidor. Intenta de nuevo.");
    }
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm font-medium text-[#101828]">
          Correo corporativo
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nombre@novartis.com"
          autoComplete="email"
          className="h-11 w-full rounded-lg border border-[#d0d5dd] bg-white px-4 text-[#101828] placeholder:text-[#98a2b3] shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:border-[#002068] focus:outline-none focus:ring-4 focus:ring-[#dbe7ff]"
        />
      </div>

      <p className="text-xs leading-5 text-[#667085]">{helperText}</p>

      {status !== "idle" ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : status === "error"
                ? "bg-red-50 text-red-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {status === "loading" ? "Enviando enlace de acceso..." : message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="focus-ring h-11 rounded-lg bg-[linear-gradient(90deg,#002068_0%,#14347d_100%)] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(0,32,104,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,32,104,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "loading" ? "Enviando..." : "Enviar enlace de acceso"}
      </button>
    </form>
  );
}
