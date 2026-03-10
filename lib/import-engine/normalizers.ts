// lib/import-engine/normalizers.ts

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeHeaderText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function isMeaningfulText(value: unknown): boolean {
  const text = cellToString(value);
  if (!text) return false;

  // evita filas donde casi todo son números sueltos
  const letters = text.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "");
  return letters.length > 0;
}