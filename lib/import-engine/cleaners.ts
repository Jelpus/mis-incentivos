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

  // YYYY/MM/DD
  let match = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY
  match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m}-${d}`;
  }

  // YYYYMMDD
  match = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m}-${d}`;
  }

  const date = new Date(input);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
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