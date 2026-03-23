export function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function normalizeLegacyPeriodCode(value: string): string | null {
  const legacyMatch = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (!legacyMatch) return null;

  const rawCode = Number(legacyMatch[1]);
  const year = Number(legacyMatch[2]);
  if (!Number.isFinite(rawCode) || !Number.isFinite(year)) return null;

  let month: number | null = null;
  if (rawCode >= 1 && rawCode <= 12) {
    month = rawCode;
  } else if (rawCode >= 13 && rawCode <= 15) {
    // Legacy period codification used in historical loads (13,14,15 => Oct,Nov,Dec)
    month = rawCode - 3;
  }

  if (!month) return null;

  return `${year}-${String(month).padStart(2, "0")}-01`;
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

  const normalizedLegacy = normalizeLegacyPeriodCode(raw);
  if (normalizedLegacy) {
    return normalizedLegacy;
  }

  return null;
}

export function formatPeriodMonthForInput(periodMonth: string): string {
  const normalized = normalizePeriodMonthInput(periodMonth);
  if (normalized) return normalized.slice(0, 7);
  return periodMonth.slice(0, 7);
}

export function formatPeriodMonthLabel(value: string | null | undefined): string {
  if (!value) return "-";

  const normalized = normalizePeriodMonthInput(value);
  if (!normalized) return String(value);

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return String(value);
  }

  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function normalizeSourceFileCode(value: unknown): string {
  const raw = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!raw) return "";

  return raw
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function sanitizeStoragePathChunk(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;

  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  const missingRelationByMessage =
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("could not find the table");

  return code === "42P01" || code === "PGRST205" || missingRelationByMessage;
}

export function getMissingRelationName(
  error: { message?: string } | null,
): string | null {
  if (!error) return null;
  const message = String(error.message ?? "");

  const relationMatch = message.match(/relation\s+"?([a-zA-Z0-9_.]+)"?\s+does not exist/i);
  if (relationMatch?.[1]) {
    const value = relationMatch[1];
    return value.includes(".") ? value.split(".").pop() ?? value : value;
  }

  const tableMatch = message.match(/table\s+['"]([^'"]+)['"]/i);
  if (tableMatch?.[1]) {
    const value = tableMatch[1];
    return value.includes(".") ? value.split(".").pop() ?? value : value;
  }

  return null;
}
