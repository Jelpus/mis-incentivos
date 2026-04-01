"use client";

import { useState } from "react";
import clsx from "clsx";

type Status = "idle" | "loading" | "ok" | "ko";

type HealthResponse = {
  ok?: boolean;
  message?: string;
};

export function BigQueryConnectionIndicator() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Valida la conexion de BigQuery bajo demanda.");

  async function handleValidate() {
    setStatus("loading");
    setMessage("Validando BigQuery...");
    try {
      const response = await fetch("/api/admin/data-sources/bigquery-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const payload = (await response.json()) as HealthResponse;

      if (response.ok && payload.ok) {
        setStatus("ok");
        setMessage(payload.message ?? "BigQuery conectado.");
        return;
      }

      setStatus("ko");
      setMessage(payload.message ?? "No fue posible validar BigQuery.");
    } catch (error) {
      setStatus("ko");
      setMessage(
        error instanceof Error ? `Error BigQuery: ${error.message}` : "Error al validar BigQuery.",
      );
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleValidate()}
      title={message}
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        status === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        status === "ko" && "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
        (status === "loading" || status === "idle") &&
          "border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100",
      )}
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          status === "ok" && "bg-emerald-500",
          status === "ko" && "bg-red-500",
          (status === "loading" || status === "idle") && "animate-pulse bg-neutral-400",
        )}
      />
      <span>
        {status === "ok"
          ? "BQ OK"
          : status === "ko"
            ? "BQ KO"
            : status === "loading"
              ? "BQ..."
              : "Validar BQ"}
      </span>
    </button>
  );
}
