"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type Status = "loading" | "ok" | "ko";

type HealthResponse = {
  ok?: boolean;
  message?: string;
};

export function BigQueryConnectionIndicator() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Validando BigQuery...");

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const response = await fetch("/api/admin/data-sources/bigquery-health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        const payload = (await response.json()) as HealthResponse;
        if (!mounted) return;

        if (response.ok && payload.ok) {
          setStatus("ok");
          setMessage(payload.message ?? "BigQuery conectado.");
          return;
        }

        setStatus("ko");
        setMessage(payload.message ?? "No fue posible validar BigQuery.");
      } catch (error) {
        if (!mounted) return;
        setStatus("ko");
        setMessage(
          error instanceof Error ? `Error BigQuery: ${error.message}` : "Error al validar BigQuery.",
        );
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <span
      title={message}
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        status === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "ko" && "border-red-200 bg-red-50 text-red-700",
        status === "loading" && "border-neutral-200 bg-neutral-50 text-neutral-600",
      )}
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          status === "ok" && "bg-emerald-500",
          status === "ko" && "bg-red-500",
          status === "loading" && "animate-pulse bg-neutral-400",
        )}
      />
      <span>{status === "ok" ? "BQ OK" : status === "ko" ? "BQ KO" : "BQ..."}</span>
    </span>
  );
}
