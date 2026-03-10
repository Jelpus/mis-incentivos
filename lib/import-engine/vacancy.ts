export function inferVacancyFromName(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  const text = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!text) return false;

  return /\b(vacante|vacancy|vacant)\b/.test(text);
}