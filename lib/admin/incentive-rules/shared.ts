export function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function normalizePeriodMonthInput(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}

export function formatPeriodMonthForInput(periodMonth: string): string {
  return periodMonth.slice(0, 7);
}

export function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;

  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}
