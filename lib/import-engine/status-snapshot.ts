import type { ValidationIssue } from "./validators";

type SnapshotRow = {
  id: string;
  row_number: number;
  cleaned_data: Record<string, unknown>;
};

/** The identity of a Status row is its territory within the selected month. */
export function statusTerritoryKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const key = String(value).trim();
  return key || null;
}

export function getStatusSnapshotDuplicateIssues(
  rows: SnapshotRow[],
  importType: "sales_force_status" | "manager_status",
): Map<string, ValidationIssue[]> {
  const territoryField = importType === "sales_force_status" ? "territorio_individual" : "territorio_manager";
  const fields = importType === "sales_force_status" ? [territoryField, "no_empleado"] : [territoryField];
  const issues = new Map<string, ValidationIssue[]>();

  for (const field of fields) {
    const groups = new Map<string, SnapshotRow[]>();
    for (const row of rows) {
      const key = statusTerritoryKey(row.cleaned_data[field]);
      if (!key) continue;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    for (const [value, group] of groups) {
      if (group.length < 2) continue;
      const people = group.map((row) => {
        const name = row.cleaned_data.nombre_completo ?? row.cleaned_data.nombre_manager ?? "Sin nombre";
        return `${name} (fila ${row.row_number})`;
      }).join(", ");
      const label = field === "no_empleado" ? "número de empleado" : "territorio";
      for (const row of group) {
        const rowIssues = issues.get(row.id) ?? [];
        rowIssues.push({ field, message: `El ${label} «${value}» se repite en el archivo: ${people}. Corrige las filas duplicadas y vuelve a cargar el Excel completo del período.` });
        issues.set(row.id, rowIssues);
      }
    }
  }
  return issues;
}

export function getRetiredStatusTerritories(
  incoming: SnapshotRow[],
  existing: Array<{ id: string; territorio_individual?: string | null; territorio_manager?: string | null }>,
  importType: "sales_force_status" | "manager_status",
) {
  const field = importType === "sales_force_status" ? "territorio_individual" : "territorio_manager";
  const territories = new Set(incoming.map((row) => statusTerritoryKey(row.cleaned_data[field])));
  return existing.filter((record) => !territories.has(statusTerritoryKey(record[field])));
}
