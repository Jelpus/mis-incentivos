// lib/import-engine/cleaners.ts

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanPersonName(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = normalizeWhitespace(String(value));
  if (!text) return null;

  return text
    .toLowerCase()
    .split(" ")
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function cleanEmail(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  return text || null;
}

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = normalizeWhitespace(String(value));
  return text || null;
}

export function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/[^0-9.-]+/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cleanInteger(value: unknown): number | null {
  const num = cleanNumber(value);
  if (num === null) return null;
  return Math.trunc(num);
}

function normalizeTwoDigitYear(value: string): string {
  const year = Number(value);
  if (!Number.isFinite(year)) return value;
  return String(year >= 70 ? 1900 + year : 2000 + year);
}

function isValidDateParts(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;

  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function formatDateParts(year: string, month: string, day: string): string | null {
  const fullYear = year.length === 2 ? normalizeTwoDigitYear(year) : year;
  if (!isValidDateParts(fullYear, month, day)) return null;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function tryParseFlexibleDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const input = String(value).trim();
  if (!input) return null;

  // Excel serial
  if (/^\d+(\.\d+)?$/.test(input)) {
    const num = Number(input);
    if (Number.isFinite(num) && num >= 1 && num <= 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const result = new Date(excelEpoch.getTime() + Math.floor(num) * 86400000);
      return result.toISOString().slice(0, 10);
    }
  }

  const normalized = input.replace(/\./g, "/").replace(/-/g, "/");

  // YYYY/MM/DD (allows 1-2 digit month/day)
  let match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    return formatDateParts(y, m, d);
  }

  // DD/MM/YYYY (allows 1-2 digit day/month)
  match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return formatDateParts(y, m, d);
  }

  // DD/MM/YY (allows 1-2 digit day/month)
  match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, d, m, y] = match;
    return formatDateParts(y, m, d);
  }

  // YYYYMMDD
  match = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return formatDateParts(y, m, d);
  }

  // Fallback only for datetime-like inputs. Date-only strings are intentionally
  // not parsed with `new Date(...)` to avoid timezone day shifts.
  const hasTimeComponent = /[T\s]\d{1,2}:\d{2}/.test(input);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input);
  if (hasTimeComponent || hasTimezone) {
    const date = new Date(input);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return null;
}

export function cleanBooleanLike(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim().toLowerCase();

  if (!text) return null;

  if (["true", "1", "yes", "y", "si", "sí", "vacante", "vacancy"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(text)) {
    return false;
  }

  return null;
}
