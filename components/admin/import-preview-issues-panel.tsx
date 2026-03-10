"use client";

import { useState } from "react";
import type { ImportPreviewRow } from "@/lib/admin/status/get-import-batch-preview";
import { ImportPreviewIssues } from "@/components/admin/import-preview-issues";

type Props = {
  rows: ImportPreviewRow[];
  issuesCount: number;
  initialOpen?: boolean;
};

export function ImportPreviewIssuesPanel({
  rows,
  issuesCount,
  initialOpen = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const hasIssues = issuesCount > 0;

  return (
    <section
      className={`rounded-3xl border bg-white p-5 shadow-sm ${
        hasIssues ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className={`text-sm font-semibold ${
            hasIssues ? "text-red-700" : "text-neutral-900"
          }`}
        >
          Ver incidencias detectadas ({issuesCount})
        </p>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className={`inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-medium ${
            hasIssues
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          }`}
        >
          {isOpen ? "Contraer" : "Expandir"}
        </button>
      </div>

      {isOpen ? (
        <div className="mt-4">
          <ImportPreviewIssues rows={rows} />
        </div>
      ) : null}
    </section>
  );
}
