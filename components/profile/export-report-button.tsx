"use client";

import { useState } from "react";

export function ExportReportButton() {
  const [isPreparing, setIsPreparing] = useState(false);

  async function handleExport() {
    setIsPreparing(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    window.print();
    setTimeout(() => setIsPreparing(false), 250);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isPreparing}
      className="no-print inline-flex items-center rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#334155] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isPreparing ? "Preparing..." : "Export Report"}
    </button>
  );
}
