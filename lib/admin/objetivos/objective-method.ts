function normalizeScopeMarker(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Brick/cuenta values are national only when the whole cell is a scope marker.
 * Institution names such as "INSTITUTO NACIONAL DE PEDIATRIA" must stay as
 * account/brick assignments.
 */
export function isStandaloneNationalScopeMarker(value: unknown): boolean {
  const normalized = normalizeScopeMarker(value);
  return normalized === "NACIONAL" || normalized === "GLOBAL";
}
